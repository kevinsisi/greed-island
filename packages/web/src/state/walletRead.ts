import type { ServerWalletResponse } from '../api/client'
import type { SessionContext } from '../multiplayer3d/client'

export type WalletReadState = { status: 'loading'; response: null } | { status: 'unavailable'; response: null }
  | { status: 'uninitialized'; response: ServerWalletResponse & { walletInitialized: false } }
  | { status: 'ready'; response: ServerWalletResponse & { walletInitialized: true } }
export const loadingWallet = (): WalletReadState => ({ status: 'loading', response: null })
export function walletReadState(response: ServerWalletResponse): WalletReadState {
  return response.walletInitialized ? { status: 'ready', response } : { status: 'uninitialized', response }
}
export function canSpendWallet(read: WalletReadState, amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0 && read.status === 'ready' && read.response.wallet.gold >= amount
}
export function walletAvailabilityText(read: WalletReadState, locale: 'zh' | 'en' = 'zh'): string {
  if (read.status === 'loading') return locale === 'zh' ? '正在確認錢包…' : 'Checking wallet…'
  if (read.status === 'uninitialized') return locale === 'zh' ? '錢包尚未初始化，暫時無法購買。' : 'Wallet is not initialized. Purchases are unavailable.'
  if (read.status === 'unavailable') return locale === 'zh' ? '錢包暫時不可用，已停用購買。' : 'Wallet is unavailable. Purchases are disabled.'
  return locale === 'zh' ? `${read.response.wallet.gold} 潮幣 · 體力 ${read.response.wallet.energy}/100` : `${read.response.wallet.gold} gold · Energy ${read.response.wallet.energy}/100`
}
/** Read responses remain tied to the view's captured cookie-session epoch. */
export function createWalletReader(options: {
  owner: SessionContext
  isCurrent: (owner: SessionContext) => boolean
  load: (accountId: number) => Promise<ServerWalletResponse>
  onChange: (read: WalletReadState) => void
  timeoutMs?: number
}) {
  let disposed = false
  let pending: Promise<void> | null = null
  const current = () => !disposed && options.owner.accountId !== null && options.isCurrent(options.owner)
  function refresh(): Promise<void> {
    if (!current()) return Promise.resolve()
    if (pending) return pending
    const operation = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const response = await Promise.race([options.load(options.owner.accountId!), new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Wallet read timed out.')), options.timeoutMs ?? 6000)
        })])
        if (current()) options.onChange(walletReadState(response))
      } catch { if (current()) options.onChange({ status: 'unavailable', response: null }) }
      finally { if (timeout !== undefined) clearTimeout(timeout) }
    })()
    pending = operation
    void operation.finally(() => { if (pending === operation) pending = null })
    return operation
  }
  return { refresh, dispose() { disposed = true } }
}
