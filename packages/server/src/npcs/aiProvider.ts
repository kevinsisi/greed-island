// AI provider router for NPC dialog + ambient narration.
//
// Default priority: OpenCode → Gemini (so the self-hosted OpenCode server
// handles dialog when it's up, and Gemini is the fallback for when OpenCode
// isn't configured or rejects the call).
//
// The priority order can be overridden via the kv setting `provider_priority`
// (comma-separated, e.g. "gemini,opencode" to flip it back).
//
// Both providers may fail; this module aggregates errors and throws a single
// AiUnavailableError when ALL configured providers are exhausted. Callers
// (aiDialog / ambientNarrator / chronicleRenderer) then fall back to their
// static-content path.

import type { SettingsStore } from '../http/settings.js'
import { generateWithKeyPool, GeminiUnavailableError, type GeminiGenerationOptions } from './geminiClient.js'
import {
  generateWithOpenCode,
  getOpenCodeModel,
  getOpenCodeServers,
  OpenCodeUnavailableError,
} from './openCodeClient.js'

export type AiProviderId = 'opencode' | 'gemini'

export type ProviderGenerationOptions = GeminiGenerationOptions & Readonly<{
  openCodeTimeoutMs?: number
}>

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUnavailableError'
  }
}

const DEFAULT_PRIORITY: readonly AiProviderId[] = ['opencode', 'gemini']

export function getProviderPriority(store: SettingsStore): readonly AiProviderId[] {
  const raw = store.getSetting('provider_priority')
  if (!raw) return DEFAULT_PRIORITY
  const ids = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is AiProviderId => s === 'opencode' || s === 'gemini')
  return ids.length > 0 ? ids : DEFAULT_PRIORITY
}

/**
 * Generate text using whichever provider is configured + first in the
 * priority list. Falls through to the next provider on failure. The Gemini
 * options (temperature, maxOutputTokens, etc.) are only applied if Gemini
 * actually handles the call.
 */
export async function generateWithProviders(
  store: SettingsStore,
  options: ProviderGenerationOptions,
): Promise<{ text: string; provider: AiProviderId }> {
  const errors: string[] = []
  for (const provider of getProviderPriority(store)) {
    try {
      if (provider === 'opencode') {
        const servers = getOpenCodeServers(store)
        if (servers.length === 0) {
          errors.push('opencode: not configured')
          continue
        }
        const model = getOpenCodeModel(store)
        let lastErr: string | null = null
        for (const serverUrl of servers) {
          try {
            const openCodeOptions = {
              systemPrompt: options.systemPrompt,
              userPrompt: options.userPrompt,
              model,
              ...(typeof options.openCodeTimeoutMs === 'number'
                ? { timeoutMs: options.openCodeTimeoutMs }
                : {}),
            }
            const text = await generateWithOpenCode(serverUrl, openCodeOptions)
            return { text, provider }
          } catch (err) {
            lastErr =
              err instanceof OpenCodeUnavailableError ? err.message : String(err)
          }
        }
        errors.push(`opencode: all ${servers.length} server(s) failed: ${lastErr}`)
        continue
      }
      if (provider === 'gemini') {
        if (store.countActive() === 0) {
          errors.push('gemini: no active keys')
          continue
        }
        const text = await generateWithKeyPool(store, options)
        return { text, provider }
      }
    } catch (err) {
      const reason =
        err instanceof OpenCodeUnavailableError
          ? `opencode: ${err.message}`
          : err instanceof GeminiUnavailableError
            ? `gemini: ${err.message}`
            : `${provider}: ${err instanceof Error ? err.message : String(err)}`
      errors.push(reason)
    }
  }
  throw new AiUnavailableError(
    `All AI providers failed: ${errors.join(' | ')}`
  )
}
