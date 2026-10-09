export const HARBOR_BEACON_EVENT_TYPES = ['PLAYER_HARBOR_CONTRIBUTED', 'HARBOR_BEACON_COLLECTION_OPENED', 'HARBOR_BEACON_TICKED', 'HARBOR_BEACON_COMPLETED', 'HARBOR_BEACON_REWARDED', 'HARBOR_BEACON_LEGACY_PROGRESS_RESTORED'] as const
export type HarborBeaconEventType = (typeof HARBOR_BEACON_EVENT_TYPES)[number]
export type HarborPlayerProgress = Readonly<{ accountId: number; supplies: number; rewards: number }>
export type PreservedHarborState = Readonly<{ tick: number; config: Readonly<{ maxOnlinePlayers: number; minParticipants: number; participationWindowTicks: number }>;
  players: readonly HarborPlayerProgress[]; contributors: readonly number[]; completed: boolean; closesAtTick: number | null; awardedAccountIds: readonly number[] }>
export type HarborBeaconEventData = Readonly<{ beaconId: 'harbor-beacon-1'; tileId: 't_dock'; beaconTick: number; movementStep: number }> & (
  | Readonly<{ kind: 'contributed'; accountId: number; suppliesBefore: number; suppliesAfter: number; rewardsBefore: number; clientCommandId: string; intentDigest: string }>
  | Readonly<{ kind: 'collection-opened'; closesAtTick: number }>
  | Readonly<{ kind: 'ticked' }>
  | Readonly<{ kind: 'completed' }>
  | Readonly<{ kind: 'rewarded'; accountId: number; rewardsBefore: number; rewardsAfter: number }>
  | Readonly<{ kind: 'legacy-restored'; namespace: string; sourceDigest: string; reviewReference: string; state: PreservedHarborState }>
)
const kinds: Record<HarborBeaconEventType, HarborBeaconEventData['kind']> = { PLAYER_HARBOR_CONTRIBUTED: 'contributed', HARBOR_BEACON_COLLECTION_OPENED: 'collection-opened', HARBOR_BEACON_TICKED: 'ticked', HARBOR_BEACON_COMPLETED: 'completed', HARBOR_BEACON_REWARDED: 'rewarded', HARBOR_BEACON_LEGACY_PROGRESS_RESTORED: 'legacy-restored' }
const integer = (value: unknown, minimum = 0): value is number => Number.isSafeInteger(value) && (value as number) >= minimum
export function validatePreservedHarborState(value: unknown): value is PreservedHarborState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as PreservedHarborState, c = state.config
  if (!integer(state.tick) || !c || !integer(c.maxOnlinePlayers, 2) || c.maxOnlinePlayers > 1000 || !integer(c.minParticipants, 2) || c.minParticipants > c.maxOnlinePlayers
    || !integer(c.participationWindowTicks, 1) || c.participationWindowTicks > 36_000 || !Array.isArray(state.players) || state.players.length < c.minParticipants
    || state.players.length > 1000 || state.players.some(p => !p || !integer(p.accountId, 1) || !integer(p.supplies) || !integer(p.rewards))
    || new Set(state.players.map(p => p.accountId)).size !== state.players.length || typeof state.completed !== 'boolean'
    || state.closesAtTick !== null && !integer(state.closesAtTick)) return false
  const ids = new Set(state.players.map(p => p.accountId))
  for (const list of [state.contributors, state.awardedAccountIds]) if (!Array.isArray(list) || new Set(list).size !== list.length || list.some(id => !integer(id, 1) || !ids.has(id))) return false
  if (!state.awardedAccountIds.every(id => state.contributors.includes(id))) return false
  // The original domain opens at the minimum participation count and commits
  // cutoff/completion/all rewards atomically. Contradictory archives remain
  // private for review; never promote them into an unrecoverable terminal state.
  if (state.closesAtTick === null) return !state.completed && state.contributors.length < c.minParticipants && state.awardedAccountIds.length === 0
  if (state.contributors.length < c.minParticipants || state.closesAtTick < c.participationWindowTicks
    || state.tick < state.closesAtTick - c.participationWindowTicks) return false
  if (!state.completed) return state.tick < state.closesAtTick && state.awardedAccountIds.length === 0
  return state.tick >= state.closesAtTick && state.awardedAccountIds.length === state.contributors.length
    && state.players.every(player => !state.awardedAccountIds.includes(player.accountId) || player.rewards >= 1)
}
export function validateHarborBeaconEventData(type: HarborBeaconEventType, value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'harbor data required'
  const p = value as HarborBeaconEventData
  if (p.kind !== kinds[type] || p.beaconId !== 'harbor-beacon-1' || p.tileId !== 't_dock' || !integer(p.beaconTick) || !integer(p.movementStep, -1)) return 'server harbor identity/step required'
  if (p.kind === 'contributed' && (!integer(p.accountId, 1) || !integer(p.suppliesBefore, 1) || !integer(p.suppliesAfter) || p.suppliesAfter !== p.suppliesBefore - 1 || !integer(p.rewardsBefore)
    || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.clientCommandId) || !/^[a-f0-9]{64}$/.test(p.intentDigest))) return 'server contribution progress/receipt required'
  if (p.kind === 'collection-opened' && (!integer(p.closesAtTick) || p.closesAtTick <= p.beaconTick)) return 'server collection cutoff required'
  if (p.kind === 'rewarded' && (!integer(p.accountId, 1) || !integer(p.rewardsBefore) || !integer(p.rewardsAfter) || p.rewardsAfter !== p.rewardsBefore + 1)) return 'server reward increment required'
  if (p.kind === 'legacy-restored' && (!/^[a-zA-Z0-9_-]{1,100}$/.test(p.namespace) || !/^[a-f0-9]{64}$/.test(p.sourceDigest)
    || typeof p.reviewReference !== 'string' || !p.reviewReference.trim() || p.reviewReference.length > 200 || !validatePreservedHarborState(p.state) || p.state.tick !== p.beaconTick)) return 'reviewed exact legacy association required'
  return null
}
