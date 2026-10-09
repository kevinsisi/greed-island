export function validatePlayerWorldEventData(payload: unknown, allowInterior = false): string | null {
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
  if (p.interior !== undefined && !allowInterior) return 'interior is not allowed on exterior events'
  if (p.fromBuildingId !== undefined && (typeof p.fromBuildingId !== 'string' || !p.fromBuildingId)) return 'fromBuildingId invalid'
  return null
}

export function validatePlayerBuildingEnteredData(payload: unknown): string | null {
  const error = validatePlayerWorldEventData(payload, true)
  if (error) return error
  const p = payload as Record<string, unknown>, interior = p.interior as Record<string, unknown> | null
  if (!interior || typeof interior !== 'object' || Array.isArray(interior)
    || Object.keys(interior).length !== 2 || typeof interior.buildingId !== 'string' || !interior.buildingId) return 'catalog building identity required'
  const pose = interior.returnPose as Record<string, unknown> | null
  if (!pose || typeof pose !== 'object' || Array.isArray(pose) || Object.keys(pose).length !== 2
    || !Number.isFinite(pose.x) || !Number.isFinite(pose.z) || pose.x !== p.x || pose.z !== p.z) return 'unchanged exterior return pose required'
  if (p.fromBuildingId !== undefined) return 'entry may not supply previous building'
  return null
}
export function validatePlayerBuildingExitedData(payload: unknown): string | null {
  const error = validatePlayerWorldEventData(payload)
  if (error) return error
  return typeof (payload as Record<string, unknown>).fromBuildingId === 'string'
    ? null : 'previous building identity required'
}
