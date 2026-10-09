import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { AdminRecoveryPanel } from './AdminRecoveryPanel'
import { HarborBeaconPanel } from './HarborBeaconPanel'
import { harborProgressText } from './harborBeacon'
import { useAuth } from '../state/AuthContext'
import { createWorldClient, registrationError } from './client'
import { crossingStatus, regionStatus } from './protocol'
import { createMultiplayerScene } from './scene'
import { APP_VERSION } from '../version'
import type { ConnectionStatus, MultiplayerControls, PlayerWorldSnapshot } from './types'
import './multiplayer.css'

const STATUS_TEXT: Record<ConnectionStatus, string> = { checking: '確認連線', unauthenticated: '尚未登入', connecting: '正在連線', online: '世界已連線', offline: '連線中斷' }

function SharedMap({ snapshot, selected, select }: { snapshot: PlayerWorldSnapshot | null; selected: string | null; select: (id: string) => void }) {
  if (!snapshot) return null
  const regions = snapshot.map.regions
  const minX = Math.min(...regions.map(r => r.x)), minY = Math.min(...regions.map(r => r.y))
  const width = Math.max(1, Math.max(...regions.map(r => r.x)) - minX)
  const height = Math.max(1, Math.max(...regions.map(r => r.y)) - minY)
  const x = (id: string) => 14 + ((regions.find(r => r.id === id)?.x ?? minX) - minX) / width * 100
  const y = (id: string) => 14 + ((regions.find(r => r.id === id)?.y ?? minY) - minY) / height * 112
  return <section className="mp-map" aria-label="共同世界地圖">
    <div><strong>共同世界</strong><span>北 N ↑</span></div>
    <svg viewBox="0 0 128 144" role="img" aria-label="金色是目前區域；灰色為未開放或場景未支援">
      <rect x="4" y="4" width="120" height="136" rx="3" fill="#183c36" stroke="#b6c8a03b" />
      {snapshot.map.edges.map((edge, index) => <line key={index} x1={x(edge.fromTileId)} y1={y(edge.fromTileId)} x2={x(edge.toTileId)} y2={y(edge.toTileId)} stroke={edge.available ? '#a7c6b3' : '#718779'} strokeOpacity={edge.available ? .6 : .25} strokeDasharray={edge.crossingType === 'water-crossing' ? '2 3' : undefined} />)}
      {regions.map(region => <g key={region.id} transform={`translate(${x(region.id)} ${y(region.id)})`}><title>{region.name}：{regionStatus(region)}，{snapshot.map.regionOnlineCounts[region.id] ?? 0} 位在線</title><circle r={region.id === snapshot.tileId ? 5 : 3.7} fill={region.id === snapshot.tileId ? '#ffe6a3' : region.available && region.geometrySupported ? '#76dfc7' : '#718779'} stroke={region.id === selected ? '#ffffff' : '#142f2e'} strokeWidth="1.5" /></g>)}
    </svg>
    <label className="mp-sr-only" htmlFor="world-region">查看世界區域</label>
    <select id="world-region" value={selected ?? snapshot.tileId} onChange={event => select(event.target.value)}>{regions.map(region => <option key={region.id} value={region.id}>{region.name} · {region.id === snapshot.tileId ? '目前所在' : regionStatus(region)}</option>)}</select>
    <small>實線・陸路　虛線・渡水</small>
  </section>
}

