import type {
  WeatherAgentMood,
  WeatherAgentPressureSource,
  WeatherAgentSupportedWeather,
  WeatherIntentProposedCmd,
} from '../kernel/livingWorldCommands.js'

export type WeatherAgentAreaSignal = Readonly<{
  tileId: string
  resources?: Readonly<Record<string, number>>
  factionTension?: number
}>

export type WeatherAgentInput = Readonly<{
  tick: number
  cadenceStep: number
  currentWeather: WeatherAgentSupportedWeather
  cycleWeather: WeatherAgentSupportedWeather
  season: string
  activeWorldEventIds: readonly string[]
  areas: readonly WeatherAgentAreaSignal[]
}>

const DRY_RESOURCE_THRESHOLD = 35
const HIGH_TENSION_THRESHOLD = 70

export function planWeatherAgentIntent(input: WeatherAgentInput): WeatherIntentProposedCmd | null {
  const pressure = pickPressure(input)
  const desiredWeather = pickDesiredWeather(input, pressure)
  if (desiredWeather === input.currentWeather) return null
  const mood = pickMood(input, pressure)
  const thought = renderThought(input, desiredWeather, mood, pressure)
  const reason = renderReason(input, pressure)
  return {
    currentWeather: input.currentWeather,
    desiredWeather,
    mood,
    pressureSource: pressure,
    thought,
    reason,
    cadenceKey: `weather:${input.cadenceStep}:${pressure}`,
    proposedAtTick: input.tick,
    narration: `天氣意志低語：${thought}`,
  }
}

function pickPressure(input: WeatherAgentInput): WeatherAgentPressureSource {
  if (input.activeWorldEventIds.some((id) => id.includes('weather.'))) return 'world_event'
  if (input.areas.some((area) => area.factionTension !== undefined && area.factionTension >= HIGH_TENSION_THRESHOLD)) {
    return 'civilization'
  }
  if (input.areas.some((area) => {
    const food = area.resources?.food
    const water = area.resources?.water
    return (food !== undefined && food <= DRY_RESOURCE_THRESHOLD) || (water !== undefined && water <= DRY_RESOURCE_THRESHOLD)
  })) return 'ecosystem'
  if (input.season === '雨之月' || input.season === '霜之月') return 'season'
  return 'cadence'
}

function pickDesiredWeather(input: WeatherAgentInput, pressure: WeatherAgentPressureSource): WeatherAgentSupportedWeather {
  switch (pressure) {
    case 'ecosystem':
      return input.currentWeather === '霧雨' ? '驟雨' : '霧雨'
    case 'civilization':
      return input.currentWeather === '微風' ? '陰' : '微風'
    case 'world_event':
      return input.currentWeather === '驟雨' ? '陰' : '驟雨'
    case 'season':
      return input.season === '雨之月' ? '霧雨' : '陰'
    case 'cadence':
      return input.cycleWeather
  }
}

function pickMood(input: WeatherAgentInput, pressure: WeatherAgentPressureSource): WeatherAgentMood {
  if (pressure === 'ecosystem') return 'brooding'
  if (pressure === 'civilization') return 'restless'
  if (pressure === 'world_event') return 'watchful'
  if (pressure === 'season') return input.season === '雨之月' ? 'watchful' : 'calm'
  return input.cycleWeather === '微風' ? 'playful' : 'calm'
}

function renderThought(
  input: WeatherAgentInput,
  desiredWeather: WeatherAgentSupportedWeather,
  mood: WeatherAgentMood,
  pressure: WeatherAgentPressureSource
): string {
  const weatherLine = weatherThoughtLine(desiredWeather)
  switch (pressure) {
    case 'ecosystem':
      return `林線與水脈正在發緊，我想把${desiredWeather}壓向島上，${weatherLine}`
    case 'civilization':
      return `街區的火氣太密，我用${desiredWeather}把人聲撥散一點，${weatherLine}`
    case 'world_event':
      return `世界事件正在牽動雲層，我保持${mood}，讓${desiredWeather}先落到地表。`
    case 'season':
      return `${input.season}正在推我轉身，我選擇${desiredWeather}，${weatherLine}`
    case 'cadence':
      return `節律走到第 ${input.cadenceStep} 拍，我讓天空轉為${desiredWeather}，${weatherLine}`
  }
}

function renderReason(input: WeatherAgentInput, pressure: WeatherAgentPressureSource): string {
  switch (pressure) {
    case 'ecosystem':
      return 'ecosystem pressure shaped the weather-agent intent'
    case 'civilization':
      return 'civilization tension shaped the weather-agent intent'
    case 'world_event':
      return 'active weather world event shaped the weather-agent intent'
    case 'season':
      return `season ${input.season} shaped the weather-agent intent`
    case 'cadence':
      return 'weather cadence shaped the weather-agent intent'
  }
}

function weatherThoughtLine(weather: WeatherAgentSupportedWeather): string {
  switch (weather) {
    case '晴':
      return '讓屋簷與道路重新曬乾。'
    case '陰':
      return '讓光線收斂，讓人先慢下來。'
    case '霧雨':
      return '讓細雨先替土地試探回音。'
    case '驟雨':
      return '讓急雨把積壓的熱與灰沖開。'
    case '微風':
      return '讓風穿過街口，替人群鬆一口氣。'
  }
}
