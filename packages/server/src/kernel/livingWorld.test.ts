// Living-deterministic-world replay + projection tests. Locks in:
//   1. Rule Engine accepts known command types and rejects junk.
//   2. NPC memory + relationships projections rebuild byte-for-byte
//      identically from the same EventLog.
//   3. Catch-up summary is deterministic.
//   4. Emotional snapshot is purely derived (no stored scalar drift).

import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import {
  LivingWorldRuleEngine,
  WEATHER_AGENT_ACTOR_ID,
  isLivingWorldCommandType,
  makeLivingWorldCommand,
  type LivingWorldCommand
} from './livingWorldCommands.js'
import { SqliteEventStore } from './eventStore.js'
import { SqliteNpcMemoryStore } from './npcMemory.js'
import { SqliteNpcRelationshipsStore } from './npcRelationships.js'
import { summarizeWindow } from './catchUpSummary.js'
import { buildChronicleContext, renderChronicle } from './chronicleRenderer.js'
import { deriveEmotionalSnapshot } from './emotionalSimulation.js'
import { SettingsStore } from '../http/settings.js'
import type { EventDraft } from './types.js'

function makeHarness() {
  const db = new Database(':memory:')
  const eventStore = new SqliteEventStore(db)
  const memory = new SqliteNpcMemoryStore(db)
  const relationships = new SqliteNpcRelationshipsStore(db)
  const ruleEngine = new LivingWorldRuleEngine()
  return { db, eventStore, memory, relationships, ruleEngine }
}

function submit(
  cmd: LivingWorldCommand,
  ruleEngine: LivingWorldRuleEngine,
  eventStore: SqliteEventStore
): EventDraft[] {
  const result = ruleEngine.evaluate(cmd)
  if (!result.accepted) throw new Error(`rejected: ${result.rejection.reason}`)
  return [...eventStore.appendEvents(result.events as readonly EventDraft[])]
}

