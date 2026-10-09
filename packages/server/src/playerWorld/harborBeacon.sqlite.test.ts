import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { accountId } from '../identity/principal.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { getKnownMapEdges, getKnownMapRegions, getMapAdjacency } from '../sim/mapGraph.js'
import { PlayerWorldService } from './service.js'

const ids = [accountId(1),accountId(2)], contribute = { commandId: 'contribute', type: 'contribute', payload: {} }
function create(db: Database.Database) { const store = new SqliteEventStore(db), source = { getTick: () => 5, getRevision: () => store.readLatestFactSnapshot().lastSequence, getNpcs: () => [],
  getMap: () => ({ regions: getKnownMapRegions(), edges: getKnownMapEdges(), adjacency: getMapAdjacency() }) }
  const service = new PlayerWorldService(store,source); service.setHarborProgressPolicy(() => 'new-player'); return { store,service } }
function enterAndWalk(service: PlayerWorldService) {
  for (const id of ids) { service.execute(id, { commandId: 'enter', type: 'enter', payload: {} }); service.connect(id) }
  for (let step=0;step<30;step++) { service.advanceMovementStep(); service.executeBatch(ids.map(id => ({ accountId:id,body:{commandId:`walk${step}`,type:'move',payload:{dx:0,dz:1}} }))) }
}
describe('harbor canonical native SQLite durability', () => {
  it('batches original contribution/open receipts and300 durable collection ticks, reopens and rewards offline accounts once', async () => {
    const directory = mkdtempSync(join(tmpdir(),'greed-beacon-native-')), path = join(directory,'canonical.sqlite'); let db = new Database(path)
    try {
      const first=create(db);enterAndWalk(first.service)
      const commands=ids.map(id=>first.service.submit(id,contribute));first.service.advanceMovementStep();const acks=await Promise.all(commands)
      for(let tick=0;tick<11;tick++)first.service.advanceMovementStep()
      const expected=first.service.snapshot(ids[0]!).beacon;db.close();db=new Database(path);const reopened=create(db)
      expect(reopened.service.snapshot(ids[0]!).beacon).toEqual(expected);expect(reopened.service.getAdmittedActors()).toEqual([])
      for(let tick=11;tick<300;tick++)reopened.service.advanceMovementStep()
      expect(reopened.service.snapshot(ids[0]!).beacon.phase).toBe('completed');expect(reopened.service.snapshot(ids[1]!).harborProgress).toEqual({status:'ready',supplies:0,rewards:1})
      reopened.service.connect(ids[1]!);const retry=reopened.service.submit(ids[1]!,contribute);reopened.service.advanceMovementStep()
      expect(await retry).toEqual({...acks[1],duplicate:true})
      expect(reopened.store.readEventsByTypes(['HARBOR_BEACON_TICKED'])).toHaveLength(300);expect(reopened.store.readEventsByTypes(['PLAYER_HARBOR_CONTRIBUTED'])).toHaveLength(2)
      expect(reopened.store.readEventsByTypes(['HARBOR_BEACON_COLLECTION_OPENED'])).toHaveLength(1);expect(reopened.store.readEventsByTypes(['HARBOR_BEACON_REWARDED'])).toHaveLength(2)
    }finally{if(db.open)db.close();rmSync(directory,{recursive:true,force:true})}
  })
  it('rolls typed contribution and auxiliary open facts back atomically, then retries without a false receipt', async () => {
    const db=new Database(':memory:')
    try{
      const{store,service}=create(db);enterAndWalk(service);const append=store.appendEvents.bind(store), spy=vi.spyOn(store,'appendEvents').mockImplementation(drafts=>{append(drafts);throw new Error('synthetic after insertion')})
      const commands=ids.map(id=>service.submit(id,contribute).catch(e=>e));service.advanceMovementStep();expect((await Promise.all(commands)).every(e=>e.message==='synthetic after insertion')).toBe(true)
      expect(store.readEventsByTypes(['PLAYER_HARBOR_CONTRIBUTED','HARBOR_BEACON_COLLECTION_OPENED'])).toHaveLength(0);expect(service.snapshot(ids[0]!).harborProgress.supplies).toBe(1)
      spy.mockRestore();const retry=ids.map(id=>service.submit(id,contribute));service.advanceMovementStep();expect((await Promise.all(retry)).every(ack=>!ack.duplicate)).toBe(true)
    }finally{db.close()}
  })
})
