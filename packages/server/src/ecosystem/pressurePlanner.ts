import {
  ECOSYSTEM_PRESSURE_RECOVERY_TICKS,
  ECOSYSTEM_PRESSURE_WORK_THRESHOLD,
} from '../config/world.js'

export type PressureDecision = 'raise' | 'recover' | null

export function planEcosystemPressure(input: {
  tick: number
  tileId: string
  recentWorkActions: number
  currentPressureLevel: number
  lastPressureRaisedTick: number | null
}): PressureDecision {
  if (input.recentWorkActions >= ECOSYSTEM_PRESSURE_WORK_THRESHOLD) {
    return 'raise'
  }
  if (
    input.currentPressureLevel > 0 &&
    input.recentWorkActions === 0 &&
    (input.lastPressureRaisedTick === null ||
      input.tick - input.lastPressureRaisedTick >= ECOSYSTEM_PRESSURE_RECOVERY_TICKS)
  ) {
    return 'recover'
  }
  return null
}