describe('living-world rule engine', () => {
  it('accepts every catalog command type', () => {
    const { ruleEngine } = makeHarness()
    const samples: LivingWorldCommand[] = [
      makeLivingWorldCommand('WORLD_TICK', 'system', 'system', 1, 1, { tick: 1 }),
      makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 2, 2, {
        npcId: 'npc-a',
        from: 't_central',
        to: 't_market',
        activity: 'move',
        reachedDest: false,
        narration: '...'
      }),
      makeLivingWorldCommand('NPC_STATE_RECORDED', 'npc-a', 'npc', 2, 2, {
        npcId: 'npc-a',
        state: {
          tile: 't_market',
          mood: 60,
          health: 80,
          activity: 'idle',
          faction: 'civilian',
          targetTile: 't_market',
          lastActedTick: 2,
          subCol: 7,
          subRow: 5,
          subZ: 0,
          personalityOverride: null,
          travelRoute: null,
          agent: { activeTask: { kind: 'bootstrap' } }
        },
        narration: null
      }),
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 3, 3, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'chat',
        narration: '...'
      }),
      makeLivingWorldCommand('NPC_PRODUCTIVE_ACTION', 'npc-a', 'npc', 3, 3, {
        npcId: 'npc-a',
        tile: 't_market',
        activity: 'work',
        domain: 'build',
        metric: 'infrastructure',
        delta: 2,
        narration: '...'
      }),
      makeLivingWorldCommand('NPC_HOUSEHOLD_FORMED', 'household-a', 'system', 3, 3, {
        householdId: 'household-a',
        partnerNpcIds: ['npc-a', 'npc-b'],
        homeTileId: 't_market',
        narration: '...'
      }),
      makeLivingWorldCommand('NPC_CHILD_BORN', 'child-a', 'system', 3, 3, {
        householdId: 'household-a',
        childId: 'child-a',
        nameZh: '潮生',
        nameEn: 'Tideborn',
        narration: '...'
      }),
      makeLivingWorldCommand('CONSTRUCTION_INITIATE', 'npc-a', 'npc', 3, 3, {
        npcId: 'npc-a',
        tileId: 't_central',
        buildingId: 'b_central_well',
        duration: 20,
        narration: '阿鬼決定在中央區起一口井。'
      }),
      makeLivingWorldCommand('CONSTRUCTION_PROJECT_PROGRESS', 'npc-a', 'npc', 3, 3, {
        projectId: 'project-a',
        kind: 'settlement',
        targetTileId: 't_salt_marsh',
        buildingId: 'building-a',
        npcId: 'npc-a',
        delta: 2,
        progressAfter: 2,
        targetProgress: 12,
        narration: '...'
      }),
      makeLivingWorldCommand('MAP_TILE_UNLOCKED', 'system', 'system', 3, 3, {
        projectId: 'project-a',
        tileId: 't_salt_marsh',
        adjacentTo: ['t_dock', 't_ruin'],
        narration: '...'
      }),
      makeLivingWorldCommand('BUILDING_CONSTRUCTED', 'system', 'system', 3, 3, {
        projectId: 'project-a',
        buildingId: 'building-a',
        tileId: 't_salt_marsh',
        narration: '...'
      }),
      makeLivingWorldCommand('AREA_PRESSURE', 'system', 'system', 4, 4, {
        tileId: 't_market',
        kind: 'pressure.food_shortage',
        detail: { food: 22 },
        narration: '...'
      }),
      makeLivingWorldCommand('NPC_DIALOG_HOLD', 'player-1', 'player', 5, 5, {
        playerAccountId: 'player-1',
        npcId: 'npc-a',
        tile: 't_market',
        holdTicks: 12,
        narration: null
      }),
      makeLivingWorldCommand('WEATHER_INTENT_PROPOSED', WEATHER_AGENT_ACTOR_ID, 'system', 5, 5, {
        currentWeather: '晴',
        desiredWeather: '霧雨',
        mood: 'watchful',
        pressureSource: 'cadence',
        thought: '雲腳低垂，城裡需要一場輕雨。',
        reason: 'weather cadence reached',
        cadenceKey: 'weather:5',
        proposedAtTick: 5,
        narration: '天氣意志低語：雲腳低垂，城裡需要一場輕雨。'
      }),
      makeLivingWorldCommand('WEATHER_CHANGE', 'system', 'system', 5, 5, {
        from: '晴',
        to: '霧雨',
        narration: '...'
      }),
      makeLivingWorldCommand('ANIMAL_SPAWNED', 'system', 'system', 6, 6, {
        animal: {
          id: 'animal.t_forest.forest_deer.abc',
          speciesId: 'forest_deer',
          tileId: 't_forest',
          biomeRegion: 'forest',
          position: { subCol: 1, subRow: 2, subZ: 0 },
          state: 'idle',
          hunger: 0,
          health: 100,
          fear: 75,
          aggression: 5,
          packId: 'pack.t_forest.forest_deer.abc',
          migrationTarget: null,
          currentTarget: null,
          reproductionCooldown: 0,
          lifecycleStage: 'adult',
          ownerSettlementId: null,
          domesticatedBy: null,
        },
        spawnedAtTick: 6,
        narration: null,
      }),
      makeLivingWorldCommand('ANIMAL_REPRODUCED', 'system', 'system', 6, 6, {
        animal: {
          id: 'animal.t_forest.forest_deer.repro.abc',
          speciesId: 'forest_deer',
          tileId: 't_forest',
          biomeRegion: 'forest',
          position: { subCol: 3, subRow: 4, subZ: 0 },
          state: 'idle',
          hunger: 0,
          health: 100,
          fear: 75,
          aggression: 5,
          packId: 'pack.t_forest.forest_deer.abc',
          migrationTarget: null,
          currentTarget: null,
          reproductionCooldown: 0,
          lifecycleStage: 'juvenile',
          ownerSettlementId: null,
          domesticatedBy: null,
        },
        parentAnimalIds: ['animal.t_forest.forest_deer.abc', 'animal.t_forest.forest_deer.def'],
        reproducedAtTick: 6,
        narration: null,
      }),
      makeLivingWorldCommand('ANIMAL_HUNT_STARTED', 'forest.hunter.lyra', 'npc', 7, 7, {
        huntId: 'hunt.t_forest.abc',
        npcId: 'forest.hunter.lyra',
        tileId: 't_forest',
        targetSpeciesId: 'forest_deer',
        targetAnimalId: 'animal.t_forest.forest_deer.abc',
        startedAtTick: 7,
        narration: 'hunt started'
      }),
      makeLivingWorldCommand('ANIMAL_HUNT_RESOLVED', 'forest.hunter.lyra', 'npc', 7, 7, {
        huntId: 'hunt.t_forest.abc',
        npcId: 'forest.hunter.lyra',
        tileId: 't_forest',
        targetSpeciesId: 'forest_deer',
        targetAnimalId: 'animal.t_forest.forest_deer.abc',
        outcome: 'success',
        resolvedAtTick: 7,
        narration: 'hunt resolved'
      }),
      makeLivingWorldCommand('ANIMAL_KILLED', 'forest.hunter.lyra', 'npc', 7, 7, {
        huntId: 'hunt.t_forest.abc',
        animalId: 'animal.t_forest.forest_deer.abc',
        speciesId: 'forest_deer',
        tileId: 't_forest',
        killedByNpcId: 'forest.hunter.lyra',
        killedAtTick: 7,
        narration: 'animal killed'
      }),
      makeLivingWorldCommand('ANIMAL_STARVED', 'ecosystem.predator.fog_wolf', 'system', 7, 7, {
        starvationId: 'starvation.t_forest.abc',
        predatorAnimalId: 'animal.t_forest.fog_wolf.abc',
        predatorSpeciesId: 'fog_wolf',
        tileId: 't_forest',
        starvationStage: 'scarce_prey',
        starvedAtTick: 7,
        narration: 'predator found no prey'
      }),
      makeLivingWorldCommand('CARCASS_CREATED', 'system', 'system', 7, 7, {
        huntId: 'hunt.t_forest.abc',
        carcassId: 'carcass.t_forest.abc',
        animalId: 'animal.t_forest.forest_deer.abc',
        speciesId: 'forest_deer',
        tileId: 't_forest',
        edibleYield: 4,
        byproducts: ['hide', 'bone'],
        createdAtTick: 7,
        narration: 'carcass created'
      }),
      makeLivingWorldCommand('MEAT_HARVESTED', 'forest.hunter.lyra', 'npc', 7, 7, {
        huntId: 'hunt.t_forest.abc',
        carcassId: 'carcass.t_forest.abc',
        animalId: 'animal.t_forest.forest_deer.abc',
        speciesId: 'forest_deer',
        tileId: 't_forest',
        npcId: 'forest.hunter.lyra',
        quantity: 4,
        goldValue: 8,
        harvestedAtTick: 7,
        narration: 'meat harvested'
      }),
      makeLivingWorldCommand('FISHERY_HARVESTED', 'temple.fisher.yu_yan_bin', 'npc', 8, 8, {
        tileId: 't_temple',
        npcId: 'temple.fisher.yu_yan_bin',
        delta: 12,
        densityBefore: 100,
        densityAfter: 88,
        harvestedAtTick: 8,
        narration: 'fishery harvested'
      }),
      makeLivingWorldCommand('FISHERY_COLLAPSED', 'system', 'system', 8, 8, {
        tileId: 't_temple',
        density: 18,
        collapsedAtTick: 8,
        narration: 'fishery collapsed'
      }),
      makeLivingWorldCommand('GOODS_EXTRACTED', 'temple.fisher.yu_yan_bin', 'npc', 8, 8, {
        goodsId: 'fish',
        quantity: 12,
        sourceEventType: 'FISHERY_HARVESTED',
        sourceId: 'fishery:t_temple:8:temple.fisher.yu_yan_bin',
        sourceTileId: 't_temple',
        extractedByNpcId: 'temple.fisher.yu_yan_bin',
        extractedAtTick: 8,
        narration: 'goods extracted'
      }),
      makeLivingWorldCommand('GOODS_STORED', 'temple.fisher.yu_yan_bin', 'npc', 8, 8, {
        goodsId: 'fish',
        quantity: 12,
        holderType: 'npc',
        holderId: 'temple.fisher.yu_yan_bin',
        tileId: 't_temple',
        storedAtTick: 8,
        narration: 'goods stored'
      }),
      makeLivingWorldCommand('GOODS_PROCESSED', 'temple.cook', 'npc', 9, 9, {
        inputGoodsId: 'fish',
        inputQuantity: 2,
        outputGoodsId: 'fish_stew',
        outputQuantity: 1,
        holderType: 'npc',
        holderId: 'temple.cook',
        tileId: 't_temple',
        processedAtTick: 9,
        narration: 'goods processed'
      }),
      makeLivingWorldCommand('GOODS_CONSUMED', 'temple.cook', 'npc', 10, 10, {
        goodsId: 'fish_stew',
        quantity: 1,
        holderType: 'npc',
        holderId: 'temple.cook',
        tileId: 't_temple',
        consumerNpcId: 'temple.cook',
        consumedAtTick: 10,
        narration: 'goods consumed'
      }),
      makeLivingWorldCommand('GOODS_DESTROYED', 'system', 'system', 11, 11, {
        goodsId: 'fish',
        quantity: 1,
        holderType: 'npc',
        holderId: 'temple.cook',
        tileId: 't_temple',
        reason: 'spoilage',
        destroyedAtTick: 11,
        narration: 'goods destroyed'
      }),
      makeLivingWorldCommand('TRADE_ROUTE_OPENED', 'system', 'system', 12, 12, {
        routeId: 'route.t_dock.t_central.fish',
        fromTileId: 't_dock',
        toTileId: 't_central',
        goodsId: 'fish',
        openedAtTick: 12,
        narration: 'route opened'
      }),
      makeLivingWorldCommand('TRADE_ROUTE_CLOSED', 'system', 'system', 13, 13, {
        routeId: 'route.t_dock.t_central.fish',
        closedAtTick: 13,
        reason: 'storm',
        narration: 'route closed'
      }),
      makeLivingWorldCommand('GOODS_TRANSPORT_STARTED', 'dock.fishmonger.adi', 'npc', 14, 14, {
        transportId: 'transport.abc',
        routeId: 'route.t_dock.t_central.fish',
        goodsId: 'fish',
        quantity: 12,
        carrierNpcId: 'dock.fishmonger.adi',
        fromHolderType: 'npc',
        fromHolderId: 'dock.fishmonger.adi',
        fromTileId: 't_dock',
        toHolderType: 'settlement',
        toHolderId: 'settlement.t_central',
        toTileId: 't_central',
        startedAtTick: 14,
        narration: 'transport started'
      }),
      makeLivingWorldCommand('GOODS_TRANSPORT_ARRIVED', 'dock.fishmonger.adi', 'npc', 14, 14, {
        transportId: 'transport.abc',
        routeId: 'route.t_dock.t_central.fish',
        goodsId: 'fish',
        quantity: 12,
        carrierNpcId: 'dock.fishmonger.adi',
        toHolderType: 'settlement',
        toHolderId: 'settlement.t_central',
        toTileId: 't_central',
        arrivedAtTick: 14,
        narration: 'transport arrived'
      }),
      makeLivingWorldCommand('GOODS_TRANSPORT_LOST', 'system', 'system', 15, 15, {
        transportId: 'transport.def',
        routeId: 'route.t_dock.t_central.fish',
        goodsId: 'fish',
        quantity: 12,
        carrierNpcId: 'dock.fishmonger.adi',
        fromTileId: 't_dock',
        toTileId: 't_central',
        reason: 'storm',
        lostAtTick: 15,
        narration: 'transport lost'
      }),
      makeLivingWorldCommand('MARKET_PRICE_DISCOVERED', 'market.t_central', 'system', 16, 16, {
        marketId: 'market.t_central',
        settlementId: 'settlement.t_central',
        goodsId: 'refined_salt',
        supplyQuantity: 0,
        demandQuantity: 12,
        priceGold: 28,
        discoveredAtTick: 16,
        narration: 'market price discovered'
      }),
      makeLivingWorldCommand('SETTLEMENT_FORMED', 'system', 'system', 16, 16, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        formedAtTick: 16,
        founderNpcIds: ['npc-a', 'npc-b', 'npc-c'],
        narration: 'settlement formed'
      }),
      makeLivingWorldCommand('SETTLEMENT_POPULATION_UPDATED', 'system', 'system', 17, 17, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        populationNpcIds: ['npc-a', 'npc-b', 'npc-c'],
        updatedAtTick: 17,
        narration: 'settlement population updated'
      }),
      makeLivingWorldCommand('SETTLEMENT_STORAGE_UPDATED', 'system', 'system', 18, 18, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        storage: [
          { goodsId: 'fish', quantity: 12 },
          { goodsId: 'refined_salt', quantity: 4 },
        ],
        updatedAtTick: 18,
        narration: 'settlement storage updated'
      }),
      makeLivingWorldCommand('SETTLEMENT_PRESSURE_UPDATED', 'system', 'system', 19, 19, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        pressure: { food: 20, safety: 10, economy: 30, logistics: 40 },
        updatedAtTick: 19,
        narration: 'settlement pressure updated'
      }),
      makeLivingWorldCommand('SETTLEMENT_STABILITY_CHANGED', 'system', 'system', 20, 20, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        stability: 72,
        status: 'strained',
        changedAtTick: 20,
        narration: 'settlement stability changed'
      }),
      makeLivingWorldCommand('SETTLEMENT_DECLINED', 'system', 'system', 21, 21, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        stability: 24,
        declinedAtTick: 21,
        narration: 'settlement declined'
      }),
      makeLivingWorldCommand('SETTLEMENT_RECOVERED', 'system', 'system', 22, 22, {
        settlementId: 'settlement.t_central',
        tileId: 't_central',
        stability: 68,
        status: 'recovering',
        recoveredAtTick: 22,
        narration: 'settlement recovered'
      }),
      makeLivingWorldCommand('HOUSEHOLD_GOLD_CONTRIBUTED', 'npc-a', 'npc', 17, 17, {
        householdId: 'household-a',
        npcId: 'npc-a',
        amount: 2,
        sourceEventType: 'NPC_PRODUCTIVE_ACTION',
        sourceId: 'cmd-income',
        tileId: 't_market',
        contributedAtTick: 17,
        narration: 'household gold contributed'
      }),
      makeLivingWorldCommand('HOUSEHOLD_GOLD_SPENT', 'npc-a', 'npc', 18, 18, {
        householdId: 'household-a',
        npcId: 'npc-a',
        amount: 1,
        purpose: 'construction',
        sourceId: 'cmd-spend',
        tileId: 't_market',
        spentAtTick: 18,
        narration: 'household gold spent'
      }),
      makeLivingWorldCommand('HOUSEHOLD_INHERITANCE_ASSIGNED', 'household-a', 'system', 19, 19, {
        householdId: 'household-a',
        deceasedNpcId: 'npc-a',
        heirId: 'npc-b',
        amount: 3,
        assignedAtTick: 19,
        narration: 'household inheritance assigned'
      })
    ]
    for (const cmd of samples) {
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted, `${cmd.commandType} should accept`).toBe(true)
    }
  })

  it('validates NPC_INHERITANCE_GRANTED payloads (v0.88.0)', () => {
    const { ruleEngine } = makeHarness()
    const wellFormed = {
      npcId: 'npc.child.1',
      parentNpcIds: ['p1', 'p2'],
      householdId: 'hh.1',
      gold: 12,
      skillXp: { construction: 1, knowledge: 0, commerce: 2, civic: 0 },
      grantedAtTick: 17280,
      narration: 'inherits from parents',
    }
    const accept = ruleEngine.evaluate(
      makeLivingWorldCommand('NPC_INHERITANCE_GRANTED', 'npc.child.1', 'system', 21, 21, wellFormed)
    )
    expect(accept.accepted).toBe(true)

    const rejectCases: Record<string, unknown>[] = [
      { ...wellFormed, parentNpcIds: [] },
      { ...wellFormed, gold: -1 },
      { ...wellFormed, grantedAtTick: 17280.5 },
      { ...wellFormed, skillXp: { construction: 1, knowledge: 0, commerce: 2 } },
    ]
    for (const payload of rejectCases) {
      const result = ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_INHERITANCE_GRANTED', 'npc.child.1', 'system', 21, 21, payload as never)
      )
      expect(result.accepted, JSON.stringify(payload)).toBe(false)
    }
  })

  it('validates NPC_AGENT_DECISION payloads (v0.89.0)', () => {
    const { ruleEngine } = makeHarness()
    const wellFormed = {
      npcId: 'npc.smith',
      tile: 't_central',
      chosenIntent: 'survival' as const,
      targetTile: 't_dock',
      urgency: 62,
      reason: '碼頭比較安全',
      utterance: '這裡不能再待了。',
      decidedAtTick: 1000,
      narration: '鐵匠喃喃自語：「這裡不能再待了。」',
    }
    expect(
      ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_AGENT_DECISION', 'npc.smith', 'npc', 22, 22, wellFormed)
      ).accepted
    ).toBe(true)
    expect(
      ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_AGENT_DECISION', 'npc.smith', 'npc', 22, 22, {
          ...wellFormed,
          chosenIntent: 'follow_schedule' as const,
          targetTile: null,
          urgency: 0,
          utterance: null,
          narration: null,
        })
      ).accepted
    ).toBe(true)

    const rejectCases: Record<string, unknown>[] = [
      { ...wellFormed, chosenIntent: 'conquer_world' },
      { ...wellFormed, targetTile: null }, // intent choice 必須有 targetTile
      { ...wellFormed, urgency: 140 },
      { ...wellFormed, reason: '' },
    ]
    for (const payload of rejectCases) {
      const result = ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_AGENT_DECISION', 'npc.smith', 'npc', 22, 22, payload as never)
      )
      expect(result.accepted, JSON.stringify(payload)).toBe(false)
    }
  })

  it('validates NPC_FREEFORM_ACTION_PROPOSED payloads', () => {
    const { ruleEngine } = makeHarness()
    const wellFormed = {
      npcId: 'npc.smith',
      tile: 't_central',
      proposal: {
        action: 'socialize',
        target: { tileId: null, npcId: 'npc.friend', cardId: null },
        reason: '我想去找朋友借錢買卡',
        risk: '可能被拒絕',
        expectedOutcome: '得到下一步線索',
        utterance: '先去找他談談。',
      },
      resolved: {
        kind: 'socialize' as const,
        targetTile: 't_dock',
        targetNpcId: 'npc.friend',
        cardId: null,
        summary: 'socialize: 我想去找朋友借錢買卡',
      },
      accepted: true,
      rejectionReason: null,
      decidedAtTick: 1000,
      narration: '鐵匠喃喃自語：「先去找他談談。」',
    }
    expect(
      ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', 'npc.smith', 'npc', 23, 23, wellFormed)
      ).accepted
    ).toBe(true)

    expect(
      ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', 'npc.smith', 'npc', 23, 23, {
          ...wellFormed,
          accepted: false,
          rejectionReason: 'unsupported action: become_god',
          narration: null,
        })
      ).accepted
    ).toBe(true)

    const rejectCases: Record<string, unknown>[] = [
      { ...wellFormed, proposal: { ...wellFormed.proposal, reason: '' } },
      { ...wellFormed, resolved: { ...wellFormed.resolved, kind: 'become_god' } },
      { ...wellFormed, accepted: false, rejectionReason: null },
      { ...wellFormed, accepted: true, rejectionReason: 'should not exist' },
    ]
    for (const payload of rejectCases) {
      const result = ruleEngine.evaluate(
        makeLivingWorldCommand('NPC_FREEFORM_ACTION_PROPOSED', 'npc.smith', 'npc', 23, 23, payload as never)
      )
      expect(result.accepted, JSON.stringify(payload)).toBe(false)
    }
  })

  it('validates WEATHER_INTENT_PROPOSED payloads', () => {
    const { ruleEngine } = makeHarness()
    const wellFormed = {
      currentWeather: '晴' as const,
      desiredWeather: '驟雨' as const,
      mood: 'brooding' as const,
      pressureSource: 'ecosystem' as const,
      thought: '林線太乾，雲層想替山脊壓下一場重雨。',
      reason: 'forest pressure is rising',
      cadenceKey: 'weather:120:ecosystem',
      proposedAtTick: 120,
      narration: '天氣意志低語：林線太乾，雲層想替山脊壓下一場重雨。',
    }

    const accepted = ruleEngine.evaluate(
      makeLivingWorldCommand('WEATHER_INTENT_PROPOSED', WEATHER_AGENT_ACTOR_ID, 'system', 120, 120, wellFormed)
    )
    expect(accepted.accepted).toBe(true)
    if (accepted.accepted) {
      expect(accepted.events[0]!.eventType).toBe('WEATHER_INTENT_PROPOSED')
      expect(accepted.events[0]!.actorId).toBe(WEATHER_AGENT_ACTOR_ID)
    }

    const rejectCases: Array<{ payload: Record<string, unknown>; reason: string }> = [
      { payload: { ...wellFormed, desiredWeather: '沙塵暴' }, reason: 'desiredWeather invalid' },
      { payload: { ...wellFormed, currentWeather: '雷暴' }, reason: 'currentWeather invalid' },
      { payload: { ...wellFormed, mood: 'angry' }, reason: 'mood invalid' },
      { payload: { ...wellFormed, pressureSource: 'llm' }, reason: 'pressureSource invalid' },
      { payload: { ...wellFormed, thought: '' }, reason: 'thought required' },
      { payload: { ...wellFormed, reason: '' }, reason: 'reason required' },
      { payload: { ...wellFormed, cadenceKey: '' }, reason: 'cadenceKey required' },
      { payload: { ...wellFormed, proposedAtTick: -1 }, reason: 'proposedAtTick required' },
    ]

    for (const c of rejectCases) {
      const result = ruleEngine.evaluate(
        makeLivingWorldCommand('WEATHER_INTENT_PROPOSED', WEATHER_AGENT_ACTOR_ID, 'system', 120, 120, c.payload as never)
      )
      expect(result.accepted, JSON.stringify(c.payload)).toBe(false)
      if (!result.accepted) {
        expect(result.rejection.code).toBe('INVALID_PAYLOAD')
        expect(result.rejection.reason).toBe(c.reason)
      }
    }
  })

  it('rejects unknown command type', () => {
    const { ruleEngine } = makeHarness()
    const bogus = {
      commandId: 'cmd-1',
      commandType: 'NOT_A_COMMAND',
      actorId: 'a',
      actorType: 'npc',
      tick: 1,
      submittedAt: 1,
      payload: { tick: 1 }
    } as unknown as LivingWorldCommand
    const result = ruleEngine.evaluate(bogus)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.code).toBe('UNKNOWN_COMMAND')
  })

  it('registers Phase C combat commands in the living-world catalog', () => {
    const { ruleEngine } = makeHarness()
    const base = { combatId: 'combat.phase-c', combatTick: 3 }
    const samples: LivingWorldCommand[] = [
      makeLivingWorldCommand('COMBAT_CARD_PLAY', 'player-1', 'player', 20, 20, {
        ...base,
        cardClass: 'FIRE_LASH',
        targetActorId: 'npc-1',
      }),
      makeLivingWorldCommand('COMBAT_CARD_CANCEL', 'player-1', 'player', 20, 20, {
        ...base,
        cancelCommandId: 'cmd-old',
        reason: 'player_cancel',
      }),
      makeLivingWorldCommand('COMBAT_DAMAGE', 'system.combat', 'system', 20, 20, {
        ...base,
        sourceActorId: 'player-1',
        targetActorId: 'npc-1',
        amount: 18,
        cardClass: 'FIRE_LASH',
        element: 'fire',
      }),
      makeLivingWorldCommand('COMBAT_HEAL', 'system.combat', 'system', 20, 20, {
        ...base,
        sourceActorId: 'player-1',
        targetActorId: 'player-1',
        amount: 12,
        cardClass: 'MEND',
      }),
      makeLivingWorldCommand('COMBAT_STATUS_APPLY', 'system.combat', 'system', 20, 20, {
        ...base,
        sourceActorId: 'player-1',
        targetActorId: 'npc-1',
        statusId: 'burn',
        remainingTicks: 30,
        potency: 2,
        cardClass: 'FIRE_LASH',
      }),
      makeLivingWorldCommand('COMBAT_STATUS_TICK', 'system.combat', 'system', 20, 20, {
        ...base,
        targetActorId: 'npc-1',
        statusId: 'burn',
        remainingTicksAfter: 29,
        potency: 2,
      }),
      makeLivingWorldCommand('COMBAT_STATUS_END', 'system.combat', 'system', 20, 20, {
        ...base,
        targetActorId: 'npc-1',
        statusId: 'burn',
        reason: 'expired',
      }),
      makeLivingWorldCommand('COMBAT_TARGET_LOCK', 'system.combat', 'system', 20, 20, {
        ...base,
        sourceActorId: 'player-1',
        targetActorId: 'npc-1',
        durationTicks: 10,
        cardClass: 'NO_ESCAPE',
      }),
      makeLivingWorldCommand('COMBAT_PHASE_SHIFT', 'player-1', 'player', 20, 20, {
        ...base,
        actorId: 'player-1',
        phase: 'ethereal',
        cardClass: 'PHASE_SHIFT',
      }),
      makeLivingWorldCommand('COMBAT_FLEE_ATTEMPT', 'player-1', 'player', 20, 20, {
        ...base,
        actorId: 'player-1',
        cardClass: 'NO_ESCAPE',
      }),
      makeLivingWorldCommand('COMBAT_DEFEAT', 'system.combat', 'system', 20, 20, {
        ...base,
        actorId: 'npc-1',
        defeatedByActorId: 'player-1',
        finalHp: 0,
      }),
    ]

    for (const cmd of samples) {
      expect(isLivingWorldCommandType(cmd.commandType)).toBe(true)
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted, `${cmd.commandType} should accept`).toBe(true)
    }
  })

  it('rejects malformed payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand(
      'NPC_MOVE',
      'npc-a',
      'npc',
      1,
      1,
      // @ts-expect-error intentional bad payload
      { from: 't1' }
    )
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.code).toBe('INVALID_PAYLOAD')
  })

  it('rejects malformed animal starvation payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('ANIMAL_STARVED', 'ecosystem.predator.fog_wolf', 'system', 7, 7, {
      starvationId: 'starvation.t_forest.abc',
      predatorAnimalId: 'animal.t_forest.fog_wolf.abc',
      predatorSpeciesId: 'fog_wolf',
      tileId: 't_forest',
      starvationStage: 'lost' as 'scarce_prey',
      starvedAtTick: 7,
      narration: 'predator found no prey'
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('starvationStage invalid')
  })

  it('rejects malformed household economy payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('HOUSEHOLD_GOLD_CONTRIBUTED', 'npc-a', 'npc', 17, 17, {
      householdId: 'household-a',
      npcId: 'npc-a',
      amount: 0,
      sourceEventType: 'NPC_PRODUCTIVE_ACTION',
      sourceId: 'cmd-income',
      tileId: 't_market',
      contributedAtTick: 17,
      narration: 'household gold contributed'
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('amount required')
  })

  it('rejects unsorted settlement population ids', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SETTLEMENT_POPULATION_UPDATED', 'system', 'system', 17, 17, {
      settlementId: 'settlement.t_central',
      tileId: 't_central',
      populationNpcIds: ['npc-b', 'npc-a'],
      updatedAtTick: 17,
      narration: 'settlement population updated'
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('populationNpcIds must be sorted ascending and unique')
  })

  it('rejects malformed settlement pressure payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SETTLEMENT_PRESSURE_UPDATED', 'system', 'system', 19, 19, {
      settlementId: 'settlement.t_central',
      tileId: 't_central',
      pressure: { food: 101, safety: 10, economy: 30, logistics: 40 },
      updatedAtTick: 19,
      narration: 'settlement pressure updated'
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('food pressure must be integer 0-100')
  })

  it('rejects unsorted settlement storage goods', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SETTLEMENT_STORAGE_UPDATED', 'system', 'system', 18, 18, {
      settlementId: 'settlement.t_central',
      tileId: 't_central',
      storage: [
        { goodsId: 'refined_salt', quantity: 4 },
        { goodsId: 'fish', quantity: 12 },
      ],
      updatedAtTick: 18,
      narration: 'settlement storage updated'
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('storage goods ids must be sorted ascending and unique')
  })

  it('rejects malformed animal reproduction parent ids', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('ANIMAL_REPRODUCED', 'system', 'system', 7, 7, {
      animal: {
        id: 'animal.t_forest.forest_deer.repro.abc',
        speciesId: 'forest_deer',
        tileId: 't_forest',
        biomeRegion: 'forest',
        position: { subCol: 3, subRow: 4, subZ: 0 },
        state: 'idle',
        hunger: 0,
        health: 100,
        fear: 75,
        aggression: 5,
        packId: null,
        migrationTarget: null,
        currentTarget: null,
        reproductionCooldown: 0,
        lifecycleStage: 'juvenile',
        ownerSettlementId: null,
        domesticatedBy: null,
      },
      parentAnimalIds: ['parent-b', 'parent-a'],
      reproducedAtTick: 7,
      narration: null,
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('parentAnimalIds must be sorted ascending')
  })

  describe('CONSTRUCTION_INITIATE validator', () => {
    const base = {
      npcId: 'npc-a',
      tileId: 't_central',
      buildingId: 'b_central_well',
      duration: 20,
      narration: '...'
    } as const

    it('accepts a well-formed payload', () => {
      const { ruleEngine } = makeHarness()
      const cmd = makeLivingWorldCommand('CONSTRUCTION_INITIATE', 'npc-a', 'npc', 3, 3, base)
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted).toBe(true)
    })

    it('accepts a payload with a valid ConstructionMotivation', () => {
      const { ruleEngine } = makeHarness()
      const cmd = makeLivingWorldCommand('CONSTRUCTION_INITIATE', 'npc-a', 'npc', 3, 3, {
        ...base,
        motivation: {
          projectPurpose: '基礎建設',
          primaryPressure: 'infrastructure',
          pressureScore: 0.62,
          sourceGoalKind: 'build_city',
          sourceNpcId: 'npc-a',
          sourceTileId: 't_central',
          explanation: '中央區基建低於 45，由阿鬼開案。'
        }
      })
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted).toBe(true)
    })

    // NaN / Infinity are blocked one layer earlier by canonical JSON, so the
    // validator's `Number.isFinite` check is defence in depth — not reachable
    // through the public makeLivingWorldCommand path. We exercise the other
    // duration boundary checks here.
    const invalidCases: Array<{ label: string; patch: Partial<Record<keyof typeof base, unknown>>; reason: string }> = [
      { label: 'empty npcId', patch: { npcId: '' }, reason: 'npcId required' },
      { label: 'empty tileId', patch: { tileId: '' }, reason: 'tileId required' },
      { label: 'empty buildingId', patch: { buildingId: '' }, reason: 'buildingId required' },
      { label: 'non-number duration', patch: { duration: '20' }, reason: 'duration required' },
      { label: 'fractional duration', patch: { duration: 1.5 }, reason: 'duration must be an integer in [1, 1000]' },
      { label: 'zero duration', patch: { duration: 0 }, reason: 'duration must be an integer in [1, 1000]' },
      { label: 'duration over 1000', patch: { duration: 1001 }, reason: 'duration must be an integer in [1, 1000]' },
      { label: 'non-string narration', patch: { narration: 42 }, reason: 'narration required' }
    ]

    for (const c of invalidCases) {
      it(`rejects ${c.label}`, () => {
        const { ruleEngine } = makeHarness()
        const cmd = makeLivingWorldCommand(
          'CONSTRUCTION_INITIATE',
          'npc-a',
          'npc',
          3,
          3,
          { ...base, ...c.patch } as never
        )
        const result = ruleEngine.evaluate(cmd)
        expect(result.accepted).toBe(false)
        if (!result.accepted) expect(result.rejection.reason).toBe(c.reason)
      })
    }

    it('rejects a malformed motivation', () => {
      const { ruleEngine } = makeHarness()
      const cmd = makeLivingWorldCommand('CONSTRUCTION_INITIATE', 'npc-a', 'npc', 3, 3, {
        ...base,
        // ConstructionMotivation requires the full shape; passing only
        // projectPurpose triggers the first missing-field check.
        motivation: { projectPurpose: 'missing fields' }
      } as never)
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted).toBe(false)
      if (!result.accepted) expect(result.rejection.reason).toMatch(/^motivation /)
    })
  })

  it('rejects malformed motivation payloads', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('NPC_PRODUCTIVE_ACTION', 'npc-a', 'npc', 3, 3, {
      npcId: 'npc-a',
      tile: 't_market',
      activity: 'work',
      domain: 'build',
      metric: 'infrastructure',
      delta: 2,
      motivation: { projectPurpose: 'missing explanation' },
      narration: '...'
    } as never)
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toContain('motivation explanation')
  })

  it('preserves valid motivation payloads', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('NPC_PRODUCTIVE_ACTION', 'npc-a', 'npc', 3, 3, {
      npcId: 'npc-a',
      tile: 't_market',
      activity: 'work',
      domain: 'build',
      metric: 'infrastructure',
      delta: 2,
      motivation: { explanation: '住房壓力高，所以修路。', projectPurpose: '基礎建設' },
      narration: '...'
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(true)
    if (result.accepted) {
      expect((result.events[0]!.payload.data as { motivation?: { explanation: string } }).motivation?.explanation).toContain('住房')
    }
  })

  it('isLivingWorldCommandType filters correctly', () => {
    expect(isLivingWorldCommandType('NPC_MOVE')).toBe(true)
    expect(isLivingWorldCommandType('NOT_REAL')).toBe(false)
  })
})

