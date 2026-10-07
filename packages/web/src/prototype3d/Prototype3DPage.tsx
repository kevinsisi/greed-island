import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { cardInfo, createNewGame, getInteraction, getObjective, loadDemo, reduceDemo, saveDemo } from './model'
import { createDemoScene } from './scene'
import { CardArt } from './CardArt'
import { IslandMap } from './IslandMap'
import { NpcJournal } from './NpcJournal'
import { PROTOTYPE_VERSION, type CardId, type DemoAction, type DemoControls, type DemoState, type NpcId, type SceneTelemetry } from './types'
import './prototype.css'

const CARDS: CardId[] = ['ember', 'tide', 'wind']
type Modal = 'intro' | 'guide' | 'delivery' | 'help' | 'cards' | 'map' | 'reset' | null

function initialState(): DemoState {
  try { return loadDemo(window.localStorage) } catch { return createNewGame() }
}

export default function Prototype3DPage() {
  const [state, setState] = useState(initialState)
  const stateRef = useRef(state)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const controls = useRef<DemoControls>({ x: 0, y: 0, lookX: 0, lookY: 0, sprint: false, paused: true, recenter: false })
  const [modal, setModal] = useState<Modal>('intro')
  const modalRef = useRef<Modal>('intro')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(true)
  const [toast, setToast] = useState('')
  const [journalOpen, setJournalOpen] = useState(false)
  const [journalNpc, setJournalNpc] = useState<NpcId>('guide')
  const [telemetry, setTelemetry] = useState<SceneTelemetry>({ zone: '潮鳴港', distance: 4, nearby: null, enemyNearby: false, cameraOccluded: false, heading: 0 })
  const [stick, setStick] = useState({ x: 0, y: 0 })
  const objective = getObjective(state)
  const dead = state.hp <= 0

  const persist = useCallback((next: DemoState) => {
    try { setSaved(saveDemo(window.localStorage, next)) } catch { setSaved(false) }
  }, [])

  const showModal = useCallback((next: Modal) => {
    if (next) setJournalOpen(false)
    modalRef.current = next
    setModal(next)
    controls.current.paused = next !== null || stateRef.current.hp <= 0
    controls.current.x = 0
    controls.current.y = 0
    setStick({ x: 0, y: 0 })
    if (!next) canvasRef.current?.focus({ preventScroll: true })
  }, [])

  const apply = useCallback((action: DemoAction) => {
    const prev = stateRef.current
    const next = reduceDemo(prev, action)
    if (next === prev) {
      if (action.type === 'cast') setToast(action.card === 'wind' && prev.stage === 'forest' ? '先收集三枚光種並擊退石衛，取得渡風。' : action.card === 'ember' ? '靠近森林石衛再使用星火；需要 18 點能量。' : action.card === 'wind' ? '帶著渡風靠近遺跡封印。' : '回潮需要 30 點能量，生命全滿時不用治療。')
      return
    }
    stateRef.current = next
    setState(next)
    if (action.type !== 'move' && action.type !== 'recover' && action.type !== 'tick') persist(next)
    if (action.type === 'cast' && prev.energy > next.energy) {
      setToast(action.card === 'ember' ? '星火命中 · 石衛受到 25 點傷害' : action.card === 'tide' ? '回潮 · 生命恢復' : '渡風 · 古道已開啟')
    }
    if (next.seeds.length > prev.seeds.length) setToast(`光種 ${next.seeds.length} / 3 · 森林記住了你的腳步`)
    if (prev.enemyHp > 0 && next.enemyHp === 0) setToast('石衛已擊退 · 繼續收集光種')
    if (next.stage === 'gate' && prev.stage !== 'gate') setToast('獲得新卡：渡風 · 前往北方遺跡')
    if (next.stage === 'return' && prev.stage !== 'return') setToast('已取得潮汐晶核 · 回港口找守燈人')
    if (next.stage === 'complete' && prev.stage !== 'complete') setToast('遠征完成 · 潮鳴港的燈再次亮起')
    controls.current.paused = modalRef.current !== null || next.hp <= 0
  }, [persist])

  const dispatch = useCallback((action: DemoAction) => {
    if (modalRef.current !== null && action.type !== 'move') return
    if (action.type === 'interact') {
      const current = stateRef.current
      const interaction = getInteraction(current)
      if (interaction?.kind === 'guide' && current.stage === 'arrival') { showModal('guide'); return }
      if ((interaction?.kind === 'camp' || interaction?.kind === 'guide') && current.stage === 'return') { showModal('delivery'); return }
      if (interaction?.kind === 'gate') { apply({ type: 'select-card', card: 'wind' }); apply({ type: 'cast', card: 'wind' }); return }
      if (interaction?.kind === 'npc' && interaction.npcId) { setJournalNpc(interaction.npcId); setJournalOpen(true); return }
    }
    apply(action)
  }, [apply, showModal])

  const dispatchRef = useRef(dispatch)
  dispatchRef.current = dispatch
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let controller: ReturnType<typeof createDemoScene> | undefined
    try {
      controller = createDemoScene(canvas, {
        getState: () => stateRef.current,
        controls: controls.current,
        dispatch: (action) => dispatchRef.current(action),
        onTelemetry: setTelemetry,
        onReady: () => setReady(true),
        onError: setError,
      })
    } catch { setError('無法啟動 3D 畫面。請使用支援 WebGL 的瀏覽器，並啟用硬體加速。') }
    return () => controller?.dispose()
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => persist(stateRef.current), 1000)
    const flush = () => { persist(stateRef.current); controls.current.x = 0; controls.current.y = 0 }
    window.addEventListener('pagehide', flush)
    const key = (event: KeyboardEvent) => {
      if (event.code === 'Escape') { event.preventDefault(); showModal(modalRef.current ? null : 'help') }
      if (event.repeat || /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)) return
      if (event.code === 'KeyM') { event.preventDefault(); showModal(modalRef.current === 'map' ? null : 'map') }
      if (event.code === 'KeyN' && !modalRef.current) { event.preventDefault(); setJournalOpen(open => !open) }
    }
    window.addEventListener('keydown', key)
    return () => { window.clearInterval(timer); window.removeEventListener('pagehide', flush); window.removeEventListener('keydown', key); persist(stateRef.current) }
  }, [persist, showModal])

  useEffect(() => {
    if (!modal || !ready) return
    const dialog = dialogRef.current
    dialog?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialog) return
      const items = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'))
      const first = items[0], last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', trap)
    return () => window.removeEventListener('keydown', trap)
  }, [modal, ready])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 4200)
    return () => window.clearTimeout(timer)
  }, [toast])

  function moveStick(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const box = event.currentTarget.getBoundingClientRect()
    const dx = (event.clientX - box.left - box.width / 2) / 38
    const dy = (event.clientY - box.top - box.height / 2) / 38
    const scale = Math.max(1, Math.hypot(dx, dy))
    controls.current.x = dx / scale
    controls.current.y = -dy / scale
    setStick({ x: dx / scale * 31, y: dy / scale * 31 })
  }
  function releaseStick() { controls.current.x = 0; controls.current.y = 0; setStick({ x: 0, y: 0 }) }
  function reset() {
    const next = createNewGame()
    stateRef.current = next; setState(next); persist(next)
    controls.current.recenter = true
    setToast('新遠征已開始 · 僅重設這份原型存檔')
    showModal(null)
  }
  function cast(card: CardId) {
    dispatch({ type: 'select-card', card })
    dispatch({ type: 'cast', card })
    canvasRef.current?.focus({ preventScroll: true })
  }

  return <main className="p3d" aria-label="潮汐遠征 3D 原型">
    <canvas ref={canvasRef} className="p3d-canvas" tabIndex={0} aria-label="3D 遊戲場景，WASD 移動，拖曳轉動鏡頭，E 互動" />
    <div className="p3d-vignette" />
    <header className="p3d-top">
      <div className="p3d-wordmark"><span className="p3d-emblem">◈</span><div><span>TIDEBORN</span><small>潮汐遠征 <b>3D 原型</b></small></div></div>
      <div className="p3d-destination"><span>{['北 N','東北 NE','東 E','東南 SE','南 S','西南 SW','西 W','西北 NW'][Math.round(telemetry.heading / (Math.PI / 4)) % 8]}</span><i /><strong>{objective.destination}</strong><small>{Math.round(telemetry.distance)} m</small></div>
      <div className="p3d-tools"><span className={saved ? 'p3d-save' : 'p3d-save failed'}>{saved ? '本機存檔' : '無法儲存'}</span><button onClick={() => showModal('help')} aria-label="操作說明與暫停">?</button><button onClick={() => showModal('reset')} aria-label="重開新局">↺</button></div>
    </header>

    <section className="p3d-mission" aria-label="目前任務">
      <span className="p3d-kicker">第一章 · 港口的回聲</span>
      <h1>{objective.title}</h1>
      <p>{objective.detail}</p>
      <div className="p3d-progress"><span className={state.seeds.length === 3 ? 'done' : ''}>光種 {state.seeds.length}/3</span><span className={state.enemyHp === 0 ? 'done' : ''}>{state.enemyHp === 0 ? '石衛已擊退' : '森林石衛'}</span><span className={state.relic ? 'done' : ''}>{state.relic ? '晶核已取得' : '潮汐晶核'}</span></div>
    </section>

    <div className="p3d-zone"><span>{telemetry.zone}</span><small>{telemetry.cameraOccluded ? '鏡頭避障中' : '沿著金色路標前進'}</small></div>
    <nav className="p3d-atlas" aria-label="島嶼導覽">
      <button className="p3d-map-button" onClick={() => showModal('map')} aria-label="展開島嶼地圖"><IslandMap state={state} compact /><span>地圖 · M</span></button>
      <button className="p3d-journal-button" onClick={() => { setJournalOpen(open => !open); canvasRef.current?.focus() }} aria-expanded={journalOpen}>島民見聞 · N</button>
    </nav>
    {journalOpen && !modal && <aside className="p3d-journal" aria-label="島民自主行為觀察">
      <div className="p3d-journal-header"><div><strong>島民見聞</strong><small>世界持續演進 · {Math.floor((state.worldTime ?? 0) / 60)} 分 {Math.floor((state.worldTime ?? 0) % 60)} 秒</small></div><button aria-label="關閉島民見聞" onClick={() => { setJournalOpen(false); canvasRef.current?.focus() }}>×</button></div>
      <NpcJournal key={journalNpc} state={state} initialId={journalNpc} onTalk={id => apply({ type: 'npc-talk', id })}/>
    </aside>}
    {telemetry.enemyNearby && state.enemyHp > 0 && state.stage === 'forest' && <div className="p3d-enemy"><span>苔岩石衛 <b>{state.enemyHp} / 100</b></span><div><i style={{ width: `${state.enemyHp}%` }} /></div><small>紅圈蓄力時離開 · 星火射程 11 m</small></div>}
    <div className="p3d-toast" role="status" aria-live="polite">{toast}</div>

    <footer className="p3d-bottom">
      <section className="p3d-vitals" aria-label="玩家狀態"><div className="p3d-avatar">旅</div><div><strong>逐潮旅人 <small>LV. 01</small></strong><label>生命 <b>{Math.round(state.hp)} / 100</b></label><div className="p3d-bar hp"><i style={{ width: `${state.hp}%` }} /></div><label>能量 <b>{Math.round(state.energy)} / 100</b></label><div className="p3d-bar energy"><i style={{ width: `${state.energy}%` }} /></div></div></section>
      <div className="p3d-cards" aria-label="卡片技能">{CARDS.map((card, index) => {
        const locked = card === 'wind' && (state.stage === 'arrival' || state.stage === 'forest')
        return <button key={card} className={`p3d-card ${card} ${state.selectedCard === card ? 'selected' : ''}`} disabled={locked || dead || !!modal} onClick={() => cast(card)} aria-label={`${cardInfo[card].name}${locked ? '，尚未解鎖' : '，使用卡片'}`}><span className="p3d-card-number">0{index + 1}<kbd>{index + 1}</kbd></span><CardArt card={card} /><strong>{cardInfo[card].name}</strong><small>{locked ? '擊退石衛後解鎖' : cardInfo[card].subtitle}</small><span className="p3d-card-cost">{locked ? '未解鎖' : `${cardInfo[card].cost} 能量`}</span></button>
      })}<button className="p3d-book" onClick={() => showModal('cards')} aria-label="打開卡冊">卡冊</button></div>
      <div className="p3d-actions"><button className="p3d-interact" disabled={!telemetry.nearby || dead || !!modal} onClick={() => dispatch({ type: 'interact' })}><kbd>E</kbd><span>{telemetry.nearby?.label ?? '靠近光點互動'}</span></button><button className="p3d-recenter" onClick={() => { controls.current.recenter = true; canvasRef.current?.focus() }}>重置鏡頭</button></div>
    </footer>

    <div className="p3d-touch-controls"><div className="p3d-stick" role="group" aria-label="觸控移動搖桿" onPointerDown={(event) => { if (modal || dead) return; event.currentTarget.setPointerCapture(event.pointerId); moveStick(event) }} onPointerMove={moveStick} onPointerUp={releaseStick} onPointerCancel={releaseStick} onLostPointerCapture={releaseStick}><span style={{ transform: `translate(${stick.x}px, ${stick.y}px)` }} /><small>移動</small></div><span className="p3d-look-hint">拖曳畫面轉動鏡頭</span></div>
    <div className="p3d-controls-hint"><span><kbd>W A S D</kbd> 移動</span><span>拖曳 · 轉動鏡頭</span><span><kbd>Shift</kbd> 快跑</span><span><kbd>Space</kbd> 使用選中卡片</span></div>
    <div className="p3d-disclaimer">獨立原型資料 · 不連正式世界 <span>v{PROTOTYPE_VERSION}</span></div>

    {(!ready && !error) && <div className="p3d-loading"><div className="p3d-loader" /><p>正在點亮潮鳴港…</p></div>}
    {error && <div className="p3d-overlay"><section className="p3d-dialog"><span className="p3d-kicker">畫面暫時無法啟動</span><h2>這趟遠征需要 WebGL</h2><p>{error}</p><button className="p3d-primary" onClick={() => window.location.reload()}>重新載入</button></section></div>}

    {modal && ready && !error && <div className="p3d-overlay"><section ref={dialogRef} className={`p3d-dialog ${modal === 'cards' || modal === 'map' ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={modal === 'reset' ? '重開新局確認' : modal === 'map' ? '島嶼地圖' : modal === 'cards' ? '紋卡圖鑑' : '遠征選單'}>
      {modal === 'intro' && <><span className="p3d-kicker">GREED ISLAND · PLAYABLE PROTOTYPE</span><h2>潮聲之外，<br /><em>有一座沉睡的島。</em></h2><p>港口的燈熄了。帶著紋卡穿過森林，找回遺跡中的潮汐晶核，讓歸航的人看見光。</p><div className="p3d-intro-route"><span>01 港口接任務</span><i>→</i><span>02 森林與石衛</span><i>→</i><span>03 遺跡取晶核</span></div><p className="p3d-muted">WASD 移動 · 拖曳轉鏡頭 · E 互動<br />手機使用左側搖桿，點卡片施放。進度自動保存在這台瀏覽器。</p><button className="p3d-primary" onClick={() => showModal(null)}>{state.stage === 'arrival' ? '踏上旅程' : '繼續遠征'} <span>→</span></button><small className="p3d-note">不需要登入 · 不影響正式帳號與世界</small></>}
      {modal === 'guide' && <><span className="p3d-kicker">守燈人 · 米拉</span><h2>替港口，帶回一道光。</h2><p>北方森林有三枚光種。收集它們，擊退遺跡前的苔岩石衛，就能喚醒「渡風」紋卡。</p><p>用渡風解開封印，取回潮汐晶核。我會在這裡等你。</p><div className="p3d-dialog-tip">星火攻擊石衛；回潮治療自己。能量會自動恢復，石衛蓄力時記得退開。</div><button className="p3d-primary" onClick={() => { apply({ type: 'interact' }); showModal(null) }}>接下委託 →</button></>}
      {modal === 'delivery' && <><span className="p3d-kicker">守燈人 · 米拉</span><h2>你把潮汐帶回來了。</h2><p>晶核的光會替每一艘歸航的船指路。這條通往遺跡的路，也會永遠記得你。</p><button className="p3d-primary" onClick={() => { apply({ type: 'interact' }); showModal(null) }}>交付晶核 · 完成遠征</button></>}
      {modal === 'help' && <><span className="p3d-kicker">遠征暫停</span><h2>方向在腳下，力量在手中。</h2><dl className="p3d-help"><dt>移動</dt><dd>WASD／方向鍵；手機左下搖桿</dd><dt>鏡頭</dt><dd>按住畫面拖曳；滾輪拉近／拉遠</dd><dt>互動</dt><dd>靠近人物或光點，按 E 或互動按鈕</dd><dt>紋卡</dt><dd>1／2／3 立即施放；空白鍵重用選中卡片</dd><dt>避開攻擊</dt><dd>石衛腳下亮紅圈時退開，Shift 快跑</dd></dl><button className="p3d-primary" onClick={() => showModal(null)}>返回島嶼</button></>}
      {modal === 'cards' && <><span className="p3d-kicker">旅人的紋卡冊</span><h2>三張卡，三種改變世界的方式。</h2><div className="p3d-codex">{CARDS.map(card => <article className={card} key={card}><CardArt card={card} large /><h3>{cardInfo[card].name}</h3><p>{cardInfo[card].description}</p><small>{cardInfo[card].cost} 能量</small></article>)}</div><button className="p3d-primary" onClick={() => showModal(null)}>收起卡冊</button></>}
      {modal === 'map' && <><div className="p3d-map-heading"><div><span className="p3d-kicker">旅人的海圖 · 北方朝上</span><h2>潮鳴島</h2></div><button className="p3d-dialog-close" aria-label="收起地圖" onClick={() => showModal(null)}>×</button></div><IslandMap state={state}/></>}
      {modal === 'reset' && <><span className="p3d-kicker">重開新局</span><h2>重新踏上這段旅程？</h2><p>只會清除這份 3D 原型的任務、卡片與位置。正式世界及帳號資料不受影響。</p><div className="p3d-dialog-buttons"><button className="p3d-secondary" onClick={() => showModal(null)}>繼續目前進度</button><button className="p3d-primary" onClick={reset}>確認重開</button></div></>}
    </section></div>}
    {dead && !modal && <div className="p3d-overlay"><section className="p3d-dialog" role="dialog" aria-modal="true" aria-label="角色倒下"><span className="p3d-kicker">潮汐仍在等你</span><h2>先回港口休息。</h2><p>已取得的光種、紋卡和任務進度都會保留。回潮可以在戰鬥中恢復生命。</p><button className="p3d-primary" onClick={() => apply({ type: 'respawn' })}>回港口 · 恢復生命</button></section></div>}
    {state.stage === 'complete' && !modal && <div className="p3d-completed"><span>遠征完成</span><h2>港口再次亮起。</h2><p>三枚光種、一場遭遇、一條被你開啟的古道。</p><button onClick={() => showModal('reset')}>再來一趟 →</button><small>也可以繼續探索；進度已保留。</small></div>}
  </main>
}
