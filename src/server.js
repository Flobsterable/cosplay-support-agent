import { loadConfig } from './config.js';
import { answerSupport } from './support.js';
import { createSupportServer } from './http.js';
const config=loadConfig();
const server=createSupportServer({token:config.token,chat:input=>answerSupport(config,input)});
server.requestTimeout=30000;server.headersTimeout=10000;
server.listen(config.port,config.host,()=>console.log('Support API listening on '+config.host+':'+config.port));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),10000).unref();});
