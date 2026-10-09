import type { HarborProgress, PlayerWorldSnapshot } from './types'

/** These are the original harbor counters, with no currency/inventory conversion. */
export function harborProgressText(progress: HarborProgress): string {
  return progress.status === 'ready' ? `物資 ${progress.supplies} · 潮汐徽記 ${progress.rewards}` : '舊港口進度待核實'
}
export function beaconRemainingSeconds(snapshot: PlayerWorldSnapshot): number | null {
  const { tick, closesAtTick, tickMs } = snapshot.beacon
  return closesAtTick === null ? null : Math.max(0, Math.ceil((closesAtTick - tick) * tickMs / 1000))
}
export function harborBeaconVisual(snapshot: PlayerWorldSnapshot) {
  return snapshot.tileId === snapshot.beacon.tileId ? snapshot.beacon : null
}
export function harborContributionStatus(snapshot: PlayerWorldSnapshot, online: boolean): { ready: boolean; text: string } {
  const beacon = snapshot.beacon
  if (snapshot.harborProgress.status !== 'ready') return { ready: false, text: '舊物資、徽記與共同事件的帳號關聯待核實，暫停交付。' }
  if (beacon.completed) return { ready: false, text: beacon.awardedAccountIds.includes(snapshot.selfId) ? '共同點燈已完成，徽記已由伺服器保存。' : '本次共同點燈已完成。' }
  if (beacon.contributors.includes(snapshot.selfId)) return { ready: false, text: '物資已交付，等待共同點燈結算。' }
  if (beaconRemainingSeconds(snapshot) === 0) return { ready: false, text: '本次收集已截止，等待伺服器結算。' }
  if (!online) return { ready: false, text: '世界連線後即可繼續交付。' }
  if (snapshot.tileId !== beacon.tileId) return { ready: false, text: '返回碼頭區，走近港口燈塔後交付。' }
  const self = snapshot.players.find(player => player.accountId === snapshot.selfId)
  if (!self?.online) return { ready: false, text: '等待共同世界連線席位。' }
  const distance = Math.hypot(self.x - beacon.x, self.z - beacon.z)
  if (distance > beacon.radius) return { ready: false, text: `走近燈塔 ${beacon.radius} m 內（目前 ${distance.toFixed(1)} m）。` }
  if (snapshot.harborProgress.supplies < 1) return { ready: false, text: '沒有可交付的物資。' }
  return { ready: true, text: '交付消耗 1 份物資，結果以伺服器進度為準。' }
}
