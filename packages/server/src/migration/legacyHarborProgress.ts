import type Database from 'better-sqlite3'
import { accountId } from '../identity/principal.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { hashCanonicalJson, toCanonicalJson } from '../kernel/canonicalJson.js'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { PlayerWorldProjection } from '../projections/playerWorld.js'
import { canStand, getRegionGeometry } from '../playerWorld/geometry.js'
import { reviewedHarborRestorationCommand, HarborBeaconProjection } from '../playerWorld/harborBeacon.js'
import { HARBOR_BEACON_EVENT_TYPES, validatePreservedHarborState, type PreservedHarborState } from '../playerWorld/harborBeaconData.js'
import { PLAYER_WORLD_POSITION_EVENT_TYPES, PLAYER_WORLD_RULESET } from '../playerWorld/types.js'
import { applyLegacyWorldStage } from './legacyWorldImport.js'
import type { LegacyWorldSource } from './legacyWorldSource.js'
import type { LegacyWorldStagePlan } from './legacyWorldPlan.js'

/** Stage-only exact semantic promotion. Existing owner/account status and activation gate remain unchanged. */
export function stageReviewedLegacyHarborProgress(input: { db: Database.Database; source: LegacyWorldSource; plan: LegacyWorldStagePlan;
  purpose: 'synthetic-reviewed-harbor-association'; reviewReference: string; recordedAt: number; failBeforeCommit?: () => void }) {
  if (input.purpose !== 'synthetic-reviewed-harbor-association' || !input.reviewReference.trim() || input.reviewReference.length > 200) throw new Error('HARBOR_ASSOCIATION_REVIEW_REQUIRED')
  const { db, source, plan } = input
  if (!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='legacy_import_stage'").get()
    || !db.prepare('SELECT namespace FROM legacy_import_stage WHERE namespace=? AND source_digest=?').get(source.manifest.namespace, source.manifest.sourceDigest)) throw new Error('HARBOR_PRIVATE_STAGE_REQUIRED')
  return db.transaction(() => {
    // Verifies immutable archive hashes, ID provenance and username aliases; never repairs a drifted association.
    const verified = applyLegacyWorldStage({ db, source, plan, purpose: 'synthetic-private-stage', recordedAt: input.recordedAt })
    if (!verified.duplicate) throw new Error('HARBOR_PRIVATE_STAGE_REQUIRED')
    const store = new SqliteEventStore(db), engine = new LivingWorldRuleEngine(), positions = new PlayerWorldProjection()
    positions.rebuildFromEvents(store.readLatestEventsPerActor(PLAYER_WORLD_POSITION_EVENT_TYPES))
    const recorded = db.prepare('SELECT identities_json FROM legacy_import_private_sources WHERE namespace=?').get(source.manifest.namespace) as { identities_json: string }
    const associations = JSON.parse(recorded.identities_json) as LegacyWorldStagePlan['identities']
    const mapping = new Map(associations.map(identity => [identity.legacyId, accountId(identity.accountId)]))
    if (plan.identities.length !== associations.length || plan.identities.some(identity => identity.namespace !== source.manifest.namespace || mapping.get(identity.legacyId) !== identity.accountId)) throw new Error('HARBOR_MAPPING_CHANGED')
    const mapped = (id: string) => { const result = mapping.get(id); if (!result) throw new Error('UNMAPPED_HARBOR_ACTOR_REVIEW_REQUIRED'); return result }
    const state: PreservedHarborState = { tick: source.roomState.tick, config: { ...source.roomState.config },
      players: source.roomState.players.map(player => ({ accountId: mapped(player.id), supplies: player.supplies, rewards: player.rewards })),
      contributors: source.roomState.contributors.map(mapped), completed: source.roomState.completed, closesAtTick: source.roomState.closesAtTick,
      awardedAccountIds: source.roomState.awardedPlayerIds.map(mapped) }
    if (!validatePreservedHarborState(state)) throw new Error('LEGACY_HARBOR_PROGRESS_REVIEW_REQUIRED')
    const tick = store.readLatestFactSnapshot().latestTick, restoration = reviewedHarborRestorationCommand({ namespace: source.manifest.namespace,
      sourceDigest: source.manifest.sourceDigest, reviewReference: input.reviewReference, state, worldTick: tick, submittedAt: input.recordedAt })
    const existing = store.readEventsByTypes(HARBOR_BEACON_EVENT_TYPES)
    if (existing.length) {
      const first = existing.find(event => event.eventType === 'HARBOR_BEACON_LEGACY_PROGRESS_RESTORED')
      const data = (first?.payload as { data?: { namespace: string; sourceDigest: string; state: unknown } } | undefined)?.data
      if (!data || data.namespace !== source.manifest.namespace || data.sourceDigest !== source.manifest.sourceDigest || toCanonicalJson(data.state) !== toCanonicalJson(state)) throw new Error('CANONICAL_HARBOR_PROGRESS_CONFLICT')
      return { duplicate: true, activatedAccounts: false as const, restoredPlayers: state.players.length, activationReady: false as const }
    }
    const commands = []
    for (const player of source.roomState.players) {
      const id = mapped(player.id), current = positions.get(id), geometry = getRegionGeometry('t_dock')!
      if (!canStand(player, geometry)) throw new Error('LEGACY_HARBOR_POSITION_REVIEW_REQUIRED')
      if (current) {
        if (current.tileId !== 't_dock' || current.x !== player.x || current.z !== player.z) throw new Error('CANONICAL_POSITION_CONFLICT')
        continue
      }
      const clientCommandId = `legacy-preserved-${source.manifest.sourceDigest.slice(0,16)}`
      commands.push(makeLivingWorldCommand('PLAYER_WORLD_ENTERED', String(id), 'player', tick, input.recordedAt,
        { accountId: id, tileId: 't_dock', x: player.x, z: player.z, movementStep: -1, clientCommandId,
          intentDigest: hashCanonicalJson({ type: 'reviewed-legacy-position', namespace: source.manifest.namespace, sourceDigest: source.manifest.sourceDigest, legacyId: player.id, accountId: id }) },
        `player-world:${id}:${clientCommandId}`))
    }
    commands.push(restoration)
    const drafts = commands.map(command => { const result = engine.evaluate(command, { rulesetVersion: PLAYER_WORLD_RULESET }); if (!result.accepted) throw new Error(result.rejection.code); return result.events[0]! })
    const committed = store.appendEvents(drafts), projected = new HarborBeaconProjection(); projected.rebuildFromEvents(committed)
    input.failBeforeCommit?.()
    return { duplicate: false, activatedAccounts: false as const, restoredPlayers: state.players.length, activationReady: false as const }
  })()
}
