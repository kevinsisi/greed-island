export function createSingleFlight<T>() {
  let inFlight: Promise<T> | null = null

  return {
    run(task: () => Promise<T>): Promise<T> {
      if (inFlight) return inFlight
      inFlight = task().finally(() => {
        inFlight = null
      })
      return inFlight
    }
  }
}
