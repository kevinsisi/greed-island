export function validatePlayerWorldEventData(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return 'payload must be object'
  const p = payload as Record<string, unknown>
  if (!Number.isSafeInteger(p.accountId) || (p.accountId as number) <= 0) return 'positive numeric accountId required'
  if (typeof p.tileId !== 'string' || !p.tileId) return 'tileId required'
  if (typeof p.x !== 'number' || !Number.isFinite(p.x) || typeof p.z !== 'number' || !Number.isFinite(p.z)) return 'finite position required'
  if (!Number.isSafeInteger(p.movementStep) || (p.movementStep as number) < -1) return 'movementStep required'
  if (typeof p.clientCommandId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(p.clientCommandId)) return 'clientCommandId required'
  if (typeof p.intentDigest !== 'string' || !/^[a-f0-9]{64}$/.test(p.intentDigest)) return 'intentDigest required'
  if (p.fromTileId !== undefined && (typeof p.fromTileId !== 'string' || !p.fromTileId)) return 'fromTileId invalid'
  if (p.crossingType !== undefined && p.crossingType !== 'land' && p.crossingType !== 'water-crossing') return 'crossingType invalid'
  return null
}
