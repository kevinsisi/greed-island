import express from 'express'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { describe, expect, it } from 'vitest'
import { createAreaEcologyRouter } from './areaEcologyRouter.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { AreaEcologyView } from '../sim/areaEcology.js'

function makeApp(getAreaEcology: (tileId: string) => AreaEcologyView | null) {
  const runtime = { getAreaEcology } as unknown as SimulationRuntime
  const app = express()
  app.use('/api', createAreaEcologyRouter({ runtime }))
  return app
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

describe('areaEcology router', () => {
  it('returns 200 with the rollup for a known tile', async () => {
    const view: AreaEcologyView = {
      tileId: 't_forest',
      animals: [
        {
          speciesId: 'forest_deer',
          tileId: 't_forest',
          biomeRegion: 'forest',
          count: 3,
          animalIds: ['a1', 'a2', 'a3'],
          intent: 'foraging',
          thoughtZh: 'forest_deer沿著氣味與地形覓食。',
        },
      ],
      fishery: null,
      migrationsArriving: [],
      migrationsDeparting: [],
      predatorWarnings: [], plants: [],
    }
    const app = makeApp(() => view)
    const server = await listen(app)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/area/t_forest/ecology`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as AreaEcologyView
      expect(body.tileId).toBe('t_forest')
      expect(body.animals).toHaveLength(1)
      expect(body.animals[0]!.count).toBe(3)
      expect(body.animals[0]!.animalIds).toEqual(['a1', 'a2', 'a3'])
    } finally {
      await close(server)
    }
  })

  it('returns 404 with the documented body for an unknown tile', async () => {
    const app = makeApp(() => null)
    const server = await listen(app)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/area/t_does_not_exist/ecology`)
      expect(res.status).toBe(404)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('unknown tile')
    } finally {
      await close(server)
    }
  })

  it('returns 200 with an empty rollup for a known tile with no ecology', async () => {
    const empty: AreaEcologyView = {
      tileId: 't_central',
      animals: [],
      fishery: null,
      migrationsArriving: [],
      migrationsDeparting: [],
      predatorWarnings: [], plants: [],
    }
    const app = makeApp(() => empty)
    const server = await listen(app)
    try {
      const { port } = server.address() as AddressInfo
      const res = await fetch(`http://127.0.0.1:${port}/api/area/t_central/ecology`)
      expect(res.status).toBe(200)
      const body = (await res.json()) as AreaEcologyView
      expect(body.animals).toEqual([])
      expect(body.fishery).toBeNull()
      expect(body.migrationsArriving).toEqual([])
      expect(body.migrationsDeparting).toEqual([])
      expect(body.predatorWarnings).toEqual([])
    } finally {
      await close(server)
    }
  })
})
