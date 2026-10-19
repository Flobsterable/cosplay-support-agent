import { createServer } from 'node:http';
import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { z } from 'zod';
const inputSchema=z.object({userId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),ticketId:z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).optional(),message:z.string().trim().min(1).max(4000),conversationId:z.string().uuid().optional()}).strict();
const digest=s=>createHash('sha256').update(s).digest();
export function createSupportServer({token,chat,demoEnabled=false,ready=()=>true,now=()=>Date.now()}) {
  if(typeof token!=='string'||token.length<32)throw new Error('A strong API token is required');
  const conversations=new Map(),busy=new Set(),rates=new Map(),sessions=new Map(),sessionRates=new Map();
  return createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    if(req.url==='/health'&&req.method==='GET')return send(200,{status:'ok',modelConfigured:ready(),demoEnabled});
    for(const [key,value] of sessions)if(value.expires<=now())sessions.delete(key);
    for(const [key,value] of sessionRates)if(value.until<=now())sessionRates.delete(key);
    if(req.url==='/v1/sessions'&&req.method==='POST') {
      if(!demoEnabled)return send(404,{error:'demo_disabled'});
      if(!ready())return send(503,{error:'model_not_configured'});
      const address=req.socket.remoteAddress;
      const rate=sessionRates.get(address)||{count:0,until:now()+60000};
      if(!sessionRates.has(address)&&sessionRates.size>=1000)return send(503,{error:'busy'});
      rate.count++;sessionRates.set(address,rate);
      if(rate.count>10)return send(429,{error:'rate_limited'});
      if(sessions.size>=200)return send(503,{error:'busy'});
      const sessionToken=randomUUID()+randomUUID();
      sessions.set(digest(sessionToken).toString('hex'),{expires:now()+30*60000});
      return send(201,{token:sessionToken,expiresIn:1800,mode:'demo'});
    }
    if(req.url!=='/v1/chat'||req.method!=='POST')return send(404,{error:'not_found'});
    const auth=req.headers.authorization || '';
    const credential=auth.startsWith('Bearer ')?auth.slice(7):'';
    const session=demoEnabled?sessions.get(digest(credential).toString('hex')):null;
    if(!auth.startsWith('Bearer ')||(!session&&!timingSafeEqual(digest(credential),digest(token))))return send(401,{error:'unauthorized'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'json_required'});
    let input;
    try {
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>16384){const e=new Error();e.status=413;throw e;}chunks.push(chunk);}
      const body=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(session) {
        // Demo credentials can never select a user or inspect a real ticket.
        if('userId' in body||'ticketId' in body)throw new Error('Demo identity is server-owned');
        input=inputSchema.parse({...body,userId:'demo-app'});
      } else input=inputSchema.parse(body);
    } catch(e){return send(e.status===413?413:400,{error:e.status===413?'body_too_large':'invalid_request'});}
    if(!ready())return send(503,{error:'model_not_configured'});
    // Each anonymous session owns its history, while all demo users share a rate budget.
    const owner=session?digest(credential).toString('hex'):input.userId;
    const time=now();
    for(const [id,c] of conversations)if(c.expires<=time)conversations.delete(id);
    for(const [id,r] of rates)if(r.until<=time)rates.delete(id);
    if(!rates.has(input.userId)&&rates.size>=1000)return send(503,{error:'busy'});
    const rate=rates.get(input.userId)||{count:0,until:time+60000};rate.count++;rates.set(input.userId,rate);
    if(rate.count>10)return send(429,{error:'rate_limited'});
    if(busy.has(input.userId)||busy.size>=2)return send(429,{error:'busy'});
    const existing=input.conversationId?conversations.get(input.conversationId):null;
    if(input.conversationId&&(!existing||existing.owner!==owner||existing.ticketId!==input.ticketId))return send(404,{error:'conversation_not_found'});
    if(!existing&&conversations.size>=200)return send(503,{error:'busy'});
    busy.add(input.userId);
    try {
      const result=await chat({...input,history:existing?.history || []});
      const id=input.conversationId||randomUUID();
      conversations.set(id,{owner,ticketId:input.ticketId,expires:now()+30*60000,history:[...(existing?.history||[]),{role:'user',content:input.message},{role:'assistant',content:result.answer}].slice(-12)});
      return send(200,{conversationId:id,...result});
    }catch(e){return send(e.status===404?404:502,{error:e.status===404?'context_not_found':'support_unavailable'});}
    finally{busy.delete(input.userId);}
  });
}