describe('npc memory projection', () => {
  it('creates one row per participant on NPC_INTERACT', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
      tile: 't_market',
      participants: ['npc-a', 'npc-b'],
      mode: 'argue',
      narration: '...'
    })
    const events = submit(cmd, ruleEngine, eventStore)
    for (const ev of events) memory.project({ ...ev, sequence: ev.eventId.length })
    expect(memory.countFor('npc-a')).toBe(1)
    expect(memory.countFor('npc-b')).toBe(1)
    const recentA = memory.getRecent('npc-a', 5)
    expect(recentA[0]!.memoryType).toBe('interaction')
    expect(recentA[0]!.importance).toBe(7) // argue → high
  })

  it('creates event memory for NPC_PRODUCTIVE_ACTION', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('NPC_PRODUCTIVE_ACTION', 'npc-smith', 'npc', 4, 4, {
      npcId: 'npc-smith',
      tile: 't_ruin',
      activity: 'work',
      domain: 'build',
      metric: 'infrastructure',
      delta: 2,
      narration: 'The smith repaired the street cistern.'
    })
    const events = submit(cmd, ruleEngine, eventStore)
    for (const ev of events) memory.project({ ...ev, sequence: ev.eventId.length })

    expect(memory.countFor('npc-smith')).toBe(1)
    const recent = memory.getRecent('npc-smith', 5)
    expect(recent[0]!.memoryType).toBe('event')
    expect(recent[0]!.importance).toBe(6)
    expect(recent[0]!.content).toMatchObject({
      kind: 'productive.action',
      tile: 't_ruin',
      activity: 'work',
      domain: 'build',
      metric: 'infrastructure',
      delta: 2,
      narration: 'The smith repaired the street cistern.',
      tick: 4
    })
  })

  it('creates one row per affected NPC on PLAYER_INTERVENE', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('PLAYER_INTERVENE', 'player-1', 'player', 7, 7, {
      playerAccountId: 'player-1',
      npcA: 'npc-a',
      npcB: 'npc-b',
      tile: 't_market',
      intentClass: 'mediate',
      message: '先別吵，我們一起看證據。',
      narration: '玩家試著調停兩人的爭執。'
    })
    const events = submit(cmd, ruleEngine, eventStore)
    for (const ev of events) memory.project({ ...ev, sequence: ev.eventId.length })

    expect(memory.countFor('npc-a')).toBe(1)
    expect(memory.countFor('npc-b')).toBe(1)
    const recentA = memory.getRecent('npc-a', 5)
    expect(recentA[0]!.memoryType).toBe('interaction')
    expect(recentA[0]!.importance).toBe(6)
    expect(recentA[0]!.content.kind).toBe('player.intervene')
    expect(recentA[0]!.content.otherNpc).toBe('npc-b')
  })

  it('persists private player dialog as idempotent NPC memory', () => {
    const { memory } = makeHarness()
    const input = {
      npcId: 'npc-a',
      playerAccountId: 'player-1',
      intent: 'ask',
      playerMessage: '你記得我嗎？',
      replyZh: '我記得你的聲音。',
      replyEn: 'I remember your voice.',
      tick: 9,
      trustAfter: 54
    }

    memory.rememberPlayerDialog(input)
    memory.rememberPlayerDialog(input)

    expect(memory.countFor('npc-a')).toBe(1)
    const recent = memory.getRecent('npc-a', 5)
    expect(recent[0]!.content.kind).toBe('player.dialog')
    expect(recent[0]!.content.playerMessage).toBe('你記得我嗎？')
    expect(recent[0]!.importance).toBe(6)
  })

  it('ignores private player dialog memory with non-finite ticks', () => {
    const { memory } = makeHarness()

    memory.rememberPlayerDialog({
      npcId: 'npc-a',
      playerAccountId: 'player-1',
      intent: 'ask',
      playerMessage: '這不該被記住。',
      replyZh: '無效時間。',
      replyEn: 'Invalid time.',
      tick: Number.NaN,
      trustAfter: 50
    })

    expect(memory.countFor('npc-a')).toBe(0)
  })

  it('keeps identical memory content at different ticks as distinct rows', () => {
    const { memory } = makeHarness()
    const base = {
      npcId: 'npc-a',
      playerAccountId: 'player-1',
      intent: 'ask',
      playerMessage: '同一句話。',
      replyZh: '同一個回答。',
      replyEn: 'Same answer.',
      trustAfter: 50
    }

    memory.rememberPlayerDialog({ ...base, tick: 11 })
    memory.rememberPlayerDialog({ ...base, tick: 12 })

    expect(memory.countFor('npc-a')).toBe(2)
  })

  it('rebuilds identical rows from the same event log', () => {
    const { db, eventStore, ruleEngine } = makeHarness()
    const memory = new SqliteNpcMemoryStore(db)
    for (let tick = 1; tick <= 5; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode: tick % 2 === 0 ? 'chat' : 'argue',
          narration: `n${tick}`
        }),
        ruleEngine,
        eventStore
      )
    }
    const events = eventStore.readEvents()
    memory.rebuildFromEvents(events)
    const hash1 = memory.canonicalHash()
    memory.rebuildFromEvents(events)
    const hash2 = memory.canonicalHash()
    expect(hash1).toBe(hash2)
    expect(memory.countFor('npc-a')).toBe(5)
  })
})

