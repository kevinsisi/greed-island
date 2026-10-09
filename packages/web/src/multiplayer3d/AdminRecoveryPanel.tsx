import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { createWorldClient } from './client'
import type { RecoveryGrant, RecoveryTarget } from './recovery'

/** Shown only to the displayed admin; the server independently enforces that role/context. */
export function AdminRecoveryPanel({ client, close }: { client: ReturnType<typeof createWorldClient> | null; close: () => void }) {
  const mounted = useRef(true)
  const [targets, setTargets] = useState<RecoveryTarget[]>([])
  const [selected, setSelected] = useState('')
  const [grant, setGrant] = useState<RecoveryGrant | null>(null)
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    mounted.current = true
    void client?.getRecoveryTargets().then(next => {
      if (!active || !next) return
      setTargets(next)
    }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '帳號清單未載入。') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false; mounted.current = false }
  }, [client])
  async function issue(event: FormEvent) {
    event.preventDefault()
    if (busy || grant || !selected) return
    const target = targets.find(item => String(item.accountId) === selected && item.status === 'active')
    if (!target || !client) return
    setBusy(true); setError('')
    try { const next = await client.issueRecovery(target.accountId); if (next && mounted.current) setGrant(next) }
    catch (reason) { if (mounted.current) setError(reason instanceof Error ? reason.message : '復原證明未獲確認。') }
    finally { if (mounted.current) setBusy(false) }
  }
  function dismiss() { setGrant(null); setSelected(''); setVisible(false); close() }
  return <div className="mp-login-backdrop"><section className="mp-login" role="dialog" aria-modal="true" aria-labelledby="admin-reset-title"><span className="mp-eyebrow">管理員 · 同一帳號服務</span><h2 id="admin-reset-title">交付復原證明</h2><p>選擇已核對身份的目標帳號。此操作發放單次證明；對方使用證明設定新密碼後，該帳號的舊登入才會失效。</p>{grant ? <><p className="mp-recovery-target">{grant.target.displayName} · 帳號 #{grant.target.accountId}</p><label htmlFor="issued-proof">單次復原證明</label><input id="issued-proof" type={visible ? 'text' : 'password'} readOnly autoComplete="off" spellCheck={false} value={grant.token} /><button type="button" onClick={() => setVisible(show => !show)}>{visible ? '隱藏證明' : '顯示證明'}</button><small>到期時間：{new Date(grant.expiresAt).toLocaleString('zh-TW')}。請透過已核對身份的管道交付，並請對方開啟 /reset-password 手動輸入。關閉此視窗後，本頁不會保留或重新顯示證明。</small></> : <form onSubmit={issue}><label htmlFor="recovery-target">目標帳號</label><select id="recovery-target" value={selected} onChange={event => setSelected(event.target.value)} disabled={loading || busy} required><option value="">{loading ? '載入帳號中…' : '請選擇已核對的帳號'}</option>{targets.map(target => <option key={target.accountId} value={target.accountId} disabled={target.status !== 'active'}>{target.displayName} · #{target.accountId}{target.status === 'disabled' ? ' · 停用' : ''}</option>)}</select>{error && <p className="mp-login-error" role="alert">{error}</p>}<button className="mp-primary" type="submit" disabled={loading || busy || !selected}>{busy ? '發放處理中…' : '為此帳號發放單次證明'}</button></form>}<button className="mp-recovery-close" type="button" onClick={dismiss}>關閉</button></section></div>
}
