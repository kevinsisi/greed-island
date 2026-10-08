import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { createRoomClient, participationSeconds, registrationError, roomIsFull } from './client'
import { createMultiplayerScene } from './scene'
import { APP_VERSION } from '../version'
import type { ConnectionStatus, MultiplayerControls, RoomSnapshot } from './types'
import './multiplayer.css'

const STATUS_TEXT: Record<ConnectionStatus, string> = { checking: '確認連線', unauthenticated: '尚未登入', connecting: '正在連線', online: '房間已連線', offline: '連線中斷' }

function SharedMap({ snapshot }: { snapshot: RoomSnapshot | null }) {
  const world = snapshot?.world ?? { minX: -12, maxX: 12, minZ: -10, maxZ: 18, obstacles: [] }
  const width = world.maxX - world.minX
  const height = world.maxZ - world.minZ
  const x = (value: number) => 8 + (value - world.minX) / width * 112
  const z = (value: number) => 8 + (world.maxZ - value) / height * 128
  return <section className="mp-map" aria-label="共享港口地圖">
    <div><strong>潮鳴港</strong><span>北 N ↑</span></div>
    <svg viewBox="0 0 128 144" role="img" aria-label="伺服器位置：金色是自己，綠色是其他在線旅人，菱形是燈塔">
      <rect x="4" y="4" width="120" height="136" rx="3" fill="#183c36" stroke="#b6c8a03b" />
      <path d="M64 138 L64 7 M8 83 L120 83" stroke="#b3c59c" strokeOpacity=".2" strokeDasharray="2 4" />
      {world.obstacles.map((o, index) => <rect key={index} x={x(o.x - o.width / 2)} y={z(o.z + o.depth / 2)} width={o.width / width * 112} height={o.depth / height * 128} fill="#718779" stroke="#b8c5a5" strokeWidth=".6" />)}
      {snapshot && <g transform={`translate(${x(snapshot.beacon.x)} ${z(snapshot.beacon.z)})`}><circle r="11" fill={snapshot.beacon.completed ? '#e5ba4d44' : '#e5ba4d15'} stroke="#e5ba4d" strokeDasharray="2 2" /><path d="M0 -5 L4 0 L0 5 L-4 0 Z" fill="#f4d586" /></g>}
      {snapshot?.players.filter(p => p.online || p.id === snapshot.selfId).map(player => <g key={player.id} transform={`translate(${x(player.x)} ${z(player.z)})`}><title>{player.name}{player.id === snapshot.selfId ? '（自己）' : ''}</title><circle r="3.8" fill={player.id === snapshot.selfId ? '#ffe6a3' : '#76dfc7'} stroke="#142f2e" strokeWidth="1.5" /></g>)}
    </svg>
    <small>金色・自己　綠色・旅人</small><small>菱形・北方信標燈塔</small>
  </section>
}