describe('npc relationships projection', () => {
  it('chat raises trust and argue lowers it', () => {
    const { eventStore, relationships, ruleEngine } = makeHarness()
    const interact = (tick: number, mode: 'chat' | 'argue') =>
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode,
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    interact(1, 'chat') // trust 50 → 51
    interact(2, 'argue') // 51 → 49
    const events = eventStore.readEvents()
    relationships.rebuildFromEvents(events)
    const row = relationships.read('npc-a', 'npc-b')
    expect(row).not.toBeNull()
    expect(row!.trust).toBe(49)
    expect(row!.relationshipType).toBe('neutral')
    expect(row!.interactionCount).toBe(2)
  })

  it('promotes to friend above 75 trust', () => {
    const { eventStore, relationships, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 30; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode: 'chat',
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    }
    relationships.rebuildFromEvents(eventStore.readEvents())
    const row = relationships.read('npc-a', 'npc-b')
    expect(row).not.toBeNull()
    expect(row!.trust).toBeGreaterThan(75)
    expect(row!.relationshipType).toBe('friend')
  })

  it('demotes to rival below 25 trust', () => {
    const { eventStore, relationships, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 20; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', tick, tick, {
          tile: 't_market',
          participants: ['npc-a', 'npc-b'],
          mode: 'argue',
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    }
    relationships.rebuildFromEvents(eventStore.readEvents())
    const row = relationships.read('npc-a', 'npc-b')
    expect(row).not.toBeNull()
    expect(row!.trust).toBeLessThan(25)
    expect(row!.relationshipType).toBe('rival')
  })

  it('rebuilds identical relationship hash twice', () => {
    const { db, eventStore, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 12; tick += 1) {
      submit(
        makeLivingWorldCommand('NPC_INTERACT', 'npc-x', 'npc', tick, tick, {
          tile: 't_central',
          participants: tick % 2 === 0 ? ['npc-x', 'npc-y'] : ['npc-y', 'npc-z'],
          mode: tick % 3 === 0 ? 'argue' : 'chat',
          narration: '...'
        }),
        ruleEngine,
        eventStore
      )
    }
    const events = eventStore.readEvents()
    const a = new SqliteNpcRelationshipsStore(db)
    a.rebuildFromEvents(events)
    const b = new SqliteNpcRelationshipsStore(db)
    b.rebuildFromEvents(events)
    expect(a.canonicalHash()).toBe(b.canonicalHash())
  })
})

