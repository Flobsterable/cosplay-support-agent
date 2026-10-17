import { loadConfig } from './config.js';
import { answerSupport } from './support.js';
const args=process.argv.slice(2),userId=args.shift(),ticketId=args.shift(),message=args.join(' ');
if(!userId||!ticketId||!message){console.error('npm run ask -- USER_ID TICKET_ID "Вопрос" (use - for no ticket)');process.exit(1);}
try{console.log(JSON.stringify(await answerSupport(loadConfig(),{userId,ticketId:ticketId==='-'?undefined:ticketId,message}),null,2));}
catch{console.error('Support request failed; check context, model and configuration.');process.exitCode=1;}
