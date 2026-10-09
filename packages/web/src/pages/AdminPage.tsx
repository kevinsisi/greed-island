import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../state/AuthContext'
import { AdminRecoveryPanel } from '../multiplayer3d/AdminRecoveryPanel'
import type { RecoveryTarget } from '../multiplayer3d/recovery'
import type { AccountProfile } from '../multiplayer3d/types'

const ROLES: AccountProfile['role'][] = ['player', 'gm', 'admin', 'agent']
export function AdminPage() {
  const { profile, client } = useAuth()
  const [users, setUsers] = useState<RecoveryTarget[]>([])
  const [choices, setChoices] = useState<Record<number, AccountProfile['role']>>({})
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState<number | null>(null)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const refresh = useCallback(async () => {
    if (profile?.role !== 'admin' || !client) return
    try {
      const next = await client.getRecoveryTargets()
      if (next) { setUsers(next); setChoices(Object.fromEntries(next.map(u => [u.accountId, u.role]))); setError('') }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '管理帳號清單未載入。') }
  }, [profile?.accountId, profile?.role, client])
  useEffect(() => { void refresh(); return () => { setRecoveryOpen(false) } }, [refresh])
  if (!profile) return <section className="gi-panel p-5">請從共同世界登入。</section>
  if (profile.role !== 'admin') return <section className="gi-panel p-5">目前帳號沒有管理員權限。</section>
  async function change(id: number, value: { role: AccountProfile['role'] } | { status: 'active' | 'disabled' }) {
    if (busyId !== null || !client) return
    setBusyId(id); setError('')
    try { await client.updateAdministrativeAccount(id, value); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '帳號變更未完成。') }
    finally { setBusyId(null) }
  }
  return <section className="gi-panel p-5 flex flex-col gap-4" aria-label="共同世界帳號管理"><h1>帳號管理</h1><nav className="flex flex-wrap gap-4" aria-label="管理功能"><Link to="/game/admin/world">世界管理</Link><Link to="/game/admin/npcs">NPC 狀態</Link><Link to="/game/admin/lineage">NPC 家系</Link><Link to="/game/admin/cards">卡片美術</Link></nav><p>同一個帳號服務。角色與停用狀態由伺服器驗證；最後一位有效管理員受到保護。</p>{error && <p role="alert">{error}</p>}<button type="button" onClick={() => { void refresh() }}>重新載入帳號</button><ul className="flex flex-col gap-4">{users.map(user => <li key={user.accountId} className="gi-panel p-4"><strong>{user.displayName} · #{user.accountId}</strong><p>{user.status === 'active' ? '有效' : '停用'}</p><label htmlFor={`role-${user.accountId}`}>角色</label><select id={`role-${user.accountId}`} value={choices[user.accountId] ?? user.role} disabled={busyId !== null} onChange={event => setChoices(old => ({ ...old, [user.accountId]: event.target.value as AccountProfile['role'] }))}>{ROLES.map(role => <option key={role} value={role}>{role}</option>)}</select><button type="button" disabled={busyId !== null || choices[user.accountId] === user.role} onClick={() => { void change(user.accountId, { role: choices[user.accountId] ?? user.role }) }}>儲存角色</button><button type="button" disabled={busyId !== null} onClick={() => { void change(user.accountId, { status: user.status === 'active' ? 'disabled' : 'active' }) }}>{user.status === 'active' ? '停用帳號' : '啟用帳號'}</button></li>)}</ul><button type="button" disabled={busyId !== null} onClick={() => setRecoveryOpen(true)}>交付單次復原證明</button>{recoveryOpen && <AdminRecoveryPanel client={client} close={() => setRecoveryOpen(false)} />}</section>
}
