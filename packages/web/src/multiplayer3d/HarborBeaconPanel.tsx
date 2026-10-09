import { useEffect, useRef, useState } from 'react'
import { beaconRemainingSeconds, harborContributionStatus, harborProgressText } from './harborBeacon'
import type { createWorldClient } from './client'
import type { PlayerWorldSnapshot } from './types'

export function HarborBeaconPanel({ snapshot, online, client, stopMovement }: {
  snapshot: PlayerWorldSnapshot
  online: boolean
  client: ReturnType<typeof createWorldClient> | null
  stopMovement: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  const pending = useRef(false)
  const contributed = snapshot.beacon.contributors.includes(snapshot.selfId)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!online || contributed) { pending.current = false; setBusy(false) }
  }, [online, snapshot.selfId, contributed])
  const contribution = harborContributionStatus(snapshot, online)
  const seconds = beaconRemainingSeconds(snapshot)
  const beacon = snapshot.beacon
  async function contribute() {
    if (!client || pending.current || !contribution.ready) return
    const owningContext = client.captureSessionContext()
    pending.current = true; setBusy(true); setError(''); stopMovement()
    const current = () => {
      const liveContext = client.captureSessionContext()
      return mounted.current && liveContext.epoch === owningContext.epoch && liveContext.accountId === owningContext.accountId
    }
    try {
      const accepted = await client.contribute()
      if (!current()) return
      if (!accepted) { pending.current = false; setBusy(false) }
    } catch (cause) {
      if (!current()) return
      pending.current = false; setBusy(false)
      setError(cause instanceof Error ? cause.message : '物資交付未完成。')
    }
  }
  return <details className="mp-beacon-panel" aria-label="港口共同點燈">
    <summary>港口共同點燈 · {beacon.completed ? '已完成' : beacon.phase === 'collecting' ? '收集中' : '等待加入'}</summary>
    <div className="mp-beacon-body">
    <p>{beacon.completed ? '燈塔已點亮，參與者的徽記以伺服器保存結果為準。' : `每位旅人交付 1 份物資，至少 ${beacon.required} 位加入後，開啟 ${beacon.participationWindowTicks * beacon.tickMs / 1000} 秒收集。`}</p>
    <div className="mp-beacon-progress"><span>已交付 <b>{beacon.contributors.length}</b> 位 · 至少 {beacon.required} 位</span><span>{beacon.completed ? '共同事件完成' : seconds === null ? '等待旅人加入' : seconds > 0 ? `加入倒數 ${seconds} 秒` : '等待伺服器結算'}</span></div>
    <p className="mp-beacon-counters" aria-label="自己的伺服器物資">{harborProgressText(snapshot.harborProgress)}</p>
    <small>{busy && !beacon.contributors.includes(snapshot.selfId) ? '交付已送出，等待伺服器確認進度。' : contribution.text}</small>
    <button className="mp-primary" type="button" disabled={!client || !contribution.ready || busy} onClick={() => { void contribute() }}>{busy ? '等待交付確認…' : beacon.completed ? '共同事件已完成' : beacon.contributors.includes(snapshot.selfId) ? '物資已交付' : '交付物資 · 點亮燈塔'}</button>
    {error && <p role="alert">{error}</p>}
    </div>
  </details>
}
