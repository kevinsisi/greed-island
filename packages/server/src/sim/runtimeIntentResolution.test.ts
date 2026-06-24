import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { loadCardCatalog } from '../cards/loader.js'
import { SqliteEventStore } from '../kernel/eventStore.js'
import { makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { SettingsStore } from '../http/settings.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import type { NpcProfile } from '../npcs/types.js'
import { TICKS_PER_DAY } from '../config/world.js'
import { SimulationRuntime } from './runtime.js'

type InternalRuntime = {
  runTick: () => void
  npcEngine: {
    registerDynamicNpc: (profile: NpcProfile) => void
    setIntentOverride: (
      npcId: string,
      override: {
        targetTile: string
        expiresAtTick: number
        intentType: 'survival' | 'social' | 'economic'
        urgency: number
        reason: string
      }
    ) => void
    getState: (npcId: string) => { activity?: string; agent?: { activeTask?: { kind?: string } }; intentOverride?: { targetTile: string; reason: string } | null } | undefined
  }
}

function dynamicMoverProfile(): NpcProfile {
  return {
    id: 'runtime.dynamic.child',
    name: { zh: '潮行', en: 'Tidewalker' },
    role: { zh: '年輕旅人', en: 'Young Traveler' },
    defaultLocation: 't_dock',
    routine: [
      { fromTickOfDay: 0, toTickOfDay: TICKS_PER_DAY, location: 't_central', label: 'market errand' }
    ],
    triggers: [],
    memory: { consultsEventTypes: [], decayFn: 'none', decayParam: 0 },
    personality: { factionLean: 'civilian', patience: 0.7, greed: 0.2 }
  }
}

describe('SimulationRuntime intent resolution', () => {
  it('uses dynamic NPC profile names in movement event narration', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const internal = runtime as unknown as InternalRuntime
      internal.npcEngine.registerDynamicNpc(dynamicMoverProfile())

      for (let i = 0; i < 30; i += 1) internal.runTick()

      const move = eventStore
        .readEvents()
        .find((row) => row.eventType === 'NPC_MOVE' && row.actorId === 'runtime.dynamic.child')
      const payload = move?.payload as { data?: { narration?: string; motivation?: { explanation?: string } } } | undefined
      expect(payload?.data?.narration).toContain('潮行')
      expect(payload?.data?.motivation?.explanation).toContain('潮行')
      expect(payload?.data?.narration).not.toContain('runtime.dynamic.child')
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('commits NPC_INTENT_RESOLVED as an event draft with a deterministic event id', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const npc = runtime.getNpcs()[0]!
      ;(runtime as unknown as InternalRuntime).npcEngine.setIntentOverride(npc.id, {
        targetTile: npc.location,
        expiresAtTick: 10,
        intentType: 'survival',
        urgency: 80,
        reason: 'test already at target',
      })

      ;(runtime as unknown as InternalRuntime).runTick()

      const event = eventStore.readEvents().find((row) => row.eventType === 'NPC_INTENT_RESOLVED')
      expect(event?.eventId).toMatch(/^event_/)
      expect(event?.deterministicKey).toBeTruthy()
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('applies accepted freeform agent proposals and ignores rejected ones', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const npc = runtime.getNpcs()[0]!
      const accepted = makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', npc.id, 'npc', 1, 1, {
        npcId: npc.id,
        tile: npc.location,
        proposal: {
          action: 'travel',
          target: { tileId: 't_dock', npcId: null, cardId: null },
          reason: '我想去碼頭找買卡機會',
          risk: '路上可能遇到麻煩',
          expectedOutcome: '找到下一張卡',
          utterance: '去碼頭碰碰運氣。',
        },
        resolved: {
          kind: 'travel',
          targetTile: 't_dock',
          targetNpcId: null,
          cardId: null,
          summary: 'travel: 我想去碼頭找買卡機會',
        },
        accepted: true,
        rejectionReason: null,
        decidedAtTick: 1,
        narration: 'test',
      })
      runtime.submitLivingWorldCommand(accepted)
      expect((runtime as unknown as InternalRuntime).npcEngine.getState(npc.id)?.intentOverride?.targetTile).toBe('t_dock')

      const rejected = makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', npc.id, 'npc', 2, 2, {
        npcId: npc.id,
        tile: npc.location,
        proposal: {
          action: 'become_god',
          target: { tileId: null, npcId: null, cardId: null },
          reason: '我要支配世界',
          risk: '無',
          expectedOutcome: '所有人服從',
          utterance: null,
        },
        resolved: {
          kind: 'custom_social_scene',
          targetTile: null,
          targetNpcId: null,
          cardId: null,
          summary: 'become_god: 我要支配世界',
        },
        accepted: false,
        rejectionReason: 'unsupported action: become_god',
        decidedAtTick: 2,
        narration: null,
      })
      runtime.submitLivingWorldCommand(rejected)
      expect((runtime as unknown as InternalRuntime).npcEngine.getState(npc.id)?.intentOverride?.targetTile).toBe('t_dock')
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('turns accepted build freeform proposals into build work intent', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      const npc = runtime.getNpcs()[0]!
      const accepted = makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', npc.id, 'npc', 1, 1, {
        npcId: npc.id,
        tile: npc.location,
        proposal: {
          action: 'build',
          target: { tileId: npc.location, npcId: null, cardId: null },
          reason: '我想替街區開一處新的公共建案',
          risk: '材料不一定夠',
          expectedOutcome: '讓大家有更穩的落腳處',
          utterance: '先把地基量出來。',
        },
        resolved: {
          kind: 'build',
          targetTile: npc.location,
          targetNpcId: null,
          cardId: null,
          summary: 'build: 我想替街區開一處新的公共建案',
        },
        accepted: true,
        rejectionReason: null,
        decidedAtTick: 1,
        narration: 'test',
      })
      runtime.submitLivingWorldCommand(accepted)
      expect((runtime as unknown as InternalRuntime).npcEngine.getState(npc.id)?.intentOverride?.reason).toContain('freeform-agent-build:')

      ;(runtime as unknown as InternalRuntime).runTick()

      const state = (runtime as unknown as InternalRuntime).npcEngine.getState(npc.id)
      expect(state?.activity).toBe('work')
      expect(state?.agent?.activeTask?.kind).toBe('build')
    } finally {
      runtime.stop()
      db.close()
    }
  })

  it('exposes NPC agent diagnostics in the world snapshot', () => {
    const db = new Database(':memory:')
    const eventStore = new SqliteEventStore(db)
    const runtime = new SimulationRuntime(eventStore, loadNpcProfiles(), loadCardCatalog())
    try {
      runtime.attachNpcAgent(new SettingsStore(db))

      const npcAgent = runtime.getSnapshot().facts.npcAgent as { enabled?: boolean; configured?: boolean } | null

      expect(npcAgent).toMatchObject({ enabled: false, configured: false })
    } finally {
      runtime.stop()
      db.close()
    }
  })
})
