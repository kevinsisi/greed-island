import { makeLivingWorldCommand, type LivingWorldCommand } from '../kernel/livingWorldCommands.js'
import type { SkillXpProjection } from '../projections/skillXp.js'
import { SKILL_XP_PER_MENTOR_TICK, SKILL_XP_LEVEL_THRESHOLD } from '../config/world.js'

export function planMentorshipTick(
  skillXpProjection: SkillXpProjection,
  tick: number,
): LivingWorldCommand[] {
  const commands: LivingWorldCommand[] = []
  const active = skillXpProjection.getAllActive()

  for (const row of active) {
    if (!row.mentorId) continue
    const projectedXp = row.xp + SKILL_XP_PER_MENTOR_TICK
    const nextLevel = Math.floor(projectedXp / SKILL_XP_LEVEL_THRESHOLD)

    if (nextLevel > row.level) {
      // Threshold crossed — emit completion
      commands.push(
        makeLivingWorldCommand(
          'NPC_MENTORSHIP_COMPLETED',
          `system.mentorship.${row.skillId}`,
          'system',
          tick,
          tick,
          {
            mentorNpcId: row.mentorId,
            menteeNpcId: row.npcId,
            skillId: row.skillId,
            finalLevel: nextLevel,
            tick,
          }
        )
      )
    } else {
      // Ongoing — emit XP increment via observation
      commands.push(
        makeLivingWorldCommand(
          'NPC_OBSERVED_SKILL',
          `system.mentorship.${row.skillId}`,
          'system',
          tick,
          tick,
          {
            npcId: row.npcId,
            skillId: row.skillId,
            sourceEventType: 'NPC_MENTORSHIP_STARTED',
            tick,
            xpDelta: SKILL_XP_PER_MENTOR_TICK,
          }
        )
      )
    }
  }

  return commands
}
