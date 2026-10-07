import { cardInfo, EXPEDITION_ENCOUNTERS, getEncounterChoices, getExpedition, getNextExpeditionPreview } from './model'
import { CardArt } from './CardArt'
import type { DemoState, EncounterChoice, EncounterId } from './types'

export function EncounterDialog({ state, id, onChoose, onClose }: {
  state: DemoState; id: EncounterId; onChoose: (choice: EncounterChoice) => void; onClose: () => void
}) {
  const config = EXPEDITION_ENCOUNTERS[id]
  const expedition = getExpedition(state)
  return <>
    <span className="p3d-kicker">支線遭遇 · 第 {expedition.number} 趟</span>
    <h2>{config.name}</h2>
    <p>{id === 'forestCache' ? '芙恩留下的藥草箱，被一隻石衛看守。回潮能安撫它；迎戰則能帶回更完整的補給。' : '洛安標記的古老哨衛仍守著物資。渡風能讓它認出通行紋章；勝過它，才能取走全部補給。'}</p>
    <div className="p3d-encounter-resource"><span>可用刻印 <b>{expedition.seals}</b></span><span>能量 <b>{Math.floor(state.energy)} / 100</b></span></div>
    <div className="p3d-choices">{getEncounterChoices(state, id).map(option => <article key={option.choice} className={option.choice}>
      <div className="p3d-choice-icon">{option.choice === 'safe' ? <CardArt card={config.safeCard} /> : <span aria-hidden="true">◇</span>}</div>
      <span className="p3d-kicker">{option.choice === 'safe' ? '卡片避險' : '接受戰鬥'}</span>
      <h3>{option.label}</h3>
      <p>{option.detail}</p>
      <dl><dt>代價</dt><dd>{option.choice === 'safe' ? `${cardInfo[config.safeCard].name} · 1 刻印 + ${config.energyCost} 能量` : '星火每次 18 能量、25 傷害；備戰與每次施放後冷卻 1 秒'}</dd><dt>風險</dt><dd>{option.choice === 'safe' ? '不戰鬥；刻印本趟不再生' : `敵人 ${config.maxHp} 生命，${config.range} m 震擊 ${config.damage} 傷害`}</dd><dt>取得</dt><dd>{option.reward} 份營地物資</dd></dl>
      {option.reason && <small className="p3d-choice-reason">{option.reason}</small>}
      <button className={option.choice === 'safe' ? 'p3d-primary' : 'p3d-secondary'} disabled={!option.enabled} onClick={() => onChoose(option.choice)}>{option.choice === 'safe' ? '消耗刻印 · 安全取得' : '開始戰鬥 · 勝利後取得'}</button>
    </article>)}</div>
    <p className="p3d-muted">每個遭遇本趟只領一次。營地每份物資可在下一趟換 5 護盾（最多 40）；安全處理會讓島民為下一趟多備 1 枚刻印，每趟最多加 1 枚。</p>
    <button className="p3d-secondary" onClick={onClose}>先離開，稍後再決定</button>
  </>
}

export function NextExpeditionDialog({ state, onStart, onClose }: {
  state: DemoState; onStart: () => void; onClose: () => void
}) {
  const expedition = getExpedition(state)
  const preview = getNextExpeditionPreview(state)
  return <>
    <span className="p3d-kicker">米拉的遠征準備</span><h2>第 {preview.number} 趟，帶著經驗出發。</h2>
    <p>島民記得你的選擇，也保留累積的技能、信任與記憶。這次帶回的物資，會成為下次真正能擋下傷害的護盾。</p>
    <div className="p3d-trip-ledger"><div><span>營地物資</span><strong>{expedition.campSupplies} → {expedition.campSupplies - preview.spentSupplies}</strong><small>使用 {preview.spentSupplies} 份，未使用部分保留</small></div><div><span>開局護盾</span><strong>{preview.shieldGranted}</strong><small>受傷先扣護盾；死亡回港不補回</small></div><div><span>可用刻印</span><strong>{preview.seals}</strong><small>{preview.extraSealGranted ? '安全選擇的記憶，額外準備 1 枚' : '基本補給 1 枚；本趟沒有安全選擇加成'}</small></div></div>
    <p className="p3d-muted">主線、兩個遭遇與位置重新開始，生命與能量補滿。本趟若有未完成的戰鬥，撤離時不發獎勵。</p>
    {preview.reason && <p className="p3d-choice-reason">{preview.reason}</p>}
    <div className="p3d-dialog-buttons"><button className="p3d-secondary" onClick={onClose}>留在島上</button><button className="p3d-primary" disabled={!preview.canStart} onClick={onStart}>領取準備 · 開始第 {preview.number} 趟</button></div>
  </>
}
