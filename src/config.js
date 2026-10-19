import { resolve } from 'node:path';
export function loadConfig() {
  for (const key of ['PROJECT_ROOT','SUPPORT_API_TOKEN']) if (!process.env[key]?.trim()) throw new Error('Set '+key);
  if (process.env.SUPPORT_API_TOKEN.length < 32) throw new Error('SUPPORT_API_TOKEN must contain at least 32 characters');
  return { projectRoot:resolve(process.env.PROJECT_ROOT), dataDir:resolve(process.env.SUPPORT_DATA_DIR || './data'), apiKey:process.env.GEMINI_API_KEY?.trim() || process.env.LLM_API_KEY?.trim(),
    baseUrl:process.env.LLM_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta/openai', model:process.env.LLM_MODEL || 'gemini-2.5-flash',
    demoEnabled:process.env.SUPPORT_DEMO_ENABLED === 'true',
    token:process.env.SUPPORT_API_TOKEN, host:process.env.HOST || '127.0.0.1', port:Number(process.env.PORT || 8091) };
}
