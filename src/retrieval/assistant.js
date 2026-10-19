export async function complete(config, messages, fetchImpl = fetch, json = false, maxTokens = 1400) {
  if (!config.apiKey || !config.model) {
    throw new Error('Задайте GEMINI_API_KEY в окружении бэкенда поддержки.');
  }
  const url = new URL(config.baseUrl.replace(/\/$/, '') + '/chat/completions');
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('LLM_BASE_URL должен быть HTTP(S) URL.');
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Для внешнего API используйте HTTPS.');
  }
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(60000),
    body: JSON.stringify({
      model: config.model,
      ...(url.hostname === 'generativelanguage.googleapis.com' ? { reasoning_effort: config.model.startsWith('gemini-2.5-flash') ? 'none' : 'low' } : {}),
      ...(url.hostname === 'api.deepseek.com' ? { thinking: { type: 'disabled' } } : {}),
      temperature: 0.2,
      max_tokens: maxTokens,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      messages
    })
  });
  if (!response.ok) throw new Error(`API модели вернул HTTP ${response.status}. Проверьте ключ, модель, баланс и LLM_BASE_URL.`);
  const data = await response.json();
  if (data.choices?.[0]?.finish_reason === 'length') throw new Error('Ответ модели обрезан лимитом токенов. Уменьшите задачу или диапазон diff.');
  const answer = data.choices?.[0]?.message?.content;
  if (typeof answer !== 'string' || !answer.trim()) throw new Error('API модели вернул пустой ответ.');
  return answer;
}
