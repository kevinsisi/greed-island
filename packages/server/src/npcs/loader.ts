import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertValidProfile, type NpcProfile } from './types.js'
import { registerDialogPack } from './dialog.js'
import {
  buildDailyLifeDialogPack,
  readArchetypeFromProfile,
} from './dialogPacks/dailyLife.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PROFILES_DIR = resolve(HERE, 'profiles')

export function loadNpcProfiles(dir: string = DEFAULT_PROFILES_DIR): NpcProfile[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const profiles: NpcProfile[] = []
  const seenIds = new Set<string>()

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = resolve(dir, entry.name)
    const raw = readFileSync(path, 'utf-8')
    const parsed = JSON.parse(raw) as NpcProfile | NpcProfile[]
    const batch = Array.isArray(parsed) ? parsed : [parsed]
    for (const profile of batch) {
      assertValidProfile(profile)
      if (seenIds.has(profile.id)) {
        throw new Error(`Duplicate NPC id ${profile.id} (file: ${entry.name}).`)
      }
      seenIds.add(profile.id)
      profiles.push(profile)
    }
  }

  profiles.sort((a, b) => a.id.localeCompare(b.id))

  for (const profile of profiles) {
    const archetype = readArchetypeFromProfile(profile)
    if (archetype) {
      registerDialogPack(profile.id, buildDailyLifeDialogPack(profile, archetype))
    }
  }

  return profiles
}
