import { describe, expect, it } from 'vitest'
import { createNewGame, loadDemo, reduceDemo, saveDemo } from './model'
import { createSaveSession } from './saveSession'
import { SAVE_KEY, type DemoState } from './types'

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem(key: string) { return values.get(key) ?? null },
    setItem(key: string, value: string) { values.set(key, value) },
  }
}

describe('prototype save session', () => {
  it('saves successive progress and a new run from the same session', () => {
    const storage = memoryStorage()
    storage.values.set('unrelated-account', 'untouched')
    const session = createSaveSession(storage)
    const initial = createNewGame()
    expect(session.save(initial)).toBe('saved')
    const moved = reduceDemo(initial, { type: 'move', position: { x: 1, z: -21 } })
    expect(session.save(moved)).toBe('saved')
    expect(loadDemo(storage)).toEqual(moved)
    const nextRun = createNewGame()
    expect(session.save(nextRun)).toBe('saved')
    expect(loadDemo(storage)).toEqual(nextRun)
    expect(session.hasConflict()).toBe(false)
    expect(session.checkExternalChange()).toBe(false)
    expect(storage.values.get('unrelated-account')).toBe('untouched')
  })

  it('blocks another tab changing progress in the same run, even if the old raw later returns', () => {
    const storage = memoryStorage()
    const initial = createNewGame()
    saveDemo(storage, initial)
    const originalRaw = storage.getItem(SAVE_KEY)!
    const firstTab = createSaveSession(storage)
    const staleTab = createSaveSession(storage)
    const moved = reduceDemo(initial, { type: 'move', position: { x: 1, z: -21 } })
    expect(firstTab.save(moved)).toBe('saved')
    const latestRaw = storage.getItem(SAVE_KEY)
    expect(staleTab.save(initial)).toBe('conflict')
    expect(staleTab.hasConflict()).toBe(true)
    expect(storage.getItem(SAVE_KEY)).toBe(latestRaw)

    storage.setItem(SAVE_KEY, originalRaw)
    expect(staleTab.checkExternalChange()).toBe(true)
    expect(staleTab.save(moved)).toBe('conflict')
    expect(storage.getItem(SAVE_KEY)).toBe(originalRaw)
  })

  it('detects an external new run before a save and permanently disables writes', () => {
    const storage = memoryStorage()
    const initial = createNewGame()
    saveDemo(storage, initial)
    const staleTab = createSaveSession(storage)
    const nextRun = createNewGame()
    saveDemo(storage, nextRun)
    const externalRaw = storage.getItem(SAVE_KEY)
    expect(staleTab.checkExternalChange()).toBe(true)
    expect(staleTab.hasConflict()).toBe(true)
    expect(staleTab.save(initial)).toBe('conflict')
    expect(storage.getItem(SAVE_KEY)).toBe(externalRaw)
  })

  it('blocks writes after another tab deletes the existing save', () => {
    const storage = memoryStorage()
    const initial = createNewGame()
    saveDemo(storage, initial)
    const staleTab = createSaveSession(storage)
    storage.values.delete(SAVE_KEY)
    expect(staleTab.checkExternalChange()).toBe(true)
    expect(staleTab.save(initial)).toBe('conflict')
    expect(storage.getItem(SAVE_KEY)).toBeNull()
  })

  it('detects a save created by another tab after starting without a save', () => {
    const storage = memoryStorage()
    const staleTab = createSaveSession(storage)
    saveDemo(storage, createNewGame())
    const externalRaw = storage.getItem(SAVE_KEY)
    expect(staleTab.save(createNewGame())).toBe('conflict')
    expect(storage.getItem(SAVE_KEY)).toBe(externalRaw)
  })

  it('ignores external changes to unrelated storage keys', () => {
    const storage = memoryStorage()
    const session = createSaveSession(storage)
    storage.setItem('unrelated-account', 'changed elsewhere')
    expect(session.checkExternalChange()).toBe(false)
    expect(session.save(createNewGame())).toBe('saved')
    expect(storage.getItem('unrelated-account')).toBe('changed elsewhere')
  })

  it('remains unavailable if the initial storage snapshot could not be read', () => {
    const storage = memoryStorage()
    saveDemo(storage, createNewGame())
    const originalRaw = storage.getItem(SAVE_KEY)
    let readsFail = true
    const session = createSaveSession({
      getItem(key) { if (readsFail) throw new Error('storage denied'); return storage.getItem(key) },
      setItem: storage.setItem,
    })
    expect(session.save(createNewGame())).toBe('unavailable')
    expect(session.checkExternalChange()).toBe(false)
    expect(session.hasConflict()).toBe(false)
    readsFail = false
    expect(session.save(createNewGame())).toBe('unavailable')
    expect(storage.getItem(SAVE_KEY)).toBe(originalRaw)
  })

  it('does not write when a later read throws and can retry an unchanged snapshot', () => {
    const storage = memoryStorage()
    const initial = createNewGame()
    saveDemo(storage, initial)
    const originalRaw = storage.getItem(SAVE_KEY)
    let readsFail = false
    const session = createSaveSession({
      getItem(key) { if (readsFail) throw new Error('storage denied'); return storage.getItem(key) },
      setItem: storage.setItem,
    })
    readsFail = true
    expect(session.save(createNewGame())).toBe('unavailable')
    expect(session.checkExternalChange()).toBe(false)
    expect(session.hasConflict()).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(originalRaw)
    readsFail = false
    expect(session.save(initial)).toBe('saved')
  })

  it('keeps the baseline after a failed write and can retry without erasing the save', () => {
    const storage = memoryStorage()
    const initial = createNewGame()
    saveDemo(storage, initial)
    const originalRaw = storage.getItem(SAVE_KEY)
    let writesFail = true
    const session = createSaveSession({
      getItem: storage.getItem,
      setItem(key, value) { if (writesFail) throw new Error('quota exceeded'); storage.setItem(key, value) },
    })
    const nextRun = createNewGame()
    expect(session.save(nextRun)).toBe('unavailable')
    expect(session.hasConflict()).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(originalRaw)
    writesFail = false
    expect(session.save(nextRun)).toBe('saved')
    expect(loadDemo(storage)).toEqual(nextRun)
  })

  it('preserves the existing raw when the model rejects an invalid state', () => {
    const storage = memoryStorage()
    const initial = createNewGame()
    saveDemo(storage, initial)
    const originalRaw = storage.getItem(SAVE_KEY)
    const session = createSaveSession(storage)
    const invalid = { ...initial, version: -1 } as unknown as DemoState
    expect(session.save(invalid)).toBe('unavailable')
    expect(session.checkExternalChange()).toBe(false)
    expect(storage.getItem(SAVE_KEY)).toBe(originalRaw)
    expect(session.save(initial)).toBe('saved')
  })

  it('tracks the normalized raw written by the model, not the input object', () => {
    const storage = memoryStorage()
    const session = createSaveSession(storage)
    const state = { ...createNewGame(), transientView: 'not stored' }
    expect(session.save(state)).toBe('saved')
    expect(storage.getItem(SAVE_KEY)).not.toContain('transientView')
    expect(session.save(state)).toBe('saved')
    expect(session.checkExternalChange()).toBe(false)
  })

  it('does not adopt another tab overwriting immediately after its own successful write', () => {
    const storage = memoryStorage()
    const session = createSaveSession({
      getItem: storage.getItem,
      setItem(key, value) {
        storage.setItem(key, value)
        storage.setItem(key, 'external replacement')
      },
    })
    expect(session.save(createNewGame())).toBe('saved')
    expect(session.checkExternalChange()).toBe(true)
    expect(session.save(createNewGame())).toBe('conflict')
    expect(storage.getItem(SAVE_KEY)).toBe('external replacement')
  })
})
