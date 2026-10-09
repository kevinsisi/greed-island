import type { ServerAdminWorldSnapshot } from '../api/adminWorld'
export type AdminWorldOwner = Readonly<{ epoch: number; accountId: number; role: 'gm' | 'admin' }>
export type AdminWorldRead = { status: 'loading' | 'unavailable'; response: null } | { status: 'ready'; response: ServerAdminWorldSnapshot }
export const loadingAdminWorld = (): AdminWorldRead => ({ status: 'loading', response: null })
/** Bounded, single-flight read tied to actor, current role and captured session epoch. */
export function createAdminWorldReader(options: {
  owner: AdminWorldOwner; isCurrent: (owner: AdminWorldOwner) => boolean
  load: (accountId: number, signal: AbortSignal) => Promise<ServerAdminWorldSnapshot>
  onChange: (read: AdminWorldRead) => void; onForbidden?: () => void; timeoutMs?: number
}) {
  let disposed = false, requestEpoch = 0
  let pending: Promise<void> | null = null, controller: AbortController | null = null
  const current = () => !disposed && options.isCurrent(options.owner)
  function refresh(): Promise<void> {
    if (!current()) return Promise.resolve()
    if (pending) return pending
    const ownRequest = ++requestEpoch, abort = new AbortController(); controller = abort
    options.onChange(loadingAdminWorld())
    const operation = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        const response = await Promise.race([options.load(options.owner.accountId, abort.signal), new Promise<never>((_, reject) => {
          timeout = setTimeout(() => { abort.abort(); reject(new Error('Operator read timed out.')) }, options.timeoutMs ?? 6000)
        })])
        if (current() && requestEpoch === ownRequest) options.onChange({ status: 'ready', response })
      } catch (error) {
        if (current() && requestEpoch === ownRequest) {
          options.onChange({ status: 'unavailable', response: null })
          if (error && typeof error === 'object' && 'status' in error && error.status === 403) options.onForbidden?.()
        }
      } finally { if (timeout !== undefined) clearTimeout(timeout); if (controller === abort) controller = null }
    })()
    pending = operation
    void operation.finally(() => { if (pending === operation) pending = null })
    return operation
  }
  return { refresh, dispose() { disposed = true; requestEpoch += 1; controller?.abort(); controller = null } }
}
