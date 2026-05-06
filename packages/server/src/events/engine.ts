// Deterministic world event engine.
//
// The engine owns the in-memory active-event list and decides, per
// tick, whether to spawn a new event or expire ones whose duration
// has elapsed. It is intentionally pure with respect to the kernel:
// the simulation runtime calls `tick()` and gets back a delta describing
// what spawned and what expired this tick. The runtime is then free
// to write that delta to the kernel as FACT_SET events (which is what
// it does — see sim/runtime.ts).
//
// Determinism: the spawn RNG is seeded from the current tick. Two
// runs of the simulation against the same event log will land on the
// exact same template selections at the exact same ticks.

import { TICKS_PER_MINUTE } from '../config/world.js'
import {
  findEventTemplate,
  listEventTemplates,
} from './templates.js'
import type {
  ActiveWorldEvent,
  WorldEventContext,
  WorldEventTemplate,
} from './types.js'

/** Spawn cadence: try to start a new world event every N ticks. */
const EVENT_SPAWN_CADENCE_TICKS = TICKS_PER_MINUTE * 3
/** Maximum concurrent active events — cap to avoid UI / log flooding. */
const MAX_ACTIVE_EVENTS = 6

export type EventEngineWorldFacts = Readonly<{
  weather: string
  season: string
}>

export type EventTickDelta = Readonly<{
  spawned: readonly ActiveWorldEvent[]
  expired: readonly ActiveWorldEvent[]
  active: readonly ActiveWorldEvent[]
}>

/**
 * Mulberry32 RNG. Tiny, deterministic, fast. Seeded with the spawn
 * tick so replays land on the same numbers.
 */
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildContext(tick: number, facts: EventEngineWorldFacts, salt: number): WorldEventContext {
  return {
    tick,
    weather: facts.weather,
    season: facts.season,
    rng: makeRng(tick * 1_000_003 + salt),
  }
}

function instanceId(template: WorldEventTemplate, tick: number): string {
  return `we_${template.id}_${tick}`
}

function spawnFromTemplate(
  template: WorldEventTemplate,
  tick: number,
  facts: EventEngineWorldFacts
): ActiveWorldEvent {
  const ctx = buildContext(tick, facts, 1)
  const text = template.narrate(ctx)
  const payload = template.buildPayload ? template.buildPayload(ctx) : {}
  return {
    id: instanceId(template, tick),
    templateId: template.id,
    type: template.type,
    scope: template.scope,
    startedAtTick: tick,
    endsAtTick: tick + template.durationTicks,
    text,
    payload,
  }
}

export class WorldEventEngine {
  private active: ActiveWorldEvent[] = []

  constructor(private readonly templates: readonly WorldEventTemplate[] = listEventTemplates()) {
    if (this.templates.length === 0) {
      throw new Error('WorldEventEngine requires at least one event template.')
    }
  }

  /**
   * Advance the engine to `tick`. Returns the delta of events that
   * spawned/expired during this tick along with the post-tick active
   * set.
   */
  tick(currentTick: number, facts: EventEngineWorldFacts): EventTickDelta {
    const expired: ActiveWorldEvent[] = []
    const stillActive: ActiveWorldEvent[] = []
    for (const event of this.active) {
      if (event.endsAtTick <= currentTick) expired.push(event)
      else stillActive.push(event)
    }
    this.active = stillActive

    const spawned: ActiveWorldEvent[] = []
    if (
      currentTick > 0 &&
      currentTick % EVENT_SPAWN_CADENCE_TICKS === 0 &&
      this.active.length < MAX_ACTIVE_EVENTS
    ) {
      const pickRng = makeRng(currentTick)
      const idx = Math.floor(pickRng() * this.templates.length)
      const template = this.templates[idx]!
      // Avoid duplicating an already-active event of the same template.
      if (!this.active.some((e) => e.templateId === template.id)) {
        const event = spawnFromTemplate(template, currentTick, facts)
        spawned.push(event)
        this.active.push(event)
      }
    }

    return {
      spawned,
      expired,
      active: this.active.slice(),
    }
  }

  /** Restore engine state from a previously-persisted active list. */
  hydrate(active: readonly ActiveWorldEvent[], currentTick: number): void {
    this.active = active.filter((e) => e.endsAtTick > currentTick).map((e) => ({ ...e }))
  }

  getActive(): readonly ActiveWorldEvent[] {
    return this.active.slice()
  }
}

export function rebuildActiveEvent(
  templateId: string,
  tick: number,
  facts: EventEngineWorldFacts
): ActiveWorldEvent | null {
  const template = findEventTemplate(templateId)
  if (!template) return null
  return spawnFromTemplate(template, tick, facts)
}
