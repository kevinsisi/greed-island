// Gemini AI client with key-pool rotation.
//
// Uses the REST endpoint
//   POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
// because we don't want to bring in the @google/genai SDK just for one
// JSON-in/JSON-out call. The SDK adds 5+MB to the server image and
// hides the retry behaviour we need.
//
// On HTTP 401/403 the key is permanently disabled.
// On HTTP 429 (quota) the key is also disabled until an admin reactivates.
// On HTTP 5xx or transient network failure we move to the next key but
// leave the key active. If every active key has been tried, the call
// throws GeminiUnavailableError and the caller falls back to the
// static dialog library.

import { QUOTA_COOLDOWN_MS, type SettingsStore } from '../http/settings.js'

export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash'
export const GEMINI_REQUEST_TIMEOUT_MS = 15_000

export type GeminiGenerationOptions = Readonly<{
  model?: string
  systemPrompt: string
  userPrompt: string
  temperature?: number
  maxOutputTokens?: number
  /**
   * Forces Gemini's output MIME type. Set to `'application/json'` to
   * make the model emit raw JSON without markdown ```json fences,
   * which otherwise blow up the parser when output is truncated.
   */
  responseMimeType?: string
  /**
   * 2.5-flash 內部 chain-of-thought 會消耗 maxOutputTokens 的 budget，
   * 對短-JSON 任務常常導致 thinking 用光全部 token、output 為空白。
   * 設 0 = 完全停用 thinking；保留 default undefined 讓既有調用者不受影響。
   */
  thinkingBudget?: number
}>

export class GeminiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiUnavailableError'
  }
}

type RawGeminiCandidate = {
  content?: {
    parts?: Array<{ text?: string }>
  }
}

type RawGeminiResponse = {
  candidates?: RawGeminiCandidate[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string; status?: string }
}

/**
 * Run a single generation through the Gemini key pool. Walks active
 * keys (oldest used first) until one succeeds or the pool is empty.
 */
export async function generateWithKeyPool(
  store: SettingsStore,
  options: GeminiGenerationOptions
): Promise<string> {
  const model = options.model ?? GEMINI_DEFAULT_MODEL
  const keys = store.listActiveKeys()
  if (keys.length === 0) {
    throw new GeminiUnavailableError('No active Gemini API keys configured.')
  }

  const errors: string[] = []
  for (const record of keys) {
    try {
      const text = await callGemini(record.key, model, options)
      store.markUsed(record.id)
      return text
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      const disable = err instanceof KeyAuthError || err instanceof KeyQuotaError
      // v0.42.0 — quota errors (429) get a finite cooldown so the key auto-
      // recovers after ~30 minutes. Auth errors (401/403) stay disabled
      // until an admin reactivates.
      const cooldownMs = err instanceof KeyQuotaError ? QUOTA_COOLDOWN_MS : undefined
      store.markFailure(record.id, detail, disable, cooldownMs)
      errors.push(`key#${record.id}: ${detail}`)
      // Continue to next key.
    }
  }
  throw new GeminiUnavailableError(
    `All ${keys.length} Gemini key(s) failed: ${errors.join(' | ')}`
  )
}

class KeyAuthError extends Error {}
class KeyQuotaError extends Error {}

async function callGemini(
  key: string,
  model: string,
  options: GeminiGenerationOptions
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`
  const generationConfig: Record<string, unknown> = {
    temperature: options.temperature ?? 0.85,
    maxOutputTokens: options.maxOutputTokens ?? 512,
  }
  if (options.responseMimeType) {
    generationConfig.responseMimeType = options.responseMimeType
  }
  if (typeof options.thinkingBudget === 'number') {
    generationConfig.thinkingConfig = { thinkingBudget: options.thinkingBudget }
  }
  const body = {
    systemInstruction: {
      parts: [{ text: options.systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: options.userPrompt }],
      },
    ],
    generationConfig,
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if ((err as { name?: string }).name === 'AbortError') {
      throw new Error(`Gemini request timed out after ${GEMINI_REQUEST_TIMEOUT_MS}ms`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    if (response.status === 401 || response.status === 403) {
      throw new KeyAuthError(`HTTP ${response.status}: ${text.slice(0, 200)}`)
    }
    if (response.status === 429) {
      throw new KeyQuotaError(`HTTP 429 quota: ${text.slice(0, 200)}`)
    }
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`)
  }

  const json = (await response.json()) as RawGeminiResponse & {
    candidates?: Array<RawGeminiCandidate & { finishReason?: string }>
  }
  if (json.error?.message) {
    throw new Error(`Gemini error: ${json.error.message}`)
  }
  if (json.promptFeedback?.blockReason) {
    throw new Error(`Gemini blocked: ${json.promptFeedback.blockReason}`)
  }
  const candidate = json.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text
  if (typeof text !== 'string' || text.length === 0) {
    // 常見成因：finishReason='MAX_TOKENS' 但 thinking 把 budget 用完，
    // text candidate 直接缺席。把 finishReason 帶出來方便診斷。
    const reason = (candidate as { finishReason?: string } | undefined)?.finishReason
    throw new Error(
      `Gemini returned no text candidate${reason ? ` (finishReason=${reason})` : ''}`
    )
  }
  return text.trim()
}
