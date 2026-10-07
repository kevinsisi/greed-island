import { spawnSync } from 'node:child_process'
import {
  existsSync, lstatSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { acquireFixtureLock } from './fixtureLock.js'

let directory: string
let lockPath: string

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'greed-multiplayer-lock-test-'))
  lockPath = join(directory, 'running.lock')
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('disposable fixture process ownership', () => {
  it('acquires a private PID lock and releases only its own lock, idempotently', () => {
    const release = acquireFixtureLock(lockPath)
    expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid))
    expect(lstatSync(lockPath).mode & 0o777).toBe(0o600)
    release()
    expect(existsSync(lockPath)).toBe(false)
    expect(() => release()).not.toThrow()
  })

  it('refuses to take or remove a live process lock', () => {
    const release = acquireFixtureLock(lockPath)
    const inode = lstatSync(lockPath).ino
    expect(() => acquireFixtureLock(lockPath)).toThrow('already owned by live process')
    expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid))
    expect(lstatSync(lockPath).ino).toBe(inode)
    release()
  })

  it('recovers a stale lock only after its isolated child process has exited', () => {
    // Start and join only this test's child. No existing service is signaled or terminated.
    const child = spawnSync(process.execPath, ['-e', ''], { stdio: 'ignore' })
    expect(child.error).toBeUndefined()
    expect(child.status).toBe(0)
    expect(child.pid).toBeGreaterThan(0)
    expect(() => process.kill(child.pid, 0)).toThrowError(expect.objectContaining({ code: 'ESRCH' }))
    writeFileSync(lockPath, String(child.pid), { mode: 0o600 })
    const release = acquireFixtureLock(lockPath)
    expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid))
    release()
    expect(existsSync(lockPath)).toBe(false)
  })

  it('rejects symlinks without reading, replacing or deleting the target', () => {
    const target = join(directory, 'other-file')
    writeFileSync(target, 'leave this file alone', { mode: 0o600 })
    symlinkSync(target, lockPath)
    expect(() => acquireFixtureLock(lockPath)).toThrow('Invalid local fixture lock')
    expect(lstatSync(lockPath).isSymbolicLink()).toBe(true)
    expect(readFileSync(target, 'utf8')).toBe('leave this file alone')
  })

  it('rejects a dangling symlink without following or replacing it', () => {
    const target = join(directory, 'does-not-exist')
    symlinkSync(target, lockPath)
    expect(() => acquireFixtureLock(lockPath)).toThrow()
    expect(lstatSync(lockPath).isSymbolicLink()).toBe(true)
    expect(existsSync(target)).toBe(false)
  })

  it.each(['', 'not-a-pid', '0', '-1', '1.5', '9007199254740992'])(
    'preserves malformed lock contents %j for inspection', (content) => {
      writeFileSync(lockPath, content, { mode: 0o600 })
      expect(() => acquireFixtureLock(lockPath)).toThrow('Invalid fixture PID lock')
      expect(readFileSync(lockPath, 'utf8')).toBe(content)
    },
  )

  it('does not release a replacement inode even if it contains the same PID', () => {
    const release = acquireFixtureLock(lockPath)
    renameSync(lockPath, join(directory, 'original.lock'))
    writeFileSync(lockPath, String(process.pid), { mode: 0o600 })
    const replacementInode = lstatSync(lockPath).ino
    release()
    expect(lstatSync(lockPath).ino).toBe(replacementInode)
    expect(readFileSync(lockPath, 'utf8')).toBe(String(process.pid))
  })
})