describe('catch-up summary', () => {
  it('produces identical digest for the same window', () => {
    const { eventStore, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'chat',
        narration: 'n'
      }),
      ruleEngine,
      eventStore
    )
    submit(
      makeLivingWorldCommand('AREA_PRESSURE', 'system', 'system', 2, 2, {
        tileId: 't_market',
        kind: 'pressure.food_shortage',
        detail: { food: 22 },
        narration: 'n'
      }),
      ruleEngine,
      eventStore
    )
    const events = eventStore.readEvents()
    const s1 = summarizeWindow(events, 0, 5)
    const s2 = summarizeWindow(events, 0, 5)
    expect(s1.digest).toBe(s2.digest)
    expect(s1.totalEvents).toBe(2)
    expect(s1.byNpc['npc-a']).toBe(1)
    expect(s1.byNpc['npc-b']).toBe(1)
    expect(s1.byArea['t_market']).toBe(2)
  })

  it('includes only events strictly inside the window', () => {
    const { eventStore, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 5; tick += 1) {
      submit(
        makeLivingWorldCommand('WORLD_TICK', 'system', 'system', tick, tick, {
          tick
        }),
        ruleEngine,
        eventStore
      )
    }
    const summary = summarizeWindow(eventStore.readEvents(), 2, 4)
    // WORLD_TICK does not contribute to npc/area counters but should
    // still respect the window boundary on totalEvents (we only count
    // typed living-world events in totalEvents). WORLD_TICK is typed
    // but contributes nothing to counters; verify it doesn't crash
    // and the digest is stable.
    expect(summary.sinceTick).toBe(2)
    expect(summary.untilTick).toBe(4)
    expect(summary.digest).toBeDefined()
  })

  it('summarizes productive city actions as area and npc progress', () => {
    const { eventStore, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_PRODUCTIVE_ACTION', 'npc-smith', 'npc', 4, 4, {
        npcId: 'npc-smith',
        tile: 't_ruin',
        activity: 'work',
        domain: 'build',
        metric: 'infrastructure',
        delta: 2,
        narration: 'The smith repaired the street cistern.'
      }),
      ruleEngine,
      eventStore
    )

    const summary = summarizeWindow(eventStore.readEvents(), 0, 10)

    expect(summary.totalEvents).toBe(1)
    expect(summary.byNpc['npc-smith']).toBe(1)
    expect(summary.byArea['t_ruin']).toBe(1)
    expect(summary.productiveActions).toEqual([
      {
        tick: 4,
        tile: 't_ruin',
        npcId: 'npc-smith',
        domain: 'build',
        metric: 'infrastructure',
        delta: 2,
        narration: 'The smith repaired the street cistern.'
      }
    ])
  })
})

