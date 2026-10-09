import { closeSync, existsSync, lstatSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'

/** A crashed fixture process may leave a lock; never remove a live process's lock. */
export function acquireFixtureLock(path: string): () => void {
  if (existsSync(path)) {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Invalid local fixture lock.')
    const original = readFileSync(path, 'utf8')
    const pid = Number(original)
    if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error('Invalid fixture PID lock; inspect the temporary fixture directory.')
    try {
      process.kill(pid, 0)
      throw new Error(`Fixture is already owned by live process ${pid}.`)
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH')) throw error
    }
    // Check again before removing the dead owner, so a concurrently replaced lock is preserved.
    if (lstatSync(path).ino !== stat.ino || readFileSync(path, 'utf8') !== original) throw new Error('Fixture lock changed; retry after the other launch finishes.')
    unlinkSync(path)
  }
  const fd = openSync(path, 'wx', 0o600)
  writeFileSync(fd, String(process.pid))
  closeSync(fd)
  const inode = lstatSync(path).ino
  return () => { if (existsSync(path) && lstatSync(path).ino === inode && readFileSync(path, 'utf8') === String(process.pid)) unlinkSync(path) }
}