export default function Multiplayer3DPage() {
  const { snapshot, profile, status, networkError, setNetworkError, client } = useAuth()
  const snapshotRef = useRef<PlayerWorldSnapshot | null>(null)
  const [sceneError, setSceneError] = useState('')
  const [navigationStatus, setNavigationStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [loginBusy, setLoginBusy] = useState(false)
  const [transitionBusy, setTransitionBusy] = useState(false)
  const [logoutBusy, setLogoutBusy] = useState(false)
  const [recoveryOpen, setRecoveryOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const messagesRef = useRef<HTMLUListElement>(null)
  const [notice, setNotice] = useState('')
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null)
  const [stick, setStick] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const clientRef = useRef<ReturnType<typeof createWorldClient> | null>(null)
  const controls = useRef<MultiplayerControls>({ x: 0, y: 0, paused: true, recenter: false })
  snapshotRef.current = snapshot
  const online = status === 'online'
  controls.current.paused = !online || !!sceneError || transitionBusy || logoutBusy || recoveryOpen
  const self = snapshot?.players.find(player => player.accountId === snapshot.selfId)
  const region = snapshot?.map.regions.find(r => r.id === snapshot.tileId)
  const selected = snapshot?.map.regions.find(r => r.id === (selectedRegion ?? snapshot.tileId))
  const crossing = snapshot && selected ? crossingStatus(snapshot, selected.id) : null
  const onlinePlayers = snapshot?.players.filter(player => player.online) ?? []

  clientRef.current = client
  useEffect(() => {
    if (status !== 'online') { controls.current.x = 0; controls.current.y = 0; controls.current.paused = true; setStick({ x: 0, y: 0 }) }
  }, [status])

  useEffect(() => {
    if (!canvasRef.current) return
    let controller: ReturnType<typeof createMultiplayerScene> | undefined
    try {
      controller = createMultiplayerScene(canvasRef.current, {
        getSnapshot: () => snapshotRef.current,
        getSelfId: () => snapshotRef.current?.selfId ?? null,
        controls: controls.current,
        onMove: (dx, dz) => { void clientRef.current?.move(dx, dz) },
        onNavigationStatus: setNavigationStatus,
        onReady: () => setReady(true),
        onError: setSceneError
      })
    } catch { setSceneError('無法啟動 3D 場景，請確認瀏覽器已開啟 WebGL。') }
    return () => controller?.dispose()
  }, [])
  useEffect(() => { setRecoveryOpen(false) }, [profile?.accountId, profile?.role])
  useEffect(() => { setSelectedRegion(snapshot?.tileId ?? null); setNotice('') }, [snapshot?.tileId])

  useEffect(() => { if (messagesRef.current) messagesRef.current.scrollTop = messagesRef.current.scrollHeight }, [snapshot?.messages.at(-1)?.sequence, panelOpen])
  async function chat(event: FormEvent) {
    event.preventDefault()
    if (!online || chatBusy || !draft.trim()) return
    setChatBusy(true); setNotice('')
    try { await clientRef.current?.chat(draft); setDraft('') }
    catch (error) { setNotice(error instanceof Error ? error.message : '世界訊息未送出。') }
    finally { setChatBusy(false) }
  }
  async function login(event: FormEvent) {
    event.preventDefault()
    if (loginBusy || !clientRef.current) return
    const cleanIdentifier = identifier.trim()
    const validationError = authMode === 'register' ? registrationError(cleanIdentifier, password, confirmPassword) : null
    if (validationError) { setNetworkError(validationError); return }
    setLoginBusy(true); setNetworkError('')
    try {
      if (authMode === 'register') await clientRef.current?.register(cleanIdentifier, password)
      else await clientRef.current?.login(cleanIdentifier, password)
      canvasRef.current?.focus({ preventScroll: true })
    } catch { /* Typed service errors are surfaced by the client. */ }
    finally { setPassword(''); setConfirmPassword(''); setLoginBusy(false) }
  }
  async function transition() {
    if (!online || !selected || !crossing?.ready || transitionBusy) return
    controls.current.cancelNavigation?.(); controls.current.x = 0; controls.current.y = 0
    void clientRef.current?.move(0, 0)
    setTransitionBusy(true); setNotice('')
    try { await clientRef.current?.transition(selected.id); canvasRef.current?.focus({ preventScroll: true }) }
    catch (error) { setNotice(error instanceof Error ? error.message : '通路申請未完成。') }
    finally { setTransitionBusy(false) }
  }
  async function logout() {
    if (logoutBusy) return
    controls.current.cancelNavigation?.(); setLogoutBusy(true); setNotice('')
    try { await clientRef.current?.logout() }
    catch (error) { setNotice(error instanceof Error ? error.message : '登出失敗。') }
    finally { setLogoutBusy(false) }
  }
  function releaseStick() { controls.current.x = 0; controls.current.y = 0; setStick({ x: 0, y: 0 }); void clientRef.current?.move(0, 0) }
  function moveStick(event: ReactPointerEvent<HTMLDivElement>) {
    if (controls.current.paused || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    controls.current.cancelNavigation?.()
    const bounds = event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - bounds.left - bounds.width / 2, dy = event.clientY - bounds.top - bounds.height / 2
    const scale = Math.max(bounds.width / 2, Math.hypot(dx, dy))
    controls.current.x = dx / scale; controls.current.y = -dy / scale
    setStick({ x: dx / scale * 29, y: dy / scale * 29 })
  }
  const playerName = (id: number) => id === profile?.accountId ? profile.displayName : snapshot?.players.find(p => p.accountId === id)?.displayName ?? `旅人 #${id}`
  function stopMovement() { controls.current.cancelNavigation?.(); releaseStick() }

  return <main className="mp3d" aria-label="貪婪之島共同世界">
    <canvas ref={canvasRef} className="mp-canvas" tabIndex={0} aria-label="共同世界 3D 場景；點擊地面設定目的地，WASD 或方向鍵移動，拖曳轉動鏡頭" />
    <div className="mp-vignette" />
    <header className="mp-header"><div className="mp-brand"><span>◈</span><div><strong>GREED ISLAND</strong><small>{region?.name ?? '共同世界'}</small></div></div><nav className="mp-game-links"><Link to="/game/hub">世界總覽</Link><Link to="/game/profile">個人資料</Link><Link to="/game/codex">卡冊</Link><Link to="/game/social">社交與交易</Link></nav><span className={`mp-connection ${online ? 'online' : ''}`} role="status"><i />{STATUS_TEXT[status]}</span>{profile?.role === 'admin' && <button className="mp-admin-recovery" onClick={() => { controls.current.cancelNavigation?.(); releaseStick(); setRecoveryOpen(true) }}>帳號復原</button>}{profile && <button className="mp-logout" disabled={logoutBusy} onClick={() => { void logout() }}>{logoutBusy ? '登出中' : '登出'}</button>}</header>
    {snapshot && <section className="mp-mission" aria-label="目前共同世界區域"><span className="mp-eyebrow">同一帳號 · 共同世界</span><h1>{region?.name ?? snapshot.tileId}</h1><p>玩家位置與在場 NPC 來自同一份伺服器世界。前往通路後，即可申請跨區。</p><div className="mp-mission-progress"><span>世界 tick <b>{snapshot.worldTick}</b></span><span>{onlinePlayers.length} 位旅人 · {snapshot.npcs.length} 位 NPC 在場</span></div></section>}
    <SharedMap snapshot={snapshot} selected={selectedRegion} select={setSelectedRegion} />
    {snapshot && <HarborBeaconPanel snapshot={snapshot} online={online} client={client} stopMovement={stopMovement} />}
    {snapshot && <><button className="mp-panel-toggle" aria-expanded={panelOpen} aria-controls="mp-world-panel" onClick={() => setPanelOpen(open => !open)}>{panelOpen ? '收起在場名單' : `旅人與 NPC · ${onlinePlayers.length + snapshot.npcs.length}`}</button><aside id="mp-world-panel" className="mp-panel mp-world-panel" data-open={panelOpen} aria-label="同區旅人與 NPC"><div className="mp-panel-heading"><strong>同一個區域</strong><span>{region?.name}</span><button className="mp-panel-close" aria-label="收起在場名單" onClick={() => setPanelOpen(false)}>×</button></div><ul className="mp-players" aria-label="同區玩家" tabIndex={0}>{snapshot.players.map(player => <li key={player.accountId} className={player.online ? '' : 'offline'}><i className={player.accountId === snapshot.selfId ? 'self' : ''} /><div><strong>{playerName(player.accountId)}{player.accountId === snapshot.selfId ? ' · 你' : ''}</strong><small>{player.online ? harborProgressText(player.harborProgress) : '等待重新連線'}</small><small>{snapshot.beacon.contributors.includes(player.accountId) ? '物資已交付' : ''}</small></div></li>)}</ul><div className="mp-chat-heading">NPC <small>活著、在戶外、未在跨區途中</small></div><ul className="mp-npcs" aria-label="同區 NPC" tabIndex={0}>{snapshot.npcs.length ? snapshot.npcs.map(npc => <li key={npc.id}><strong>{npc.name.zh}</strong><small>{npc.activity}</small></li>) : <li className="mp-empty">目前沒有戶外 NPC 在場。</li>}</ul><div className="mp-chat-heading">世界聊天 <small>同一公開頻道，所有區域都看得見</small></div><ul className="mp-messages" ref={messagesRef} aria-label="世界聊天訊息" aria-live="polite" aria-relevant="additions text">{snapshot.messages.length ? snapshot.messages.map(message => <li key={message.id}><strong>{message.displayName ?? `旅人 #${message.accountId}`}{message.accountId === snapshot.selfId ? ' · 你' : ''}<small> · {snapshot.map.regions.find(r => r.id === message.tileId)?.name ?? message.tileId}</small></strong><p>{message.text}</p></li>) : <li className="mp-empty">和世界裡的旅人打聲招呼。</li>}</ul><form className="mp-chat-form" onSubmit={chat}><label className="mp-sr-only" htmlFor="world-chat">世界聊天訊息</label><input id="world-chat" value={draft} onChange={event => setDraft(event.target.value)} maxLength={240} autoComplete="off" placeholder={online ? '寫給世界裡的旅人…' : '等待重新連線…'} disabled={!online} /><button type="submit" disabled={!online || chatBusy || !draft.trim()}>{chatBusy ? '傳送中' : '傳送'}</button></form><p className="mp-npc-note">舊房間聊天紀錄仍保留待對應，此處顯示新的世界訊息。</p></aside></>}
    {profile && <footer className="mp-bottom"><section className="mp-self" aria-label="自己的共同世界帳號"><span className="mp-avatar">旅</span><div><strong>{profile.displayName}</strong><p>帳號 #{profile.accountId}{self && <> · {self.x.toFixed(1)}, {self.z.toFixed(1)}</>}</p></div></section><small className="mp-authority">位置由伺服器保存 · v{APP_VERSION}</small><small className="mp-progress-note">{snapshot ? harborProgressText(snapshot.harborProgress) : '等待伺服器港口進度'}</small></footer>}
    {snapshot && selected && <div className="mp-actions"><small>{selected.id === snapshot.tileId ? `目前所在：${selected.name}` : `${selected.name} · ${regionStatus(selected)}`}</small>{selected.id !== snapshot.tileId && <button className="mp-primary" disabled={!online || !crossing?.ready || transitionBusy} onClick={() => { void transition() }}>{transitionBusy ? '通路申請中…' : crossing?.text}</button>}<button className="mp-camera-reset" onClick={() => { controls.current.recenter = true; canvasRef.current?.focus({ preventScroll: true }) }}>重置鏡頭</button></div>}
    {snapshot && <div className="mp-touch"><div className="mp-stick" role="group" aria-label="觸控移動搖桿；也可點擊地面前往目的地" onPointerDown={event => { if (controls.current.paused) return; event.currentTarget.setPointerCapture(event.pointerId); moveStick(event) }} onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}><span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} /><small>移動 · 點地前往</small></div></div>}
    <div className="mp-controls-hint">點擊地面前往目的地 · WASD／方向鍵或搖桿可取消 · 拖曳轉動鏡頭</div>
    {profile && <div className="mp-feedback" role="status" aria-live="polite">{networkError || notice || navigationStatus}</div>}
    {profile && !online && <div className="mp-offline"><strong>共同世界尚未連線</strong><span>{networkError || '移動已暫停，正在取得伺服器狀態。'}</span><button disabled={loginBusy || transitionBusy || logoutBusy || recoveryOpen} onClick={() => { void clientRef.current?.reconnect() }}>立即重連</button></div>}
    {!profile && <div className="mp-login-backdrop"><section className="mp-login" aria-labelledby="mp-login-title"><span className="mp-eyebrow">GREED ISLAND · 共同世界</span><h2 id="mp-login-title">進入同一個世界。</h2><p>使用既有帳號登入。新旅人可申請一個帳號。</p><div className="mp-auth-tabs" role="group" aria-label="登入或申請帳號"><button type="button" disabled={loginBusy} aria-pressed={authMode === 'login'} onClick={() => { setAuthMode('login'); setPassword(''); setConfirmPassword(''); setNetworkError('') }}>登入</button><button type="button" disabled={loginBusy} aria-pressed={authMode === 'register'} onClick={() => { setAuthMode('register'); setPassword(''); setConfirmPassword(''); setNetworkError('') }}>申請帳號</button></div><form onSubmit={login}><label htmlFor="mp-username">{authMode === 'register' ? '帳號' : '帳號或電子郵件'}</label><input id="mp-username" name="username" value={identifier} onChange={event => setIdentifier(event.target.value)} autoComplete="username" required maxLength={authMode === 'register' ? 32 : 254} /><label htmlFor="mp-password">密碼</label><input id="mp-password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required maxLength={200} />{authMode === 'register' && <><label htmlFor="mp-confirm-password">再次輸入密碼</label><input id="mp-confirm-password" name="confirmPassword" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required maxLength={200} /></>}{networkError && <p className="mp-login-error" role="alert">{networkError}</p>}<button className="mp-primary" type="submit" disabled={loginBusy || !client}>{loginBusy ? '處理中…' : authMode === 'register' ? '建立帳號並進入 →' : '進入共同世界 →'}</button></form><Link to="/reset-password">使用管理員交付的復原證明</Link><small>一個帳號、一份伺服器身份。未完成的舊進度對應不會顯示成新資源。</small></section></div>}
    {recoveryOpen && profile?.role === 'admin' && <AdminRecoveryPanel client={clientRef.current} close={() => { setRecoveryOpen(false); canvasRef.current?.focus({ preventScroll: true }) }} />}
    {snapshot && !ready && !sceneError && <div className="mp-scene-loading" role="status">正在載入世界場景…</div>}
    {sceneError && <div className="mp-scene-error" role="alert"><strong>3D 畫面暫時無法啟動</strong><p>{sceneError}</p><button onClick={() => window.location.reload()}>重新載入</button></div>}
  </main>
}
