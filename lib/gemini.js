/**
 * Google Gemini API (JSON). Wymaga GEMINI_API_KEY w .env
 * Przy błędzie limitu / niedostępnym modelu próbuje kolejne modele z free tier.
 */

/** Domyślna kolejność (free tier, osobne limity RPM/RPD na model) */
const DEFAULT_FREE_TIER_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-2.5-pro'
];

function parseModelList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniqueModels(list) {
  const seen = new Set();
  const out = [];
  for (const m of list) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function getModelChain() {
  const fromEnv = parseModelList(process.env.GEMINI_MODELS);
  if (fromEnv.length) return uniqueModels(fromEnv);

  const primary = (process.env.GEMINI_MODEL || '').trim();
  const chain = primary
    ? [primary, ...DEFAULT_FREE_TIER_MODELS]
    : [...DEFAULT_FREE_TIER_MODELS];
  return uniqueModels(chain);
}

function isRetriableGeminiError(message, status) {
  const msg = String(message || '').toLowerCase();
  if (status === 429 || status === 503 || status === 502 || status === 500) return true;
  if (status === 404) return true;
  return (
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable') ||
    msg.includes('try again') ||
    msg.includes('not found') ||
    msg.includes('not supported') ||
    msg.includes('limit: 0')
  );
}

function isAuthError(message, status) {
  const msg = String(message || '').toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    msg.includes('api key not valid') ||
    msg.includes('invalid api key') ||
    msg.includes('permission denied')
  );
}

async function callGeminiModel(model, apiKey, systemInstruction, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: {
        temperature: 0.85,
        responseMimeType: 'application/json'
      }
    })
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `Gemini HTTP ${res.status}`;
    const err = new Error(String(msg));
    err.status = res.status;
    err.model = model;
    throw err;
  }

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    const err = new Error('Pusta odpowiedź Gemini');
    err.status = 502;
    err.model = model;
    throw err;
  }

  return parseJsonFromModel(text);
}

async function geminiJson(systemInstruction, userPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Brak GEMINI_API_KEY — dodaj klucz API w pliku .env na serwerze');
  }

  const models = getModelChain();
  const errors = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const result = await callGeminiModel(model, apiKey, systemInstruction, userPrompt);
      if (i > 0) {
        console.log(`[gemini] OK na modelu ${model} (po ${i} nieudanej próbie)`);
      }
      return result;
    } catch (err) {
      const status = err.status;
      const msg = err.message || String(err);
      errors.push(`${model}: ${msg}`);
      console.warn(`[gemini] ${model} — ${msg.slice(0, 160)}`);

      if (isAuthError(msg, status)) {
        throw new Error(msg);
      }
      const jsonRetry = msg.includes('nieprawidłowy JSON');
      if ((!isRetriableGeminiError(msg, status) && !jsonRetry) || i === models.length - 1) {
        break;
      }
    }
  }

  const tried = models.join(', ');
  const last = errors[errors.length - 1] || 'nieznany błąd';
  throw new Error(
    `Żaden model Gemini nie odpowiedział (próbowano: ${tried}). Ostatni błąd: ${last}`
  );
}

function parseJsonFromModel(text) {
  let raw = String(text).trim();
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) raw = fence[1].trim();
  try {
    return JSON.parse(raw);
  } catch (e) {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }
    throw new Error('Gemini zwróciło nieprawidłowy JSON');
  }
}

module.exports = { geminiJson, getModelChain, DEFAULT_FREE_TIER_MODELS };
