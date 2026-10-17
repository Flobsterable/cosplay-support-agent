import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fileURLToPath } from 'node:url';
export async function connectContext(root,userId) {
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(path|systemroot|windir|temp|tmp|home|userprofile|lang)$/i.test(k)));
  const transport=new StdioClientTransport({command:process.execPath,args:[fileURLToPath(new URL('./mcp-server.js',import.meta.url)),root,userId],env,stderr:'inherit'});
  const client=new Client({name:'support-agent',version:'0.1.0'});
  try{await client.connect(transport);}catch(e){await transport.close();throw e;}
  return {async call(name,args={}){const r=await client.callTool({name,arguments:args});if(r.isError)throw new Error('MCP context unavailable');return JSON.parse(r.content.find(c=>c.type==='text').text);},close:()=>client.close()};
}
