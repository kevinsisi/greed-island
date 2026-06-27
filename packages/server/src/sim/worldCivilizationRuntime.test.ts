import { describe, expect, it } from 'vitest'
import { LivingWorldRuleEngine, makeLivingWorldCommand } from '../kernel/livingWorldCommands.js'
import { WorldCivilizationProjection, planWorldCivilizationCommands } from './worldCivilizationRuntime.js'

describe('WorldCivilizationProjection', () => {
  it('rebuilds world goals and discovered technology from EventLog facts', () => {
    const projection = new WorldCivilizationProjection()
    projection.projectEvent({
      eventType: 'WORLD_GOAL_DECLARED',
      tick: 10,
      payload: { data: {
        goalId: 'goal.infrastructure.roads',
        domain: 'infrastructure',
        title: '建立跨區道路網',
        rationale: '居民移動與運貨已成為城市瓶頸。',
        targetProgress: 100,
        declaredAtTick: 10,
        narration: '潮鳴市開始把跨區道路視為共同目標。',
      } },
    })
    projection.projectEvent({
      eventType: 'WORLD_GOAL_PROGRESS_RECORDED',
      tick: 15,
      payload: { data: {
        goalId: 'goal.infrastructure.roads',
        progressDelta: 45,
        sourceEventType: 'ROAD_CONSTRUCTED',
        sourceId: 'road.t_central.t_dock',
        recordedAtTick: 15,
        narration: '道路修築讓跨區交通目標有了進展。',
      } },
    })
    projection.projectEvent({
      eventType: 'WORLD_TECH_DISCOVERED',
      tick: 20,
      payload: { data: {
        techId: 'tech.road_surveying',
        domain: 'infrastructure',
        title: '道路測量術',
        discoveredAtTick: 20,
        evidenceEventIds: ['ev1', 'ev2'],
        unlocks: ['better-road-planning'],
        narration: '工匠們把道路測量整理成可傳授的技術。',
      } },
    })

    const snapshot = projection.snapshot()
    expect(snapshot.goals).toHaveLength(1)
    expect(snapshot.goals[0]).toMatchObject({ goalId: 'goal.infrastructure.roads', progress: 45, completed: false })
    expect(snapshot.technologies).toContainEqual(expect.objectContaining({ techId: 'tech.road_surveying', domain: 'infrastructure' }))
  })
  it('promotes accepted invention freeform actions into replayable technology evidence', () => {
    const projection = new WorldCivilizationProjection()
    projection.projectEvent({
      eventType: 'NPC_FREEFORM_ACTION_PROPOSED',
      tick: 44,
      payload: { data: {
        npcId: 'npc.inventor',
        tile: 't_central',
        resolved: { kind: 'invent', targetTile: 't_central', targetNpcId: null, cardId: null, summary: '整理鹽霧保存草圖' },
        accepted: true,
        narration: 'npc.inventor invents',
      } },
    })

    expect(projection.snapshot().technologies).toContainEqual(expect.objectContaining({
      techId: 'tech.freeform.npc.inventor.44',
      domain: 'learning',
      title: '整理鹽霧保存草圖',
      evidenceEventIds: ['NPC_FREEFORM_ACTION_PROPOSED:44:npc.inventor'],
    }))
  })
})

describe('planWorldCivilizationCommands', () => {
  it('declares a world-level technology goal from repeated learning evidence', () => {
    const commands = planWorldCivilizationCommands({
      tick: 120,
      submittedAt: 999,
      projection: new WorldCivilizationProjection().snapshot(),
      recentEvidence: [
        { eventId: 'ev1', eventType: 'NPC_OBSERVED_SKILL', subjectId: 'construction', domain: 'construction', tick: 100 },
        { eventId: 'ev2', eventType: 'NPC_MENTORSHIP_COMPLETED', subjectId: 'construction', domain: 'construction', tick: 110 },
        { eventId: 'ev3', eventType: 'CONSTRUCTION_PROJECT_PROGRESS', subjectId: 'construction', domain: 'construction', tick: 118 },
      ],
    })

    expect(commands.map((c) => c.commandType)).toEqual(['WORLD_GOAL_DECLARED', 'WORLD_TECH_DISCOVERED'])
    expect(commands[0]!.payload).toMatchObject({ domain: 'construction', goalId: 'goal.construction.knowledge-system' })
    expect(commands[1]!.payload).toMatchObject({ techId: 'tech.construction.knowledge-system', domain: 'construction' })
  })

  it('does not rediscover a technology that already exists', () => {
    const projection = new WorldCivilizationProjection()
    projection.projectEvent({
      eventType: 'WORLD_TECH_DISCOVERED',
      tick: 20,
      payload: { data: {
        techId: 'tech.construction.knowledge-system',
        domain: 'construction',
        title: '建造知識體系',
        discoveredAtTick: 20,
        evidenceEventIds: ['ev0'],
        unlocks: ['world-goal-planning'],
        narration: '建造經驗被整理成技術。',
      } },
    })

    const commands = planWorldCivilizationCommands({
      tick: 130,
      submittedAt: 999,
      projection: projection.snapshot(),
      recentEvidence: [
        { eventId: 'ev4', eventType: 'NPC_OBSERVED_SKILL', subjectId: 'construction', domain: 'construction', tick: 121 },
        { eventId: 'ev5', eventType: 'NPC_OBSERVED_SKILL', subjectId: 'construction', domain: 'construction', tick: 122 },
        { eventId: 'ev6', eventType: 'CONSTRUCTION_PROJECT_PROGRESS', subjectId: 'construction', domain: 'construction', tick: 123 },
      ],
    })

    expect(commands).toEqual([])
  })
})

describe('living-world Rule Engine civilization commands', () => {
  it('accepts valid world technology discovery and rejects missing evidence', () => {
    const engine = new LivingWorldRuleEngine()
    const accepted = engine.evaluate(makeLivingWorldCommand('WORLD_TECH_DISCOVERED', 'world.civilization', 'system', 200, 999, {
      techId: 'tech.construction.knowledge-system',
      domain: 'construction',
      title: '建造知識體系',
      discoveredAtTick: 200,
      evidenceEventIds: ['ev1', 'ev2'],
      unlocks: ['world-goal-planning'],
      narration: '建造經驗被整理成可傳授的知識。',
    }))
    expect(accepted.accepted).toBe(true)

    const rejected = engine.evaluate(makeLivingWorldCommand('WORLD_TECH_DISCOVERED', 'world.civilization', 'system', 201, 999, {
      techId: 'tech.bad',
      domain: 'construction',
      title: '無根據技術',
      discoveredAtTick: 201,
      evidenceEventIds: [],
      unlocks: [],
      narration: '不應該成立。',
    }))
    expect(rejected.accepted).toBe(false)
  })
})
