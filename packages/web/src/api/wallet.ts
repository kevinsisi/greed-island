import type { ServerPlayerWallet, ServerWalletResponse } from './client'

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const shift = (value: unknown): boolean => value === 'morning' || value === 'afternoon' || value === 'night'
export function isPlayerWallet(value: unknown, accountId: number): value is ServerPlayerWallet {
  return record(value) && value.accountId === accountId && count(value.gold) && count(value.energy) && value.energy <= 100 && count(value.updatedAt)
}
/** Absence remains null. This read never initializes a wallet or substitutes a balance. */
export function parseWalletResponse(value: unknown, accountId: number): ServerWalletResponse {
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || !record(value) || !Array.isArray(value.jobs) || !count(value.currentTick)
    || value.currentShift !== null && !shift(value.currentShift)
    || !value.jobs.every(job => record(job) && job.accountId === accountId && typeof job.buildingId === 'string' && job.buildingId.length > 0
      && shift(job.shift) && count(job.hiredAtTick) && count(job.totalEarnings) && count(job.shiftsCompleted) && count(job.lastShiftTick))) throw new Error('Wallet response is unavailable or malformed.')
  if (value.walletInitialized === false && value.wallet === null) return value as ServerWalletResponse
  if (value.walletInitialized === true && isPlayerWallet(value.wallet, accountId)) return value as ServerWalletResponse
  if (record(value.wallet) && value.wallet.accountId !== accountId) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('greed-session-invalidated'))
    throw new Error('Wallet account context changed.')
  }
  throw new Error('Wallet initialization state is unavailable or malformed.')
}
