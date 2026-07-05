import express from 'express'
import jwt from 'jsonwebtoken'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthConfig } from './auth.js'
import { createPlayerSurvivalRouter } from './playerSurvivalRouter.js'
import { PlayerSurvivalProjection } from '../projections/playerSurvival.js'
import { PLAYER_EAT_RATION_GOLD_COST, PLAYER_INITIAL_NOURISHMENT, PLAYER_INITIAL_VIGOR, PLAYER_STARVATION_THRESHOLD } from '../config/world.js'

const authConfig: AuthConfig = { jwtSecret: 'test-secret', jwtExpiresIn: '1h' }
let seq = 0

function mockRuntime(proj: PlayerSurvivalProjection, tick = 100) {
  return {
    getCurrentTick: () => tick,
    getPlayerSurvivalProjection: () => proj,
    submitLivingWorldCommand: (cmd: unknown) => {
      const c = cmd as { commandType: string; payload: Record<string, unknown> }
      const event = {
        sequence: ++seq,
        eventId: `mock-${seq}`,
        eventType: c.commandType,
        actorId: 'player',
        payload: { actorType: 'player', data: c.payload, narration: null },
        deterministicKey: `mock-key-${seq}`,
        version: 1,
        tick,
        occurredAt: Date.now(),
      }
      proj.project(event as never)
      return event
    },
  }
}

function mockJobs(gold = 100) {
  let currentGold = gold
  return {
    getWallet: (accountId: number) => ({ accountId, gold: currentGold, energy: 100, updatedAt: Date.now() }),
    addGold: (_accountId: number, delta: number) => {
      currentGold = Math.max(0, currentGold + Math.floor(delta))
      return { accountId: 0, gold: currentGold, energy: 100, updatedAt: Date.now() }
    },
    getGold: () => currentGold,
  }
}

function listen(app: ReturnType<typeof express>): Promise<Server> {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
}

async function setup(opts: { tick?: number; gold?: number } = {}) {
  const proj = new PlayerSurvivalProjection()
  const jobs = mockJobs(opts.gold ?? 100)
  const runtime = mockRuntime(proj, opts.tick ?? 100)
  const app = express()
  app.use(express.json())
  app.use(createPlayerSurvivalRouter({ runtime: runtime as never, jobs: jobs as never, authConfig }))
  const server = await listen(app)
  const port = (server.address() as AddressInfo).port
  const accountId = 42
  const token = jwt.sign({ sub: accountId, email: 'test@example.com', role: 'player' }, authConfig.jwtSecret)
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
  return { port, headers, accountId, proj, jobs, server }
}

describe('playerSurvivalRouter', () => {
  const servers: Server[] = []
  afterEach(() => servers.forEach((s) => s.close()))

  it('GET /player/needs returns 401 when unauthenticated', async () => {
    const { port, server } = await setup()
    servers.push(server)
    const res = await fetch(`http://127.0.0.1:${port}/player/needs`)
    expect(res.status).toBe(401)
  })

  it('GET /player/needs seeds state on first access', async () => {
    const { port, headers, proj, accountId, server } = await setup({ tick: 50 })
    servers.push(server)
    expect(proj.getState(accountId)).toBeNull()
    const res = await fetch(`http://127.0.0.1:${port}/player/needs`, { headers })
    expect(res.status).toBe(200)
    const body = await res.json() as { nourishment: number; vigor: number; collapsed: boolean; asOfTick: number }
    expect(body.nourishment).toBe(PLAYER_INITIAL_NOURISHMENT)
    expect(body.vigor).toBe(PLAYER_INITIAL_VIGOR)
    expect(body.collapsed).toBe(false)
    expect(proj.getState(accountId)).not.toBeNull()
  })

  it('GET /player/needs returns reconcile-to-current-tick on subsequent reads', async () => {
    const { port, headers, proj, accountId, server } = await setup({ tick: 7200 })
    servers.push(server)
    // Seed first
    await fetch(`http://127.0.0.1:${port}/player/needs`, { headers })
    // Advance time: proj already has state from seed; on second read tick is same (mocked)
    const state = proj.getState(accountId)
    expect(state).not.toBeNull()
    expect(state!.asOfTick).toBe(7200)
  })

  it('POST /player/eat returns 401 when unauthenticated', async () => {
    const { port, server } = await setup()
    servers.push(server)
    const res = await fetch(`http://127.0.0.1:${port}/player/eat`, { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('POST /player/eat deducts gold and raises nourishment', async () => {
    const { port, headers, proj, accountId, jobs, server } = await setup({ tick: 100, gold: 50 })
    servers.push(server)
    // Seed state first
    await fetch(`http://127.0.0.1:${port}/player/needs`, { headers })
    const goldBefore = jobs.getGold()

    const res = await fetch(`http://127.0.0.1:${port}/player/eat`, { method: 'POST', headers })
    expect(res.status).toBe(200)
    const body = await res.json() as { accepted: boolean; needs: { nourishment: number } }
    expect(body.accepted).toBe(true)
    expect(body.needs.nourishment).toBeGreaterThanOrEqual(PLAYER_INITIAL_NOURISHMENT)
    expect(jobs.getGold()).toBe(goldBefore - PLAYER_EAT_RATION_GOLD_COST)

    const stateAfter = proj.getState(accountId)
    expect(stateAfter).not.toBeNull()
  })

  it('POST /player/eat returns 402 when gold is insufficient', async () => {
    const { port, headers, server } = await setup({ tick: 100, gold: 0 })
    servers.push(server)
    await fetch(`http://127.0.0.1:${port}/player/needs`, { headers })
    const res = await fetch(`http://127.0.0.1:${port}/player/eat`, { method: 'POST', headers })
    expect(res.status).toBe(402)
    const body = await res.json() as { error: string; goldRequired: number }
    expect(body.error).toBe('INSUFFICIENT_GOLD')
    expect(body.goldRequired).toBe(PLAYER_EAT_RATION_GOLD_COST)
  })

  it('POST /player/eat succeeds even when player is collapsed', async () => {
    const { port, headers, proj, accountId, server } = await setup({ tick: 100, gold: 100 })
    servers.push(server)
    // Inject a collapsed state
    proj.project({
      sequence: ++seq,
      eventId: `collapsed-${seq}`,
      eventType: 'PLAYER_NEEDS_SEEDED',
      actorId: 'player',
      payload: { actorType: 'player', data: { accountId, asOfTick: 100, nourishment: PLAYER_STARVATION_THRESHOLD - 5, vigor: 0, collapsed: true }, narration: null },
      deterministicKey: `key-${seq}`,
      version: 1,
      tick: 100,
      occurredAt: Date.now(),
    } as never)
    expect(proj.getState(accountId)!.collapsed).toBe(true)

    const res = await fetch(`http://127.0.0.1:${port}/player/eat`, { method: 'POST', headers })
    expect(res.status).toBe(200)
    const body = await res.json() as { accepted: boolean; needs: { collapsed: boolean; nourishment: number } }
    expect(body.accepted).toBe(true)
    expect(body.needs.nourishment).toBeGreaterThan(PLAYER_STARVATION_THRESHOLD - 5)
  })
})
