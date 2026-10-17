import { readFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
export class ContextError extends Error { constructor(message, status=404) { super(message); this.status=status; } }
async function json(root, name) {
  const path=resolve(root,name), stat=await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size>1024*1024) throw new Error('Invalid context store');
  const value=JSON.parse(await readFile(path,'utf8'));
  if (!Array.isArray(value)) throw new Error('Context store must be an array');
  return value;
}
const text=value=>String(value || '').slice(0,4000);
export async function loadUserContext(root,userId) {
  const user=(await json(root,'users.json')).find(u=>u.id===userId);
  if (!user) throw new ContextError('User context not found');
  return {id:user.id,platform:text(user.platform),appVersion:text(user.appVersion),locale:text(user.locale),device:text(user.device)};
}
export async function listTickets(root,userId) {
  await loadUserContext(root,userId);
  return (await json(root,'tickets.json')).filter(t=>t.userId===userId).map(t=>({id:t.id,status:text(t.status),subject:text(t.subject)}));
}
export async function loadTicket(root,userId,ticketId) {
  await loadUserContext(root,userId);
  const t=(await json(root,'tickets.json')).find(t=>t.id===ticketId && t.userId===userId);
  if (!t) throw new ContextError('Ticket context not found');
  // Explicit projection: customer/contact/private internal fields never reach the model.
  const d=t.diagnostics || {};
  return {id:t.id,status:text(t.status),subject:text(t.subject),description:text(t.description),diagnostics:{
    isFallback:typeof d.isFallback==='boolean'?d.isFallback:null,networkError:text(d.networkError),selectedYear:Number.isInteger(d.selectedYear)?d.selectedYear:null,updateAction:text(d.updateAction)
  }};
}
