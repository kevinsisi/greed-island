// MaturationInheritancePlanner — pure function：孩子成年那一刻，從父母
// civic 紀錄（gold + skillXp）的平均值確定性換算出起步 seed。
//
// 這不是轉移：父母的 civic 狀態不變（模擬「從父母身上學到的東西」，
// 不是分家產）。死亡的父母用最後已知紀錄，與在世父母同權重。
// 規格：openspec/changes/matured-child-inheritance/specs/matured-child-inheritance/spec.md

import type { MaturationIntent } from './maturationPlanner.js'
import type { NpcCivicRecord, NpcSkillKey } from './cityLife.js'

const SKILL_KEYS: readonly NpcSkillKey[] = ['construction', 'knowledge', 'commerce', 'civic']

export type InheritanceGrant = Readonly<{
  npcId: string
  parentNpcIds: readonly string[]
  householdId: string
  gold: number
  skillXp: Readonly<Record<NpcSkillKey, number>>
  grantedAtTick: number
}>

export function planMaturationInheritance(input: {
  maturationIntent: MaturationIntent
  civicRecords: Readonly<Record<string, NpcCivicRecord>>
  tick: number
  config: { goldFraction: number; skillFraction: number }
}): InheritanceGrant | null {
  const { maturationIntent, civicRecords, tick, config } = input
  const parentsWithRecord = maturationIntent.parentNpcIds
    .map((id) => civicRecords[id])
    .filter((record): record is NpcCivicRecord => record !== undefined)
  if (parentsWithRecord.length === 0) return null

  const meanGold =
    parentsWithRecord.reduce((sum, record) => sum + record.gold, 0) / parentsWithRecord.length
  const gold = Math.floor(meanGold * config.goldFraction)

  const skillXp = {} as Record<NpcSkillKey, number>
  for (const key of SKILL_KEYS) {
    const meanSkill =
      parentsWithRecord.reduce((sum, record) => sum + (record.skillXp[key] ?? 0), 0) /
      parentsWithRecord.length
    skillXp[key] = Math.floor(meanSkill * config.skillFraction)
  }

  const hasAnySeed = gold > 0 || SKILL_KEYS.some((key) => skillXp[key] > 0)
  if (!hasAnySeed) return null

  return {
    npcId: maturationIntent.npcId,
    parentNpcIds: maturationIntent.parentNpcIds,
    householdId: maturationIntent.householdId,
    gold,
    skillXp,
    grantedAtTick: tick,
  }
}
