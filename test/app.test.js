import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupportServer } from '../src/http.js';
import { complete } from '../src/retrieval/assistant.js';
import { loadConfig } from '../src/config.js';

const token = 'server-only-test-token-at-least-32-characters';
async function api(t, options = {}) {
  const calls = [];
  const server = createSupportServer({token, demoEnabled:true, chat:async input => {
    calls.push(input);
    return {answer:'Ответ [D1]',sources:[{id:'D1',path:'docs/support-faq.md'}],needsHuman:false};
  },...options});
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
  const request = (path, body = {}, credential) => fetch(`http://127.0.0.1:${server.address().port}${path}`, {
    method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:`Bearer ${credential}`}:{})},body:JSON.stringify(body)
  });
  return {calls,request,session:async()=> (await (await request('/v1/sessions')).json()).token};
}

test('app sessions bind synthetic identity, retain history, isolate sessions and reject identity spoofing',async t=>{
  const {request,session,calls}=await api(t);
  const a=await session(),b=await session();
  assert.notEqual(a,b);
  const first=await (await request('/v1/chat',{message:'first'},a)).json();
  assert.equal(calls[0].userId,'demo-app');
  assert.equal((await request('/v1/chat',{message:'spoof',userId:'u1'},a)).status,400);
  assert.equal((await request('/v1/chat',{message:'spoof',ticketId:'t1'},a)).status,400);
  assert.equal((await request('/v1/chat',{message:'steal',conversationId:first.conversationId},b)).status,404);
  assert.equal((await request('/v1/chat',{message:'next',conversationId:first.conversationId},a)).status,200);
  assert.equal(calls[1].history[0].content,'first');
});

test('sessions are opt-in, expire, and missing model key has an actionable error',async t=>{
  const disabled=await api(t,{demoEnabled:false});
  assert.equal((await disabled.request('/v1/sessions')).status,404);
  const unconfigured=await api(t,{ready:()=>false});
  const response=await unconfigured.request('/v1/sessions');
  assert.equal(response.status,503);
  assert.equal((await response.json()).error,'model_not_configured');
  let now=0;
  const expiring=await api(t,{now:()=>now});
  const credential=await expiring.session();
  now=30*60000+1;
  assert.equal((await expiring.request('/v1/chat',{message:'hi'},credential)).status,401);
});

test('anonymous traffic is bounded across sessions',async t=>{
  const {request,session}=await api(t);
  const credential=await session();
  for(let i=0;i<10;i++)assert.equal((await request('/v1/chat',{message:'hi'},credential)).status,200);
  assert.equal((await request('/v1/chat',{message:'hi'},credential)).status,429);
  for(let i=0;i<9;i++)assert.equal((await request('/v1/sessions')).status,201);
  assert.equal((await request('/v1/sessions')).status,429);
});

test('Gemini defaults allow startup without a key; credentials stay in backend configuration',()=>{
  const saved={...process.env};
  try {
    for(const name of ['GEMINI_API_KEY','LLM_API_KEY','LLM_MODEL','LLM_BASE_URL'])delete process.env[name];
    process.env.PROJECT_ROOT='.';process.env.SUPPORT_API_TOKEN=token;
    const config=loadConfig();
    assert.equal(config.apiKey,undefined);
    assert.equal(config.model,'gemini-2.5-flash');
    assert.equal(config.baseUrl,'https://generativelanguage.googleapis.com/v1beta/openai');
    process.env.GEMINI_API_KEY='gemini-secret';process.env.LLM_API_KEY='old-secret';
    assert.equal(loadConfig().apiKey,'gemini-secret');
  } finally {process.env=saved;}
});

test('Gemini completion uses compatible endpoint, bearer key and JSON output; errors redact secrets',async()=>{
  const config={apiKey:'fake-secret',model:'gemini-2.5-flash',baseUrl:'https://generativelanguage.googleapis.com/v1beta/openai/'};
  const result=await complete(config,[{role:'user',content:'hello'}],async(url,init)=>{
    assert.equal(String(url),'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions');
    assert.equal(init.headers.Authorization,'Bearer fake-secret');
    const body=JSON.parse(init.body);
    assert.equal(body.model,config.model);
    assert.equal(body.response_format.type,'json_object');
    return new Response(JSON.stringify({choices:[{message:{content:'{"answer":"ok"}'}}]}));
  },true);
  assert.equal(JSON.parse(result).answer,'ok');
  await assert.rejects(complete(config,[],async()=>new Response('fake-secret',{status:401})),e=>!e.message.includes('fake-secret'));
});