export default function Multiplayer3DPage() {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const snapshotRef = useRef<RoomSnapshot | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [networkError, setNetworkError] = useState('')
  const [sceneError, setSceneError] = useState('')
  const [navigationStatus, setNavigationStatus] = useState('')
  const [ready, setReady] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [claimCode, setClaimCode] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [loginBusy, setLoginBusy] = useState(false)
  const [draft, setDraft] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [contributeBusy, setContributeBusy] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [stick, setStick] = useState({ x: 0, y: 0 })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const messageListRef = useRef<HTMLUListElement>(null)
  const clientRef = useRef<ReturnType<typeof createRoomClient> | null>(null)
  const controls = useRef<MultiplayerControls>({ x: 0, y: 0, paused: true, recenter: false })
  snapshotRef.current = snapshot
  const online = status === 'online'
  controls.current.paused = !online || !!sceneError
  const self = snapshot?.players.find(player => player.id === snapshot.selfId)
  const distance = self && snapshot ? Math.hypot(self.x - snapshot.beacon.x, self.z - snapshot.beacon.z) : null
  const contributed = !!snapshot?.beacon.contributors.includes(snapshot.selfId)
  const completed = snapshot?.beacon.completed ?? false
  const remainingSeconds = snapshot ? participationSeconds(snapshot) : null
  const waitingForSlot = !!snapshot && !online && roomIsFull(snapshot)
  const canContribute = online && !!self && !!snapshot && distance !== null && distance <= snapshot.beacon.radius && self.supplies > 0 && !contributed && !completed && remainingSeconds !== 0
  const onlinePlayers = snapshot?.players.filter(player => player.online) ?? []

  useEffect(() => {
    const client = createRoomClient({
      onSnapshot: next => { snapshotRef.current = next; setSnapshot(next) },
      onStatus: next => {
        if (next !== 'online') { controls.current.x = 0; controls.current.y = 0; controls.current.paused = true; setStick({ x: 0, y: 0 }) }
        setStatus(next)
      },
      onError: setNetworkError
    })
    clientRef.current = client
    void client.start()
    return () => { client.dispose(); clientRef.current = null }
  }, [])

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

  useEffect(() => {
    const list = messageListRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [snapshot?.messages.length, panelOpen])

  async function login(event: FormEvent) {
    event.preventDefault()
    if (loginBusy) return
    const cleanUsername = username.trim()
    const validationError = authMode === 'register' ? registrationError(cleanUsername, password, confirmPassword) : null
    if (validationError) {
      setNetworkError(validationError)
      return
    }
    setLoginBusy(true); setNetworkError('')
    try {
      if (authMode === 'register') await clientRef.current?.register(cleanUsername, password, cleanUsername.toLowerCase() === 'kevin950805' ? claimCode : undefined)
      else await clientRef.current?.login(cleanUsername, password)
      setPassword(''); setConfirmPassword(''); setClaimCode(''); canvasRef.current?.focus({ preventScroll: true })
    }
    catch { /* The client surfaces the server error without retaining credentials. */ }
    finally { setLoginBusy(false) }
  }
  async function chat(event: FormEvent) {
    event.preventDefault()
    if (!online || chatBusy || !draft.trim()) return
    setChatBusy(true); setNotice('')
    try { await clientRef.current?.send({ type: 'chat', payload: { text: draft.trim() } }); setDraft('') }
    catch (error) { setNotice(error instanceof Error ? error.message : '訊息未送出，請再試一次。') }
    finally { setChatBusy(false) }
  }
  async function contribute() {
    if (!canContribute || contributeBusy) return
    setContributeBusy(true); setNotice('')
    try { await clientRef.current?.send({ type: 'contribute', payload: {} }); setNotice('交付申請已送達，等待共享進度更新。'); canvasRef.current?.focus({ preventScroll: true }) }
    catch (error) { setNotice(error instanceof Error ? error.message : '物資尚未交付。') }
    finally { setContributeBusy(false) }
  }
  function releaseStick() { controls.current.x = 0; controls.current.y = 0; setStick({ x: 0, y: 0 }); void clientRef.current?.move(0, 0) }
  function moveStick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!online || !event.currentTarget.hasPointerCapture(event.pointerId)) return
    controls.current.cancelNavigation?.()
    const bounds = event.currentTarget.getBoundingClientRect()
    const dx = event.clientX - bounds.left - bounds.width / 2
    const dy = event.clientY - bounds.top - bounds.height / 2
    const scale = Math.max(bounds.width / 2, Math.hypot(dx, dy))
    controls.current.x = dx / scale; controls.current.y = -dy / scale
    setStick({ x: dx / scale * 29, y: dy / scale * 29 })
  }

  return <main className="mp3d" aria-label="潮鳴港多人房間">
    <canvas ref={canvasRef} className="mp-canvas" tabIndex={0} aria-label="多人 3D 港口；點擊地面設定目的地，WASD 或方向鍵移動，拖曳轉動鏡頭" />
    <div className="mp-vignette" />
    <header className="mp-header">
      <div className="mp-brand"><span>◈</span><div><strong>TIDEBORN</strong><small>潮鳴港 · 共同世界</small></div></div>
      <span className={`mp-connection ${online ? 'online' : ''}`} role="status"><i />{STATUS_TEXT[status]}</span>
      {snapshot && <button className="mp-logout" onClick={() => { setNotice(''); void clientRef.current?.logout().catch(error => setNotice(error instanceof Error ? error.message : '登出失敗。')) }}>離開房間</button>}
    </header>

    <section className={`mp-mission ${completed ? 'complete' : ''}`} aria-label="港口共同事件">
      <span className="mp-eyebrow">港口委託 · 共同點燈</span>
      <h1>{completed ? '港口的燈，亮了。' : '一起點亮歸航的燈。'}</h1>
      <p>{completed ? '參與旅人的物資已化為燈火。每位參與者獲得 1 枚潮汐徽記。' : remainingSeconds !== null ? '點燈門檻已達成。截止前，其他旅人仍可各交付 1 份物資，一起獲得徽記。' : `走近北方燈塔，每位旅人交付 1 份物資。至少 ${snapshot?.beacon.required ?? 2} 位加入後，開啟限時共同點燈。`}</p>
      <div className="mp-mission-progress"><span>已交付 <b>{snapshot?.beacon.contributors.length ?? 0}</b> 位 · 至少 {snapshot?.beacon.required ?? 2} 位</span><span>{distance === null ? '等待登入' : completed ? '事件完成' : remainingSeconds !== null ? remainingSeconds > 0 ? `加入倒數 ${remainingSeconds} 秒` : '等待伺服器結算' : `燈塔 ${distance.toFixed(1)} m`}</span></div>
    </section>
    <SharedMap snapshot={snapshot} />

    {snapshot && <>
      <button className="mp-panel-toggle" aria-expanded={panelOpen} aria-controls="mp-room-panel" onClick={() => setPanelOpen(open => !open)}>{panelOpen ? '收起聊天' : `旅人與聊天 · ${onlinePlayers.length}`}</button>
      <aside id="mp-room-panel" className="mp-panel" data-open={panelOpen} aria-label="房間旅人與聊天">
        <div className="mp-panel-heading"><strong>同一片潮聲</strong><span>{snapshot.capacity.onlinePlayers} / {snapshot.capacity.maxOnlinePlayers} 位連線</span><button className="mp-panel-close" aria-label="收起聊天面板" onClick={() => setPanelOpen(false)}>×</button></div>
        <p className="mp-capacity">{snapshot.capacity.reservedPlayers > 0 ? `${snapshot.capacity.reservedPlayers} 個席位保留重連中` : '已連線的旅人共享同一座港口'}</p><ul className="mp-players" aria-label="房間玩家" tabIndex={0}>{snapshot.players.map(player => <li key={player.id} className={player.online ? '' : 'offline'}><i className={player.id === snapshot.selfId ? 'self' : ''} /><div><strong>{player.name}{player.id === snapshot.selfId ? ' · 你' : ''}</strong><small>{player.online ? `物資 ${player.supplies} · 徽記 ${player.rewards}` : '尚未連線'}</small></div><span>{snapshot.beacon.contributors.includes(player.id) ? '已交付' : player.online ? '港口中' : '離線'}</span></li>)}</ul>
        <div className="mp-chat-heading">港口聊天 <small>房間內的旅人都看得見</small></div>
        <ul className="mp-messages" ref={messageListRef} aria-label="港口聊天訊息" aria-live="polite" aria-relevant="additions text">{snapshot.messages.length === 0 ? <li className="mp-empty">和同行的旅人打聲招呼。</li> : snapshot.messages.map(message => <li key={message.id}><strong>{message.name}{message.playerId === snapshot.selfId ? ' · 你' : ''}</strong><p>{message.text}</p></li>)}</ul>
        <form className="mp-chat-form" onSubmit={chat}><label className="mp-sr-only" htmlFor="mp-chat">聊天訊息</label><input id="mp-chat" value={draft} onChange={event => setDraft(event.target.value)} maxLength={240} placeholder={online ? '寫給同行的旅人…' : '等待重新連線…'} disabled={!online} autoComplete="off" /><button disabled={!online || chatBusy || !draft.trim()} type="submit">{chatBusy ? '傳送中' : '傳送'}</button></form>
        <p className="mp-npc-note">共享 NPC 自主模擬尚未整合。</p>
      </aside>
    </>}

    {snapshot && <footer className="mp-bottom"><section className="mp-self" aria-label="自己的伺服器物資"><span className="mp-avatar">旅</span><div><strong>{self?.name ?? '旅人'}</strong><p>物資 <b>{self?.supplies ?? 0}</b><span />潮汐徽記 <b>{self?.rewards ?? 0}</b></p></div></section><small className="mp-authority">本機多人房間 · 進度由伺服器保存 · v{APP_VERSION}</small></footer>}
    {snapshot && <div className="mp-actions"><small>{completed ? '燈火由所有人共同看見' : contributed ? remainingSeconds !== null ? '已交付，等待共同點燈結算' : '已交付，等待更多旅人加入' : !online ? '連線後即可繼續' : distance !== null && distance > snapshot.beacon.radius ? `走近燈塔 ${snapshot.beacon.radius} m 內` : '交付後消耗 1 份物資'}</small><button className="mp-primary" disabled={!canContribute || contributeBusy} onClick={() => { void contribute() }}>{contributeBusy ? '正在交付…' : completed ? '共同事件已完成' : contributed ? '物資已交付' : '交付物資 · 點亮燈塔'}</button><button className="mp-camera-reset" onClick={() => { controls.current.recenter = true; canvasRef.current?.focus({ preventScroll: true }) }}>重置鏡頭</button></div>}
    {snapshot && <div className="mp-touch"><div className="mp-stick" role="group" aria-label="觸控移動搖桿；也可點擊港口地面前往目的地" onPointerDown={event => { if (!online) return; event.currentTarget.setPointerCapture(event.pointerId); moveStick(event) }} onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}><span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} /><small>移動 · 點地前往</small></div></div>}
    <div className="mp-controls-hint">點擊地面前往目的地 · WASD／方向鍵或搖桿可取消 · 拖曳轉動鏡頭</div>
    {snapshot && <div className="mp-feedback" role="status" aria-live="polite">{networkError || notice || navigationStatus}</div>}
    {snapshot && !online && <div className="mp-offline"><strong>{waitingForSlot ? '房間席位已滿' : '房間正在重新連線'}</strong><span>{waitingForSlot ? `${snapshot.capacity.maxOnlinePlayers} 個席位使用或保留中，正在等待空位。` : '移動與交付已暫停，先前進度保留。'}</span><button onClick={() => { void clientRef.current?.reconnect() }}>立即重連</button></div>}

    {!snapshot && <div className="mp-login-backdrop"><section className="mp-login" aria-labelledby="mp-login-title"><span className="mp-eyebrow">TIDEBORN · LOCAL MULTIPLAYER</span><h2 id="mp-login-title">這一次，<br />和旅人們一起同行。</h2><p>不同旅人、同一座港口。一起行走、交談，點亮歸航的燈塔。</p><div className="mp-auth-tabs" role="group" aria-label="登入或申請帳號"><button type="button" aria-pressed={authMode === 'login'} onClick={() => { setAuthMode('login'); setNetworkError('') }}>登入</button><button type="button" aria-pressed={authMode === 'register'} onClick={() => { setAuthMode('register'); setNetworkError('') }}>申請帳號</button></div><form onSubmit={login}><label htmlFor="mp-username">帳號</label><input id="mp-username" name="username" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" required maxLength={authMode === 'register' ? 32 : 100} /><label htmlFor="mp-password">密碼</label><input id="mp-password" name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} required maxLength={200} />{authMode === 'register' && <><label htmlFor="mp-confirm-password">再次輸入密碼</label><input id="mp-confirm-password" name="confirmPassword" type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" required maxLength={200} />{username.trim().toLowerCase() === 'kevin950805' && <><label htmlFor="mp-claim-code">一次性認領碼</label><input id="mp-claim-code" name="claimCode" type="password" value={claimCode} onChange={event => setClaimCode(event.target.value)} autoComplete="off" required /></>}</>}{networkError && <p className="mp-login-error" role="alert">{networkError}</p>}<button className="mp-primary" type="submit" disabled={loginBusy}>{loginBusy ? '處理中…' : authMode === 'register' ? '建立帳號並進入 →' : '進入共同港口 →'}</button></form><small>僅使用多人測試帳號。正式站帳號與單人存檔不會帶入。</small><a href="/prototype-3d">返回單人遠征</a></section></div>}
    {snapshot && !ready && !sceneError && <div className="mp-scene-loading" role="status">正在點亮港口…</div>}
    {sceneError && <div className="mp-scene-error" role="alert"><strong>3D 畫面暫時無法啟動</strong><p>{sceneError}</p><button onClick={() => window.location.reload()}>重新載入</button></div>}
  </main>
}

