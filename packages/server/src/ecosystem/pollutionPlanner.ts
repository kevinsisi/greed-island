import { POLLUTION_THRESHOLD } from '../config/world.js'

export type PollutionDecision = 'increased' | 'recovered' | null

export function planPollution(input: {
  currentPressureLevel: number
  previousPressureLevel: number
}): PollutionDecision {
  const { currentPressureLevel, previousPressureLevel } = input
  if (currentPressureLevel >= POLLUTION_THRESHOLD && previousPressureLevel < POLLUTION_THRESHOLD) return 'increased'
  if (currentPressureLevel < POLLUTION_THRESHOLD && previousPressureLevel >= POLLUTION_THRESHOLD) return 'recovered'
  return null
}
