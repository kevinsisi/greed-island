import { saveDemo } from './model'
import { SAVE_KEY, type DemoState } from './types'

export type SaveSessionResult = 'saved' | 'unavailable' | 'conflict'

export interface SaveSession {
  save(state: DemoState): SaveSessionResult
  hasConflict(): boolean
  /** False also covers unavailable storage; only an observed change is a conflict. */
  checkExternalChange(): boolean
}

/**
 * Detects changes made outside this session and permanently stops its writes.
 * localStorage has no compare-and-swap: a concurrent write between our read and
 * write can still race. This detects external changes, not transaction isolation.
 */
export function createSaveSession(storage: Pick<Storage, 'getItem' | 'setItem'>): SaveSession {
  let lastKnownRaw: string | null = null
  let initialized = false
  let conflict = false
  try {
    lastKnownRaw = storage.getItem(SAVE_KEY)
    initialized = true
  } catch {
    // Without an initial snapshot, this session cannot safely overwrite a save.
  }

  function inspect(): 'unchanged' | 'unavailable' | 'conflict' {
    if (conflict) return 'conflict'
    if (!initialized) return 'unavailable'
    try {
      if (storage.getItem(SAVE_KEY) !== lastKnownRaw) {
        conflict = true
        return 'conflict'
      }
      return 'unchanged'
    } catch {
      return 'unavailable'
    }
  }

  return {
    save(state) {
      const status = inspect()
      if (status !== 'unchanged') return status
      let writtenRaw: string | undefined
      const saved = saveDemo({
        setItem(key, value) {
          storage.setItem(key, value)
          writtenRaw = value
        },
      }, state)
      if (!saved || writtenRaw === undefined) return 'unavailable'
      // Record exactly our write; a subsequent read might already contain
      // another tab's update, which must remain detectable as a conflict.
      lastKnownRaw = writtenRaw
      return 'saved'
    },
    hasConflict: () => conflict,
    checkExternalChange: () => inspect() === 'conflict',
  }
}