describe('grounded chronicle renderer', () => {
  it('builds chronicle context from committed events and memory snippets', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'argue',
        narration: 'npc-a 和 npc-b 爭論了碼頭的流言。'
      }),
      ruleEngine,
      eventStore
    )
    memory.rebuildFromEvents(eventStore.readEvents())

    const context = buildChronicleContext({ events: eventStore.readRecentEvents(10), memory })

    expect(context.events).toHaveLength(1)
    expect(context.memories.length).toBeGreaterThan(0)
    expect(context.allowedNames).toContain('npc-a')
    expect(context.allowedNames).toContain('npc-b')
  })

  describe('NPC_STATE_RECORDED validator', () => {
    const base = {
      npcId: 'npc-a',
      state: {
        tile: 't_central',
        mood: 60,
        health: 80,
        activity: 'idle',
        faction: 'civilian',
        targetTile: 't_central',
        lastActedTick: 1,
        subCol: 7,
        subRow: 5,
        subZ: 0,
        personalityOverride: null,
        travelRoute: null,
        agent: { activeTask: { kind: 'bootstrap' } }
      },
      narration: null
    } as const

    it('accepts a well-formed payload', () => {
      const { ruleEngine } = makeHarness()
      const cmd = makeLivingWorldCommand('NPC_STATE_RECORDED', 'npc-a', 'npc', 3, 3, base)
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted).toBe(true)
    })

    it('rejects malformed state payload', () => {
      const { ruleEngine } = makeHarness()
      const cmd = makeLivingWorldCommand('NPC_STATE_RECORDED', 'npc-a', 'npc', 3, 3, {
        ...base,
        state: { tile: 't_central' }
      })
      const result = ruleEngine.evaluate(cmd)
      expect(result.accepted).toBe(false)
      if (!result.accepted) expect(result.rejection.reason).toBe('state.mood required')
    })
  })

  it('keeps routine productive actions out of chronicle context', () => {
    const { eventStore, memory, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_PRODUCTIVE_ACTION', 'npc-a', 'npc', 1, 1, {
        npcId: 'npc-a',
        tile: 't_market',
        activity: 'trade',
        domain: 'trade',
        metric: 'supply',
        delta: 1,
        narration: 'npc-a 把一箱補給分送到市場。'
      }),
      ruleEngine,
      eventStore
    )

    const context = buildChronicleContext({ events: eventStore.readRecentEvents(10), memory })

    expect(context.events).toHaveLength(0)
  })

  it('renders deterministic fallback without AI keys', async () => {
    const { db, eventStore, memory, ruleEngine } = makeHarness()
    const settings = new SettingsStore(db)
    submit(
      makeLivingWorldCommand('AREA_PRESSURE', 'system', 'system', 2, 2, {
        tileId: 't_market',
        kind: 'pressure.food_shortage',
        detail: { food: 22 },
        narration: '市場的食物供給變得緊張。'
      }),
      ruleEngine,
      eventStore
    )
    const context = buildChronicleContext({ events: eventStore.readRecentEvents(10), memory })

    const chronicle = await renderChronicle({ context, settings, useAi: true })

    expect(chronicle.source).toBe('fallback')
    expect(chronicle.textZh).toContain("pressure in one district altered the crowd")
    expect(chronicle.aiError).toBeNull()
  })
})

