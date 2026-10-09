import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { migrateIdentitySchema } from '../identity/schema.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from '../playerWorld/service.js'
import { createHarborProgressPolicy } from '../playerWorld/harborPolicy.js'
import { accountId } from '../identity/principal.js'
import { toCanonicalJson } from '../kernel/canonicalJson.js'
import { applyLegacyWorldStage,readCanonicalStageState } from './legacyWorldImport.js'
import { inspectLegacyWorldSource, type LegacyEventRow } from './legacyWorldSource.js'
import { planLegacyWorldStage } from './legacyWorldPlan.js'
import { syntheticLegacySourceFixture } from './legacyWorld.testSupport.js'
import { stageReviewedLegacyHarborProgress } from './legacyHarborProgress.js'
import { assertLegacyWorldStageActivationReady } from './legacyWorldStageGate.js'
function fixture(completed=true, transformRows?: (rows: LegacyEventRow[]) => LegacyEventRow[]){
  const db=new Database(':memory:');db.pragma('foreign_keys=ON');const store=new SqliteEventStore(db);migrateIdentitySchema(db)
  const value=syntheticLegacySourceFixture(completed),rows=transformRows?.(value.rows)??value.rows,source=inspectLegacyWorldSource(value.rawAccountsJson,'synthetic-harbor',()=>rows),plan=planLegacyWorldStage({source,target:readCanonicalStageState(db)})
  applyLegacyWorldStage({db,source,plan,purpose:'synthetic-private-stage',recordedAt:1})
  const restore=(override: Partial<Parameters<typeof stageReviewedLegacyHarborProgress>[0]>={})=>stageReviewedLegacyHarborProgress({db,source,plan,purpose:'synthetic-reviewed-harbor-association',reviewReference:'synthetic-verified-alias-association',recordedAt:2,...override})
  const policy=createHarborProgressPolicy(db), runtimeSource={getTick:()=>store.readLatestFactSnapshot().latestTick,getRevision:()=>store.readLatestFactSnapshot().lastSequence,getNpcs:()=>[],getMap:()=>({regions:getKnownMapRegions(),edges:getKnownMapEdges(),adjacency:getMapAdjacency()})}
  const create=()=>{const service=new PlayerWorldService(store,runtimeSource);service.setHarborProgressPolicy(policy);return service}
  return{db,store,source,plan,restore,policy,create}
}
describe('reviewed staged exact harbor association native SQLite',()=>{
  it('promotes exact source positions/supplies/rewards/beacon state by verified aliases while all imported accounts remain disabled/player and boot blocked',()=>{
    const{db,source,plan,restore,create,policy,store}=fixture()
    try{
      const ids=plan.identities.map(identity=>accountId(identity.accountId));expect(ids.map(policy)).toEqual(['legacy-review-required','legacy-review-required'])
      expect(restore()).toMatchObject({duplicate:false,restoredPlayers:2,activatedAccounts:false,activationReady:false})
      const service=create();for(const id of ids){expect(service.getPosition(id)).toMatchObject({tileId:'t_dock',x:0,z:6});expect(service.snapshot(id).harborProgress).toEqual({status:'ready',supplies:0,rewards:1})}
      expect(service.snapshot(ids[0]!).beacon).toMatchObject({tick:source.roomState.tick,completed:true,contributors:ids,awardedAccountIds:ids})
      expect(db.prepare('SELECT role,status FROM accounts ORDER BY id').all()).toEqual([{role:'player',status:'disabled'},{role:'player',status:'disabled'}])
      expect(()=>assertLegacyWorldStageActivationReady(db)).toThrow('REVIEW_REQUIRED')
      const count=store.readLatestFactSnapshot().eventCount;expect(restore()).toMatchObject({duplicate:true});expect(store.readLatestFactSnapshot().eventCount).toBe(count)
    }finally{db.close()}
  })
  it('rolls all canonical position/progress restoration facts back and refuses alias/mapping drift instead of selecting by display names',()=>{
    const{db,plan,restore,store}=fixture()
    try{
      const before=store.readLatestFactSnapshot().eventCount;expect(()=>restore({failBeforeCommit:()=>{throw new Error('synthetic rollback')}})).toThrow('synthetic rollback')
      expect(store.readLatestFactSnapshot().eventCount).toBe(before);expect(store.readEventsByTypes(['PLAYER_WORLD_ENTERED'])).toHaveLength(0)
      const changed={...plan,identities:plan.identities.map(identity=>({...identity,accountId:accountId(identity.accountId+10)}))}
      expect(()=>restore({plan:changed})).toThrow('HARBOR_MAPPING_CHANGED')
      db.prepare("DELETE FROM account_login_aliases WHERE kind='username' AND normalized='kevin950805'").run()
      expect(()=>restore()).toThrow('STAGED_ALIAS_CHANGED');expect(store.readLatestFactSnapshot().eventCount).toBe(before)
    }finally{db.close()}
  })
  it('does not turn unresolved legacy provenance into a new-player default and preserves an existing conflicting canonical position',()=>{
    const{db,plan,restore,create,store}=fixture(false)
    try{
      const id=accountId(plan.identities[0]!.accountId),service=create();service.execute(id,{commandId:'enter',type:'enter',payload:{}})
      expect(service.snapshot(id).harborProgress).toEqual({status:'legacy-review-required',supplies:null,rewards:null})
      const before=toCanonicalJson(store.readEventsByTypes(['PLAYER_WORLD_ENTERED']))
      expect(()=>restore()).toThrow('CANONICAL_POSITION_CONFLICT');expect(toCanonicalJson(store.readEventsByTypes(['PLAYER_WORLD_ENTERED']))).toBe(before)
      expect(store.readEventsByTypes(['HARBOR_BEACON_LEGACY_PROGRESS_RESTORED'])).toHaveLength(0)
    }finally{db.close()}
  })
  it.each([
    ['premature-completion', (rows: LegacyEventRow[]) => rows.filter(row => (row.tick ?? 0) <= 10 || row.event_type === 'MP_BEACON_COMPLETED')
      .map(row => row.event_type === 'MP_BEACON_COMPLETED' ? { ...row, tick: 10 } : row)],
    ['missing-terminal-rewards', (rows: LegacyEventRow[]) => rows.filter(row => row.event_type !== 'MP_REWARDED')],
  ] as const)('preserves the exact private %s archive but refuses canonical promotion until manual review',(_name,transformRows)=>{
    const{db,source,restore,store}=fixture(true,transformRows)
    try{
      const before=store.readLatestFactSnapshot().eventCount
      const archive=db.prepare('SELECT accounts_json,manifest_json,identities_json,archive_event_ids_json FROM legacy_import_private_sources').all()
      expect(source.roomState.completed).toBe(true)
      expect(()=>restore()).toThrow('LEGACY_HARBOR_PROGRESS_REVIEW_REQUIRED')
      expect(store.readLatestFactSnapshot().eventCount).toBe(before)
      expect(store.readEventsByTypes(['PLAYER_WORLD_ENTERED','HARBOR_BEACON_LEGACY_PROGRESS_RESTORED'])).toHaveLength(0)
      expect(db.prepare('SELECT accounts_json,manifest_json,identities_json,archive_event_ids_json FROM legacy_import_private_sources').all()).toEqual(archive)
      expect(db.prepare('SELECT role,status FROM accounts ORDER BY id').all()).toEqual([{role:'player',status:'disabled'},{role:'player',status:'disabled'}])
      expect(()=>assertLegacyWorldStageActivationReady(db)).toThrow('REVIEW_REQUIRED')
    }finally{db.close()}
  })
})
