// OpenCode AI client — talks to a self-hosted OpenCode HTTP server using its
// session API. Greed Island only needs text-in / text-out generation for NPC
// dialog + ambient narration, so this is a much smaller client than the full
// sheet-to-car one (no streaming, no tool calls, no images).
//
// Session lifecycle:
//   POST /session                    → create session, get { id }
//   POST /session/{id}/message       → send parts, get response parts
//   DELETE /session/{id}             → cleanup (fire-and-forget)
//
// Configuration is read from SettingsStore (kv_settings) so the admin can
// change the base URL + model at runtime without restart.
//   opencode_base_url   — e.g. "http://host.docker.internal:4096"
//   opencode_model      — e.g. "opencode/deepseek-v4-flash-free"

import type { SettingsStore } from '../http/settings.js'

export const OPENCODE_DEFAULT_MODEL = 'opencode/deepseek-v4-flash-free'
export const OPENCODE_REQUEST_TIMEOUT_MS = 60_000

export type OpenCodeGenerationOptions = Readonly<{
  systemPrompt: string
  userPrompt: string
  /** Override the default model (e.g. `openai/gpt-4o-mini`). */
  model?: string
}>

export class OpenCodeUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OpenCodeUnavailableError'
  }
}

/** Return all configured OpenCode server base URLs (no trailing slash). */
export function getOpenCodeServers(store: SettingsStore): string[] {
  const raw =
    store.getSetting('opencode_servers') ??
    store.getSetting('opencode_base_url') ??
    process.env.OPENCODE_SERVERS ??
    process.env.OPENCODE_BASE_URL ??
    ''
  return raw
    .split(/[\n,]+/)
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean)
}

export function isOpenCodeConfigured(store: SettingsStore): boolean {
  return getOpenCodeServers(store).length > 0
}

/** Kept for backward compatibility — returns the first configured server URL. */
export function getOpenCodeBaseUrl(store: SettingsStore): string | null {
  return getOpenCodeServers(store)[0] ?? null
}

export function getOpenCodeModel(store: SettingsStore): string {
  return (
    store.getSetting('opencode_text_model') ??
    store.getSetting('opencode_model') ??
    process.env.OPENCODE_MODEL?.trim() ??
    OPENCODE_DEFAULT_MODEL
  )
}

function parseModel(raw: string): { providerID: string; modelID: string } {
  const sep = raw.indexOf('/')
  if (sep > 0 && sep < raw.length - 1) {
    return { providerID: raw.slice(0, sep), modelID: raw.slice(sep + 1) }
  }
  return { providerID: 'opencode', modelID: raw }
}

type OpenCodeSessionResponse = { id?: string }
type OpenCodeMessagePart = { type: string; text?: string; synthetic?: boolean }
type OpenCodeMessageResponse = { parts?: OpenCodeMessagePart[] }

async function readJson<T>(res: Response, op: string): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new OpenCodeUnavailableError(`OpenCode ${op} failed: HTTP ${res.status} ${body.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}

/**
 * Send a prompt to a single OpenCode server and return the assistant's text
 * reply. The caller is responsible for resolving the `baseURL` (e.g. from
 * `getOpenCodeServers()`) so that `aiProvider.ts` can iterate multiple servers
 * before falling back to Gemini.
 */
export async function generateWithOpenCode(
  baseURL: string,
  options: OpenCodeGenerationOptions,
): Promise<string> {
  const rawModel = options.model ?? OPENCODE_DEFAULT_MODEL
  const model = parseModel(rawModel)
  const sessionModel = { providerID: model.providerID, id: model.modelID }
  const headers = { 'Content-Type': 'application/json' }

  // 1. Create session
  const abortCreate = new AbortController()
  const timerCreate = setTimeout(() => abortCreate.abort(), OPENCODE_REQUEST_TIMEOUT_MS)
  let sessionID: string
  try {
    const sessionRes = await fetch(`${baseURL}/session`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: 'greed-island', agent: 'general', model: sessionModel }),
      signal: abortCreate.signal,
    })
    const session = await readJson<OpenCodeSessionResponse>(sessionRes, 'create session')
    if (!session.id) throw new OpenCodeUnavailableError('OpenCode create session response missing id')
    sessionID = session.id
  } catch (err) {
    clearTimeout(timerCreate)
    if ((err as { name?: string }).name === 'AbortError') {
      throw new OpenCodeUnavailableError(`OpenCode create-session timeout after ${OPENCODE_REQUEST_TIMEOUT_MS}ms`)
    }
    if (err instanceof OpenCodeUnavailableError) throw err
    throw new OpenCodeUnavailableError(`OpenCode create-session error: ${(err as Error).message}`)
  } finally {
    clearTimeout(timerCreate)
  }

  // 2. Send message → read response
  try {
    const abortMsg = new AbortController()
    const timerMsg = setTimeout(() => abortMsg.abort(), OPENCODE_REQUEST_TIMEOUT_MS)
    let msgRes: Response
    try {
      msgRes = await fetch(`${baseURL}/session/${encodeURIComponent(sessionID)}/message`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          agent: 'general',
          model: { providerID: model.providerID, modelID: model.modelID },
          system: options.systemPrompt,
          parts: [{ type: 'text', text: options.userPrompt }],
        }),
        signal: abortMsg.signal,
      })
    } finally {
      clearTimeout(timerMsg)
    }
    const msg = await readJson<OpenCodeMessageResponse>(msgRes, 'send message')
    const text = (msg.parts ?? [])
      .filter((p): p is OpenCodeMessagePart & { text: string } =>
        p.type === 'text' && !p.synthetic && typeof p.text === 'string'
      )
      .map((p) => p.text)
      .join('')
      .trim()
    if (text.length === 0) {
      throw new OpenCodeUnavailableError('OpenCode returned empty text response')
    }
    return text
  } finally {
    // Fire-and-forget cleanup.
    fetch(`${baseURL}/session/${encodeURIComponent(sessionID)}`, {
      method: 'DELETE',
      headers,
    }).catch(() => {})
  }
}
