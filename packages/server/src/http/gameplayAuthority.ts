import type { Request, Response } from 'express'
import { accountId } from '../identity/principal.js'
import { PlayerWorldError } from '../playerWorld/types.js'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { HttpAuthorization } from './authorization.js'

/** A read-only fence over the existing canonical position and live admission. */
export class CanonicalGameplayAuthority {
  constructor(private readonly runtime: Pick<SimulationRuntime, 'getPlayerWorldPosition' | 'getPlayerWorldGridPose' | 'getAdmittedPlayerWorldActors' | 'getNpcs' | 'getNpcMortalityProjection'>) {}
  requirePosition(id: number) {
    const actor = accountId(id), position = this.runtime.getPlayerWorldPosition(actor)
    if (!position) throw new PlayerWorldError(409, 'WORLD_ENTRY_REQUIRED', 'Enter the canonical world first.')
    if (!this.runtime.getAdmittedPlayerWorldActors().some(player => player.accountId === actor)) throw new PlayerWorldError(409, 'WORLD_CONNECTION_REQUIRED', 'An admitted live world connection is required.')
    return position
  }
  requireNearbyNpc(id: number, npcId: string) {
    const position = this.requirePosition(id), npc = this.runtime.getNpcs().find(row => row.id === npcId)
    if (!npc) throw new PlayerWorldError(404, 'NPC_NOT_FOUND', 'NPC was not found.')
    if (npc.deceased || this.runtime.getNpcMortalityProjection().isDeceased(npcId)) throw new PlayerWorldError(410, 'NPC_DECEASED', 'NPC is deceased.')
    if (npc.location !== position.tileId) throw new PlayerWorldError(409, 'NPC_NOT_LOCAL', 'NPC is not in the canonical player region.')
    if (npc.activity === 'move' || npc.travelRoute !== null) throw new PlayerWorldError(409, 'NPC_IN_TRANSIT', 'NPC is currently in transit.')
    if (position.interior) {
      if (npc.buildingId !== position.interior.buildingId) throw new PlayerWorldError(409, 'NPC_NOT_IN_ADMITTED_BUILDING', 'NPC is not in the admitted catalog building.')
      // BuildingSvg exposes all actual occupants; catalog has no authored floor/player pose.
      return npc
    }
    if (npc.buildingId !== null) throw new PlayerWorldError(409, 'NPC_INSIDE_BUILDING', 'Explicit canonical building entry is required.')
    const pose = this.runtime.getPlayerWorldGridPose(accountId(id))
    if (!pose) throw new PlayerWorldError(409, 'GEOMETRY_UNAVAILABLE', 'Canonical exterior grid pose is unavailable.')
    if (![npc.subCol, npc.subRow, npc.subZ].every(Number.isFinite) || npc.subZ !== pose.subZ
      || Math.max(Math.abs(npc.subCol - pose.subCol), Math.abs(npc.subRow - pose.subRow)) > 2) throw new PlayerWorldError(409, 'NPC_OUT_OF_RANGE', 'Walk within two authored grid cells first.')
    return npc
  }
  localNpcs(id: number) {
    this.requirePosition(id)
    return this.runtime.getNpcs().filter(npc => {
      try { this.requireNearbyNpc(id, npc.id); return true } catch (error) { if (error instanceof PlayerWorldError && ['NPC_NOT_LOCAL', 'NPC_IN_TRANSIT', 'NPC_INSIDE_BUILDING', 'NPC_OUT_OF_RANGE', 'NPC_DECEASED', 'NPC_NOT_IN_ADMITTED_BUILDING'].includes(error.code)) return false; throw error }
    })
  }
}

export function sendGameplayError(res: Response, error: unknown): void {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'INTERNAL_ERROR'
  const status = error instanceof PlayerWorldError ? error.status : ({ UNAUTHORIZED: 401, FORBIDDEN: 403, ORIGIN_NOT_ALLOWED: 403, ACCOUNT_CHANGED: 409, ACCOUNT_CONTEXT_REQUIRED: 400, INSUFFICIENT_GOLD: 402 } as Record<string, number>)[code] ?? 500
  if (!res.headersSent && !res.destroyed && !res.writableEnded) res.status(status).json({ error: code })
}

/** Re-resolve the exact cookie and expected actor immediately before side effects/cost. */
export function reauthorizeGameplayMutation(auth: HttpAuthorization, req: Request, res: Response, capturedId: number): boolean {
  if (res.destroyed || res.writableEnded || req.aborted) return false
  try {
    const current = auth.reauthorizeMutation(req)
    if (current.sub !== capturedId) throw new PlayerWorldError(409, 'ACCOUNT_CHANGED', 'Canonical cookie account changed.')
    return true
  } catch (error) { sendGameplayError(res, error); return false }
}