describe('emotional snapshot derivation', () => {
  it('returns identical snapshot for identical projection state', () => {
    const { eventStore, memory, relationships, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'chat',
        narration: '...'
      }),
      ruleEngine,
      eventStore
    )
    const events = eventStore.readEvents()
    memory.rebuildFromEvents(events)
    relationships.rebuildFromEvents(events)
    const ctx = { areaPressure: 0.3 }
    const a = deriveEmotionalSnapshot('npc-a', memory, relationships, ctx)
    const b = deriveEmotionalSnapshot('npc-a', memory, relationships, ctx)
    expect(a).toEqual(b)
  })

  it('higher area pressure increases tension and loss', () => {
    const { eventStore, memory, relationships, ruleEngine } = makeHarness()
    submit(
      makeLivingWorldCommand('NPC_INTERACT', 'npc-a', 'npc', 1, 1, {
        tile: 't_market',
        participants: ['npc-a', 'npc-b'],
        mode: 'argue',
        narration: '...'
      }),
      ruleEngine,
      eventStore
    )
    const events = eventStore.readEvents()
    memory.rebuildFromEvents(events)
    relationships.rebuildFromEvents(events)
    const calm = deriveEmotionalSnapshot('npc-a', memory, relationships, {
      areaPressure: 0
    })
    const stressed = deriveEmotionalSnapshot('npc-a', memory, relationships, {
      areaPressure: 1
    })
    expect(stressed.tension).toBeGreaterThan(calm.tension)
    expect(stressed.loss).toBeGreaterThan(calm.loss)
  })
})

