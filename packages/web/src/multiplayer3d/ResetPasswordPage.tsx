import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { createWorldClient } from './client'
import { recoveryInputError } from './recovery'
import './multiplayer.css'

/** A proof-entry utility for the same account service. No token is read from a URL or storage. */
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const clientRef = useRef<ReturnType<typeof createWorldClient> | null>(null)
  useEffect(() => {
    const client = createWorldClient({ onProfile: () => {}, onSnapshot: () => {}, onStatus: () => {}, onError: setError })
    clientRef.current = client
    // Recovery does not open a world stream or issue an entry command before proof redemption.
    return () => { client.dispose(); clientRef.current = null }
  }, [])
  async function redeem(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    const invalid = recoveryInputError(token, password, confirmation)
    if (invalid) { setError(invalid); return }
    setBusy(true); setError('')
    try {
      const profile = await clientRef.current?.redeemRecovery(token.trim(), password)
      if (profile) navigate('/game', { replace: true })
    } catch { /* The client emits generic, credential-free recovery errors. */ }
    finally { setToken(''); setPassword(''); setConfirmation(''); setBusy(false) }
  }
  function cancel() {
    setToken(''); setPassword(''); setConfirmation('')
    clientRef.current?.dispose()
    navigate('/game', { replace: true })
  }
  return <main className="mp3d" aria-label="共同世界帳號復原"><div className="mp-login-backdrop"><section className="mp-login" aria-labelledby="reset-title"><span className="mp-eyebrow">GREED ISLAND · 同一帳號</span><h2 id="reset-title">設定新密碼</h2><p>請手動輸入管理員交付的復原證明。證明只能使用一次，過期後需重新取得。</p><form onSubmit={redeem}><label htmlFor="reset-proof">復原證明</label><input id="reset-proof" name="recoveryProof" type="password" autoComplete="off" spellCheck={false} value={token} onChange={event => setToken(event.target.value)} maxLength={64} required disabled={busy} /><label htmlFor="reset-password">新密碼</label><input id="reset-password" name="newPassword" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={200} required disabled={busy} /><label htmlFor="reset-confirmation">再次輸入新密碼</label><input id="reset-confirmation" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={200} required disabled={busy} />{error && <p className="mp-login-error" role="alert">{error}</p>}<button className="mp-primary" type="submit" disabled={busy}>{busy ? '復原處理中…' : '設定新密碼並登入'}</button><button type="button" onClick={cancel}>返回共同世界</button></form><small>此頁不會寄送電子郵件或自行發放證明。送出後會更新同一帳號的密碼，並讓該帳號先前的登入失效。</small></section></div></main>
}
