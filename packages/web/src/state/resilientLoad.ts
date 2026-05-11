export const MOBILE_LOAD_TIMEOUT_MS = 8_000
export const MOBILE_LOAD_RETRIES = 2
export const MOBILE_LOAD_RETRY_BACKOFF_MS = 700

export async function resilientLoad<T>(load: () => Promise<T>): Promise<T> {
  let lastError: unknown = null
  for (let attempt = 0; attempt <= MOBILE_LOAD_RETRIES; attempt += 1) {
    try {
      return await withTimeout(load(), MOBILE_LOAD_TIMEOUT_MS)
    } catch (err) {
      lastError = err
      if (attempt < MOBILE_LOAD_RETRIES) {
        await sleep(MOBILE_LOAD_RETRY_BACKOFF_MS * (attempt + 1))
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error(`World state request timed out after ${timeoutMs}ms`)),
      timeoutMs
    )
    promise.then(
      (value) => {
        globalThis.clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        globalThis.clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}
