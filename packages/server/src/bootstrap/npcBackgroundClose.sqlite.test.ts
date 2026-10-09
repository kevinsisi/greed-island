// Actual native SQLite/normal composition close gate. No real provider calls or credentials.
import Database from 'better-sqlite3'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { migrateIdentitySchema } from '../identity/schema.js'
import { initializeKernelSchema } from '../kernel/eventStore.js'
import { initializeUnifiedFeatureSchema } from './featureSchema.js'
import { createUnifiedServer } from './unifiedServer.js'
import { loadNpcProfiles } from '../npcs/loader.js'
import { generateWithProviders } from '../npcs/aiProvider.js'
import type { NpcProfile } from '../npcs/types.js'
import type { NpcAgentRunner } from '../npcs/npcAgentRunner.js'
import { SettingsStore } from '../http/settings.js'
vi.mock('../npcs/aiProvider.js', () => ({ generateWithProviders: vi.fn(), AiUnavailableError: class extends Error {} }))
const generate = vi.mocked(generateWithProviders), directories: string[] = [], applications: ReturnType<typeof createUnifiedServer>[] = []
afterEach(async () => { for (const app of applications.splice(0)) await app.close(); for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); vi.restoreAllMocks(); vi.useRealTimers() })
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'greed-npc-close-')); directories.push(directory); const path = join(directory, 'canonical.sqlite'), db = new Database(path)
  try {
    initializeKernelSchema(db); migrateIdentitySchema(db); initializeUnifiedFeatureSchema(db)
    db.prepare("INSERT INTO accounts(email,password_hash,password_scheme,created_at,role,status) VALUES(NULL,?,'scrypt-v1',0,'admin','active')").run(`scrypt-v1:${'0'.repeat(32)}:${'0'.repeat(64)}`)
    db.prepare('INSERT INTO kv_settings(key,value,updated_at) VALUES(?,?,0)').run('npc_agent_retry_base_ms', '5000')
  } finally { db.close() }
  const app = createUnifiedServer({ host: '127.0.0.1', port: 0, databasePath: path, allowedOrigins: ['http://127.0.0.1:4178'], secureCookies: false, sessionMs: 43_200_000 }); applications.push(app)
  const runner = (app.runtime as unknown as { npcAgentRunner: NpcAgentRunner }).npcAgentRunner
  return { app, runner: runner as unknown as { deliberate: (profile: NpcProfile, tick: number) => Promise<void> }, profile: loadNpcProfiles()[0]! }
}
const reply = { provider: 'opencode' as const, text: JSON.stringify({ action: 'custom_social_scene', target: { tileId: null, npcId: null, cardId: null }, reason: 'synthetic', risk: 'synthetic', expectedOutcome: 'synthetic', utterance: 'synthetic' }) }
describe('normal server close with actual SQLite and cancelled background work', () => {
  it('drains cancellation before closing DB and suppresses an ignored-abort provider completion afterward', async () => {
    const f = fixture(); let respond!: (value: typeof reply) => void; generate.mockImplementationOnce(() => new Promise(resolve => { respond = resolve }))
    const submit = vi.spyOn(f.app.runtime, 'submitLivingWorldCommand'), reads = vi.spyOn(SettingsStore.prototype, 'getSetting')
    const operation = f.runner.deliberate(f.profile, 0), close = f.app.close(); expect(f.app.close()).toBe(close); await close
    expect(f.app.db.open).toBe(false); const readCount = reads.mock.calls.length
    respond(reply); await operation; await Promise.resolve(); expect(submit).not.toHaveBeenCalled(); expect(reads.mock.calls).toHaveLength(readCount)
    await expect(f.app.start()).rejects.toThrow('start once')
    expect((f.app.runtime as unknown as { combatRuntime: { getActiveCombatIds: () => readonly string[] } }).combatRuntime.getActiveCombatIds()).toEqual([])
  })
  it('cancels retry delay on close without a restarted provider or remaining timer', async () => {
    vi.useFakeTimers(); const f = fixture(); generate.mockRejectedValue(new Error('synthetic transient provider failure'))
    const operation = f.runner.deliberate(f.profile, 0); await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(1)
    await f.app.close(); await operation; expect(f.app.db.open).toBe(false); expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(20_000); expect(generate).toHaveBeenCalledOnce(); await f.app.close()
  })
})
