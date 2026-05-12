import Database from 'better-sqlite3'
import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { listAllBuildings } from '../buildings/catalog.js'
import { AccountStore } from './accounts.js'
import type { AuthConfig } from './auth.js'
import { createBuildingsRouter } from './buildingsRouter.js'
import { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { loadCardCatalog } from '../cards/loader.js'
import { TICKS_PER_DAY } from '../config/world.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import type { NpcProfile } from '../npcs/types.js'
import { SALT_MARSH_BUILDING_ID } from '../sim/cityLife.js'
import { SimulationRuntime } from '../sim/runtime.js'

describe('buildings router', () => {
  it('rejects multiple active jobs across buildings and shifts', async () => {
    const db = new Database(':memory:')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const accounts = new AccountStore(db, 4)
    const jobs = new PlayerJobsStore(db)
    const account = await accounts.createAccount('worker@example.test', 'hunter123')
      const runtime = {
        getCurrentTick: () => 100,
        getBuildingsOnTile: () => [],
        getAllBuildings: () => listAllBuildings().map((def) => ({ def, occupants: [] })),
        getInProgressConstructionProjects: () => [],
        getAreaState: () => null,
        getAmbientNarrator: () => null,
      } as unknown as SimulationRuntime
    const app = express()
    app.use(express.json())
    app.use(createBuildingsRouter({ runtime, jobs, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const token = jwt.sign(
        { sub: account.id, email: account.email, role: account.role },
        authConfig.jwtSecret
      )
      const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
      const first = await fetch(`http://127.0.0.1:${address.port}/buildings/b_desert_workshop/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ shift: 'morning' }),
      })
      const second = await fetch(`http://127.0.0.1:${address.port}/buildings/b_dimai_archive/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ shift: 'afternoon' }),
      })
      const payload = (await second.json()) as { error: string }

      expect(first.status).toBe(200)
      expect(second.status).toBe(409)
      expect(payload.error).toBe('ALREADY_HIRED')
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns NPC-initiated in-progress construction sites for a tile', async () => {
    const db = new Database(':memory:')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const jobs = new PlayerJobsStore(db)
    const runtime = {
      getCurrentTick: () => 100,
      getBuildingsOnTile: () => [],
      getAllBuildings: () => [],
      getInProgressConstructionProjects: (tileId?: string) => tileId === 't_central' ? [{
        projectId: 'project.civ-evo.test',
        kind: 'settlement',
        targetTileId: 't_central',
        buildingId: 'b_civ_evo_t_central',
        progress: 3,
        targetProgress: 24,
        startedAtTick: 90,
        completedAtTick: null,
        initiatedByNpcId: 'central.builder',
        builderNpcIds: ['central.builder']
      }] : [],
      getAreaState: () => null,
      getAmbientNarrator: () => null,
    } as unknown as SimulationRuntime
    const app = express()
    app.use(express.json())
    app.use(createBuildingsRouter({ runtime, jobs, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/buildings?tileId=t_central`)
      const payload = (await response.json()) as {
        buildings: Array<{ def: { id: string; type: string; enterable: boolean } }>
        inProgress: Array<{ projectId: string; initiatedByNpcId: string }>
      }

      expect(response.status).toBe(200)
      expect(payload.inProgress).toEqual([
        expect.objectContaining({ projectId: 'project.civ-evo.test', initiatedByNpcId: 'central.builder' })
      ])
      expect(payload.buildings).toEqual([
        expect.objectContaining({ def: expect.objectContaining({ id: 'b_civ_evo_t_central', type: 'construction', enterable: true }) })
      ])
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns completed NPC-initiated construction projects as permanent buildings', async () => {
    const db = new Database(':memory:')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const jobs = new PlayerJobsStore(db)
    const runtime = {
      getCurrentTick: () => 120,
      getBuildingsOnTile: () => [{
        def: {
          id: 'b_civ_evo_t_central.abcdef12',
          tileId: 't_central',
          nameZh: '自主設施',
          nameEn: 'Autonomous Facility',
          descriptionZh: '由 central.builder 發起的 NPC 自主建案，已於 tick 110 完工。',
          type: 'landmark',
          placement: { col: 4, row: 4, glyph: '🏠', size: 24 },
          interior: { cols: 9, rows: 7, props: [] },
          ownerNpcId: 'central.builder',
          hiring: [{ shift: 'morning', capacity: 1, wage: 12, taskZh: '整理自主設施' }],
          enterable: true,
          restorative: false
        },
        occupants: []
      }],
      getAllBuildings: () => [],
      getInProgressConstructionProjects: () => [],
      getAreaState: () => null,
      getAmbientNarrator: () => null,
    } as unknown as SimulationRuntime
    const app = express()
    app.use(express.json())
    app.use(createBuildingsRouter({ runtime, jobs, authConfig }))
    const server = await listen(app)

    try {
      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/buildings?tileId=t_central`)
      const payload = (await response.json()) as {
        buildings: Array<{ def: { id: string; type: string; enterable: boolean; ownerNpcId: string | null } }>
        inProgress: unknown[]
      }

      expect(response.status).toBe(200)
      expect(payload.inProgress).toEqual([])
      expect(payload.buildings).toEqual([
        expect.objectContaining({
          def: expect.objectContaining({
            id: 'b_civ_evo_t_central.abcdef12',
            type: 'landmark',
            enterable: true,
            ownerNpcId: 'central.builder'
          })
        })
      ])
    } finally {
      await close(server)
      db.close()
    }
  })

  it('returns constructed expansion buildings by id before they have occupants', async () => {
    const db = new Database(':memory:')
    const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
    const jobs = new PlayerJobsStore(db)
    const runtime = new SimulationRuntime(
      new SqliteEventStore(db),
      [profile('npc.a'), profile('npc.b'), profile('npc.c'), profile('npc.d')],
      loadCardCatalog()
    )
    const app = express()
    app.use(express.json())
    app.use(createBuildingsRouter({ runtime, jobs, authConfig }))
    const server = await listen(app)

    try {
      for (let i = 0; i < 120; i += 1) {
        ;(runtime as unknown as { runTick: () => void }).runTick()
      }

      const address = server.address() as AddressInfo
      const response = await fetch(`http://127.0.0.1:${address.port}/buildings/${SALT_MARSH_BUILDING_ID}`)
      const payload = (await response.json()) as { building?: { def: { id: string }; occupants: unknown[] } }

      expect(response.status).toBe(200)
      expect(payload.building?.def.id).toBe(SALT_MARSH_BUILDING_ID)
      expect(payload.building?.occupants).toEqual([])
    } finally {
      await close(server)
      runtime.stop()
      db.close()
    }
  })
})

function profile(id: string): NpcProfile {
  return {
    id,
    name: { zh: id === 'npc.a' ? '阿潮' : '小沼', en: id === 'npc.a' ? 'A-Chao' : 'Xiao-Zhao' },
    role: { zh: '街區居民', en: 'Resident' },
    defaultLocation: 't_central',
    routine: [
      { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'work shift' }
    ],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'civilian', archetype: 'resident' }
  }
}

function listen(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server))
  })
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
}
