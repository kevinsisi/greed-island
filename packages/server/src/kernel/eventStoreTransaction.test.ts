import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { SqliteEventStore } from './eventStore.js'

describe('SqliteEventStore.runInTransaction', () => {
  it('commits batched projection writes together', () => {
    const db = new Database(':memory:')
    try {
      const store = new SqliteEventStore(db)
      db.exec('CREATE TABLE projection_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')

      store.runInTransaction(() => {
        db.prepare('INSERT INTO projection_probe (value) VALUES (?)').run('a')
        db.prepare('INSERT INTO projection_probe (value) VALUES (?)').run('b')
      })

      const rows = db.prepare('SELECT value FROM projection_probe ORDER BY id').all() as Array<{ value: string }>
      expect(rows.map((row) => row.value)).toEqual(['a', 'b'])
    } finally {
      db.close()
    }
  })

  it('rolls back all projection writes if the batch fails', () => {
    const db = new Database(':memory:')
    try {
      const store = new SqliteEventStore(db)
      db.exec('CREATE TABLE projection_probe (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')

      expect(() => store.runInTransaction(() => {
        db.prepare('INSERT INTO projection_probe (value) VALUES (?)').run('a')
        throw new Error('projection failed')
      })).toThrow('projection failed')

      const rows = db.prepare('SELECT value FROM projection_probe').all()
      expect(rows).toEqual([])
    } finally {
      db.close()
    }
  })
})
