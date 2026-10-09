/** Explicit null/absent perception cannot be replaced with the private raw deadline. */
export function cardPerceivedSeconds(perceived: number | null | undefined, elapsedSeconds: number): number | null {
  if (typeof perceived !== 'number' || !Number.isFinite(perceived) || perceived < 0
    || !Number.isFinite(elapsedSeconds)) return null
  return Math.max(0, Math.floor(perceived - Math.max(0, elapsedSeconds)))
}