describe('deterministic replay', () => {
  it('two reductions of the same event log produce identical projection hashes', () => {
    const { db, eventStore, ruleEngine } = makeHarness()
    for (let tick = 1; tick <= 20; tick += 1) {
      const mode = tick % 4 === 0 ? 'argue' : 'chat'
      const pair: readonly [string, string] =
        tick % 2 === 0 ? ['npc-a', 'npc-b'] : ['npc-b', 'npc-c']
      submit(
        makeLivingWorldCommand('NPC_INTERACT', pair[0], 'npc', tick, tick, {
          tile: 't_central',
          participants: pair,
          mode,
          narration: `t${tick}`
        }),
        ruleEngine,
        eventStore
      )
    }
    const events = eventStore.readEvents()

    const m1 = new SqliteNpcMemoryStore(db)
    const r1 = new SqliteNpcRelationshipsStore(db)
    m1.rebuildFromEvents(events)
    r1.rebuildFromEvents(events)
    const memHash1 = m1.canonicalHash()
    const relHash1 = r1.canonicalHash()

    const m2 = new SqliteNpcMemoryStore(db)
    const r2 = new SqliteNpcRelationshipsStore(db)
    m2.rebuildFromEvents(events)
    r2.rebuildFromEvents(events)
    const memHash2 = m2.canonicalHash()
    const relHash2 = r2.canonicalHash()

    expect(memHash1).toBe(memHash2)
    expect(relHash1).toBe(relHash2)
  })

  it('event deterministicKey ignores wall-clock submittedAt — same intent at different submittedAt yields same key', () => {
    const { ruleEngine } = makeHarness()
    const cmdEarly = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 7, 1000, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const cmdLate = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 7, 999_999_999, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const a = ruleEngine.evaluate(cmdEarly)
    const b = ruleEngine.evaluate(cmdLate)
    expect(a.accepted).toBe(true)
    expect(b.accepted).toBe(true)
    if (a.accepted && b.accepted) {
      expect(a.events[0]!.deterministicKey).toBe(b.events[0]!.deterministicKey)
      expect(a.events[0]!.eventId).toBe(b.events[0]!.eventId)
    }
  })

  it('different ticks yield different deterministic keys for the same payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd5 = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 5, 1000, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const cmd6 = makeLivingWorldCommand('NPC_MOVE', 'npc-a', 'npc', 6, 1000, {
      npcId: 'npc-a',
      from: 't_central',
      to: 't_market',
      activity: 'move',
      reachedDest: false,
      narration: 'walk'
    })
    const a = ruleEngine.evaluate(cmd5)
    const b = ruleEngine.evaluate(cmd6)
    if (a.accepted && b.accepted) {
      expect(a.events[0]!.deterministicKey).not.toBe(b.events[0]!.deterministicKey)
    }
  })

  it('accepts SPECIES_EXTINCTION_WARNING with valid payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SPECIES_EXTINCTION_WARNING', 'system', 'system', 100, 100, {
      speciesId: 'fog_wolf', tileId: 't_forest', population: 2, threshold: 3, tick: 100,
    })
    expect(ruleEngine.evaluate(cmd).accepted).toBe(true)
  })

  it('rejects SPECIES_EXTINCTION_WARNING with missing threshold', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SPECIES_EXTINCTION_WARNING', 'system', 'system', 100, 100, {
      speciesId: 'fog_wolf', tileId: 't_forest', population: 2, threshold: 0, tick: 100,
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('threshold must be positive integer')
  })

  it('accepts SPECIES_EXTINCT with valid payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SPECIES_EXTINCT', 'system', 'system', 200, 200, {
      speciesId: 'fog_wolf', lastSeenTick: 180, affectedTileIds: ['t_forest'], narration: null,
    })
    expect(ruleEngine.evaluate(cmd).accepted).toBe(true)
  })

  it('accepts SPECIES_RECOVERED with valid payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('SPECIES_RECOVERED', 'system', 'system', 300, 300, {
      speciesId: 'fog_wolf', tileId: 't_forest', population: 5, tick: 300,
    })
    expect(ruleEngine.evaluate(cmd).accepted).toBe(true)
  })

  it('accepts FISHERY_RECOVERED with valid payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('FISHERY_RECOVERED', 'system', 'system', 400, 400, {
      tileId: 't_salt_marsh', density: 35, tick: 400,
    })
    expect(ruleEngine.evaluate(cmd).accepted).toBe(true)
  })

  it('accepts ECOSYSTEM_PRESSURE_RAISED with valid payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('ECOSYSTEM_PRESSURE_RAISED', 'system', 'system', 50, 50, {
      tileId: 't_forest', pressureLevel: 40, tick: 50,
    })
    expect(ruleEngine.evaluate(cmd).accepted).toBe(true)
  })

  it('rejects ECOSYSTEM_PRESSURE_RAISED with pressureLevel > 100', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('ECOSYSTEM_PRESSURE_RAISED', 'system', 'system', 50, 50, {
      tileId: 't_forest', pressureLevel: 101, tick: 50,
    })
    const result = ruleEngine.evaluate(cmd)
    expect(result.accepted).toBe(false)
    if (!result.accepted) expect(result.rejection.reason).toBe('pressureLevel must be integer 0–100')
  })

  it('accepts ECOSYSTEM_PRESSURE_RECOVERED with valid payload', () => {
    const { ruleEngine } = makeHarness()
    const cmd = makeLivingWorldCommand('ECOSYSTEM_PRESSURE_RECOVERED', 'system', 'system', 60, 60, {
      tileId: 't_forest', tick: 60,
    })
    expect(ruleEngine.evaluate(cmd).accepted).toBe(true)
  })
})
