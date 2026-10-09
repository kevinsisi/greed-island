/** Ephemeral lifecycle cancellation. No signal/session material belongs in persisted commands. */
export class ProviderCancelled extends Error {
  constructor() { super('AI operation cancelled.'); this.name = 'AbortError' }
}
export function throwIfProviderCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ProviderCancelled()
}
/** Also fences providers/mocks that ignore AbortSignal. Late results are observed but never continued. */
export function withAbortSignal<T>(operation: PromiseLike<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return Promise.resolve(operation)
  return new Promise<T>((resolve, reject) => {
    let settled = false
    const finish = (complete: () => void) => { if (settled) return; settled = true; signal.removeEventListener('abort', cancel); complete() }
    const cancel = () => finish(() => reject(new ProviderCancelled()))
    signal.addEventListener('abort', cancel, { once: true })
    Promise.resolve(operation).then(value => finish(() => resolve(value)), error => finish(() => reject(error)))
    if (signal.aborted) cancel()
  })
}
export function cancellableDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new ProviderCancelled())
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); reject(new ProviderCancelled()) }
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, ms)
    signal?.addEventListener('abort', cancel, { once: true })
    if (signal?.aborted) cancel()
  })
}
export function providerDeadline(ms: number, external?: AbortSignal) {
  throwIfProviderCancelled(external)
  const controller = new AbortController()
  const cancel = () => { clearTimeout(timer); external?.removeEventListener('abort', cancel); controller.abort() }
  const timer = setTimeout(cancel, Math.max(1, ms))
  external?.addEventListener('abort', cancel, { once: true })
  if (external?.aborted) cancel()
  return { signal: controller.signal, close: () => { clearTimeout(timer); external?.removeEventListener('abort', cancel) } }
}
export async function boundedSettlement(operations: readonly Promise<unknown>[], timeoutMs = 1000): Promise<boolean> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0 || timeoutMs > 30_000) throw new Error('Invalid background settlement deadline.')
  if (!operations.length) return true
  let timer: ReturnType<typeof setTimeout> | undefined
  try { return await Promise.race([Promise.allSettled(operations).then(() => true), new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), timeoutMs) })]) }
  finally { if (timer) clearTimeout(timer) }
}
