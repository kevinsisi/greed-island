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

import { providerDeadline, throwIfProviderCancelled, withAbortSignal } from './providerCancellation.js'
import type { SettingsStore } from '../http/settings.js'

export const OPENCODE_DEFAULT_MODEL = 'opencode/deepseek-v4-flash-free'
export const OPENCODE_REQUEST_TIMEOUT_MS = 60_000

export type OpenCodeGenerationOptions = Readonly<{
  systemPrompt: string
  userPrompt: string
  /** Override the default model (e.g. `openai/gpt-4o-mini`). */
  model?: string
  timeoutMs?: number
  signal?: AbortSignal
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

function remainingTimeoutMs(deadline: number): number {
  return Math.max(1, deadline - Date.now())
}

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
  inputOptions: OpenCodeGenerationOptions,
): Promise<string> {
  const { signal, ...values } = inputOptions
  const options = Object.freeze({ ...values, ...(signal ? { signal } : {}) })
  throwIfProviderCancelled(signal)
  const model = parseModel(options.model ?? OPENCODE_DEFAULT_MODEL)
  const timeoutMs = Math.max(1, options.timeoutMs ?? OPENCODE_REQUEST_TIMEOUT_MS), end = Date.now() + timeoutMs
  const headers = { 'Content-Type': 'application/json' }
  let sessionID: string | undefined
  const request = async <T>(url: string, init: RequestInit, stage: 'create-session' | 'send-message', op: string): Promise<T> => {
    throwIfProviderCancelled(signal)
    const deadline = providerDeadline(remainingTimeoutMs(end), signal)
    try {
      const response = await withAbortSignal(fetch(url, { ...init, signal: deadline.signal }), deadline.signal)
      throwIfProviderCancelled(signal)
      const parsed = await withAbortSignal(readJson<T>(response, op), deadline.signal)
      throwIfProviderCancelled(signal)
      return parsed
    } catch (err) {
      throwIfProviderCancelled(signal)
      if ((err as { name?: string }).name === 'AbortError') throw new OpenCodeUnavailableError(`OpenCode ${stage} timeout after ${timeoutMs}ms`)
      if (err instanceof OpenCodeUnavailableError) throw err
      throw new OpenCodeUnavailableError(`OpenCode ${stage} error: ${(err as Error).message}`)
    } finally { deadline.close() }
  }
  try {
    const session = await request<OpenCodeSessionResponse>(`${baseURL}/session`, {
      method: 'POST', headers, body: JSON.stringify({ title: 'greed-island', agent: 'general', model: { providerID: model.providerID, id: model.modelID } }),
    }, 'create-session', 'create session')
    if (!session.id) throw new OpenCodeUnavailableError('OpenCode create session response missing id')
    sessionID = session.id
    throwIfProviderCancelled(signal)
    const msg = await request<OpenCodeMessageResponse>(`${baseURL}/session/${encodeURIComponent(sessionID)}/message`, {
      method: 'POST', headers, body: JSON.stringify({ agent: 'general', model: { providerID: model.providerID, modelID: model.modelID }, system: options.systemPrompt, parts: [{ type: 'text', text: options.userPrompt }] }),
    }, 'send-message', 'send message')
    const text = (msg.parts ?? []).filter((p): p is OpenCodeMessagePart & { text: string } => p.type === 'text' && !p.synthetic && typeof p.text === 'string').map(p => p.text).join('').trim()
    if (!text) throw new OpenCodeUnavailableError('OpenCode returned empty text response')
    return text
  } finally {
    // Cleanup is bounded and participates in the same lifecycle. Never start a request after cancellation.
    if (sessionID && !signal?.aborted) {
      const cleanup = providerDeadline(Math.min(1000, remainingTimeoutMs(end)), signal)
      try { await withAbortSignal(fetch(`${baseURL}/session/${encodeURIComponent(sessionID)}`, { method: 'DELETE', headers, signal: cleanup.signal }), cleanup.signal) }
      catch { /* best-effort session cleanup */ }
      finally { cleanup.close() }
    }
    throwIfProviderCancelled(signal)
  }
}
