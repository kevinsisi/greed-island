import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { assertValidProfile, type NpcProfile } from './types.js'

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
    const parsed = JSON.parse(raw) as NpcProfile
    assertValidProfile(parsed)
    if (seenIds.has(parsed.id)) {
      throw new Error(`Duplicate NPC id ${parsed.id} (file: ${entry.name}).`)
    }
    seenIds.add(parsed.id)
    profiles.push(parsed)
  }

  profiles.sort((a, b) => a.id.localeCompare(b.id))
  return profiles
}
