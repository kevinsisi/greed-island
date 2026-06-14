// Phase 1 §11.5 — World State Projection (typed replacement for FACT_SET weather/season/rareWindow/activeEvents).
// Reduces typed living-world events into the latest snapshot per dimension.
// Legacy FACT_SET keys remain as boot fallback for older event logs.

import { hashCanonicalJson } from '../kernel/canonicalJson.js'
import type { Event } from '../kernel/types.js'

export type WorldStateActiveEventSeed = Readonly<{
  worldEventId: string
  templateId: string
  startedAtTick: number
}>

export type WorldStateRareWindow = Readonly<{
  open: boolean
  closesAt: number | null
}>

export type WeatherAgentThought = Readonly<{
  tick: number
  currentWeather: string
  desiredWeather: string
  mood: string
  pressureSource: string
  thought: string
  reason: string
  cadenceKey: string
}>

export type WeatherAgentState = Readonly<{
  mood: string | null
  latestThought: WeatherAgentThought | null
  recentThoughts: readonly WeatherAgentThought[]
  latestDesiredWeather: string | null
  latestAcceptedWeather: string | null
}>

export const WORLD_STATE_BOOT_EVENT_TYPES = [
  'WEATHER_INTENT_PROPOSED',
  'WEATHER_CHANGE',
  'SEASON_CHANGE',
  'RARE_WINDOW_OPEN',
  'RARE_WINDOW_CLOSE',
  'WORLD_EVENT_SPAWN',
  'WORLD_EVENT_END',
] as const

export class WorldStateProjection {
  private weather: string | null = null
  private season: string | null = null
  private rareWindow: WorldStateRareWindow = { open: false, closesAt: null }
  private activeEventSeeds = new Map<string, WorldStateActiveEventSeed>()
  private weatherAgent: WeatherAgentState = emptyWeatherAgentState()
  private hydrated = false

  rebuildFromEvents(events: readonly Event[]): void {
    this.weather = null
    this.season = null
    this.rareWindow = { open: false, closesAt: null }
    this.activeEventSeeds = new Map()
    this.weatherAgent = emptyWeatherAgentState()
    this.hydrated = false
    for (const event of [...events].sort((a, b) => a.sequence - b.sequence)) {
      this.project(event)
    }
  }

  project(event: Event): void {
    const p = readData(event)
    if (!p) return

    switch (event.eventType) {
      case 'WEATHER_INTENT_PROPOSED': {
        const thought = readWeatherAgentThought(event, p)
        if (thought) {
          this.weatherAgent = {
            mood: thought.mood,
            latestThought: thought,
            recentThoughts: [...this.weatherAgent.recentThoughts, thought].slice(-8),
            latestDesiredWeather: thought.desiredWeather,
            latestAcceptedWeather: this.weatherAgent.latestAcceptedWeather,
          }
          this.hydrated = true
        }
        break
      }

      case 'WEATHER_CHANGE':
        if (typeof p.to === 'string') {
          this.weather = p.to
          this.weatherAgent = { ...this.weatherAgent, latestAcceptedWeather: p.to }
          this.hydrated = true
        }
        break

      case 'SEASON_CHANGE':
        if (typeof p.to === 'string') { this.season = p.to; this.hydrated = true }
        break

      case 'RARE_WINDOW_OPEN':
        if (typeof p.closesAtTick === 'number') {
          this.rareWindow = { open: true, closesAt: p.closesAtTick }
          this.hydrated = true
        }
        break

      case 'RARE_WINDOW_CLOSE':
        this.rareWindow = { open: false, closesAt: null }
        this.hydrated = true
        break

      case 'WORLD_EVENT_SPAWN':
        if (typeof p.worldEventId === 'string' && typeof p.templateId === 'string') {
          this.activeEventSeeds.set(p.worldEventId, {
            worldEventId: p.worldEventId,
            templateId: p.templateId,
            startedAtTick: event.tick ?? 0,
          })
          this.hydrated = true
        }
        break

      case 'WORLD_EVENT_END':
        if (typeof p.worldEventId === 'string') {
          this.activeEventSeeds.delete(p.worldEventId)
          this.hydrated = true
        }
        break
    }
  }

  isHydrated(): boolean { return this.hydrated }
  getWeather(): string | null { return this.weather }
  getSeason(): string | null { return this.season }
  getRareWindow(): WorldStateRareWindow { return this.rareWindow }
  getWeatherAgent(): WeatherAgentState { return this.weatherAgent }
  getActiveEventSeeds(): readonly WorldStateActiveEventSeed[] {
    return [...this.activeEventSeeds.values()]
  }

  canonicalHash(): string {
    return hashCanonicalJson({
      weather: this.weather,
      weatherAgent: this.weatherAgent,
      season: this.season,
      rareWindow: this.rareWindow,
      activeEventSeeds: [...this.activeEventSeeds.values()].sort((a, b) =>
        a.worldEventId.localeCompare(b.worldEventId)
      ),
    })
  }
}

function emptyWeatherAgentState(): WeatherAgentState {
  return {
    mood: null,
    latestThought: null,
    recentThoughts: [],
    latestDesiredWeather: null,
    latestAcceptedWeather: null,
  }
}

function readWeatherAgentThought(event: Event, p: Record<string, unknown>): WeatherAgentThought | null {
  if (
    typeof p.currentWeather !== 'string' ||
    typeof p.desiredWeather !== 'string' ||
    typeof p.mood !== 'string' ||
    typeof p.pressureSource !== 'string' ||
    typeof p.thought !== 'string' ||
    typeof p.reason !== 'string' ||
    typeof p.cadenceKey !== 'string'
  ) return null
  return {
    tick: event.tick ?? 0,
    currentWeather: p.currentWeather,
    desiredWeather: p.desiredWeather,
    mood: p.mood,
    pressureSource: p.pressureSource,
    thought: p.thought,
    reason: p.reason,
    cadenceKey: p.cadenceKey,
  }
}

function readData(event: Event): Record<string, unknown> | null {
  const payload = event.payload as { data?: unknown } | null
  const d = payload?.data
  if (!d || typeof d !== 'object') return null
  return d as Record<string, unknown>
}
