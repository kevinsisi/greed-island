import type { ReactNode } from 'react'
import { canSpendWallet, walletAvailabilityText, type WalletReadState } from '../../state/walletRead'

export function WalletStatus({ read, locale = 'zh' }: { read: WalletReadState; locale?: 'zh' | 'en' }) {
  return <span role="status" className="text-[11px] text-ground-400">{walletAvailabilityText(read, locale)}</span>
}
export function WalletSpendButton({ read, amount, busy, onClick, className, children, title }: {
  read: WalletReadState; amount: number; busy: boolean; onClick: () => void; className: string; children: ReactNode; title?: string | undefined
}) {
  const available = canSpendWallet(read, amount)
  return <button type="button" disabled={busy || !available} onClick={() => { if (!busy && available) onClick() }} className={className}
    title={available ? title : read.status === 'ready' ? '餘額不足。' : walletAvailabilityText(read)}>{children}</button>
}
