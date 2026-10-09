import type { ServerCardRead } from './client'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
/** Required energy readiness is distinct from real zero energy. Raw timer data is never substituted. */
export function parseCardRead(value: unknown): ServerCardRead {
  if (!record(value) || typeof value.tick !== 'number' || !Number.isSafeInteger(value.tick) || value.tick < 0 || !Array.isArray(value.drops)
    || !value.drops.every(drop => record(drop) && (drop.perceivedSecondsLeft === null || drop.perceivedSecondsLeft === undefined
      || typeof drop.perceivedSecondsLeft === 'number' && Number.isFinite(drop.perceivedSecondsLeft) && drop.perceivedSecondsLeft >= 0)
      && (value.walletInitialized !== false || drop.perceivedSecondsLeft == null))) throw new Error('Owned-card projection is unavailable or malformed.')
  if (value.walletInitialized === false && value.energy === null) return value as ServerCardRead
  if (value.walletInitialized === true && typeof value.energy === 'number' && Number.isSafeInteger(value.energy) && value.energy >= 0 && value.energy <= 100) return value as ServerCardRead
  throw new Error('Owned-card energy readiness is unavailable or malformed.')
}
