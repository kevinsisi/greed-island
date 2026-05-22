// Buildings HTTP API — Living World v0.10.0.
//
// 路由：
//   GET  /api/buildings?tileId=xxx     列出某 tile 上所有建築 + 室內 NPC
//   GET  /api/buildings/:id            建築物 detail (含 occupants + hiring)
//   POST /api/buildings/:id/apply      應徵某 shift（auth）
//   POST /api/buildings/:id/quit       辭職（auth）
//   POST /api/buildings/:id/work       玩家在建築物內打卡領薪（auth, 同 shift 24hr cooldown）
//   POST /api/buildings/:id/rest       residential 建築 → 補體力（auth, cooldown）
//   GET  /api/wallet                   玩家的金幣 + 體力
//   GET  /api/areas/:tileId            單一 tile 的 AreaState + ambient 文字
//   GET  /api/areas                    全部 tile 的 AreaState

import { Router, type Request, type Response } from 'express'
import type { SimulationRuntime } from '../sim/runtime.js'
import type { PlayerJobsStore } from '../buildings/playerJobsStore.js'
import { shiftFor, DAILY_SHIFT_COOLDOWN_TICKS } from '../buildings/playerJobsStore.js'
import type { BuildingDef, BuildingRuntimeView, Shift } from '../buildings/types.js'
import { REST_RESTORATION } from '../buildings/types.js'
import { listAllBuildings } from '../buildings/catalog.js'
import { requireAuth, type AuthConfig } from './auth.js'
import type { ConstructionProjectRow } from '../projections/constructionProjects.js'

const VALID_SHIFTS: readonly Shift[] = ['morning', 'afternoon', 'night']
const REST_COOLDOWN_TICKS = 60 // 5 分鐘冷卻（避免短時間反覆按）

export function createBuildingsRouter(input: {
  runtime: SimulationRuntime
  jobs: PlayerJobsStore
  authConfig: AuthConfig
}): Router {
  const router = Router()
  const auth = requireAuth(input.authConfig)
  const findVisibleBuilding = (id: string) => {
    return input.runtime.getAllBuildings().find((v) => v.def.id === id) ??
      constructionSiteView(input.runtime.getInProgressConstructionProjects().find((p) => p.buildingId === id))
  }

  router.get('/buildings', (req: Request, res: Response) => {
    const tileId = typeof req.query.tileId === 'string' ? req.query.tileId : null
    const views = tileId
      ? input.runtime.getBuildingsOnTile(tileId)
      : input.runtime.getAllBuildings()
    const inProgress = input.runtime.getInProgressConstructionProjects(tileId ?? undefined)
    const constructionSites = inProgress
      .map((project) => constructionSiteView(project))
      .filter((view): view is BuildingRuntimeView => view !== null)

    // v0.49.0 — inject building state/health/constructionProgress
    let buildingStates: Map<string, { state: string; health: number }> | null = null
    if (tileId) {
      buildingStates = new Map(
        input.runtime.getBuildingStatesByTile(tileId).map((s) => [s.buildingId, { state: s.state, health: s.health }])
      )
    }

    const buildingsWithState = buildingStates
      ? [...views, ...constructionSites].map((view) => {
          const bState = buildingStates!.get(view.def.id)
          return {
            ...view,
            def: {
              ...view.def,
              state: bState?.state ?? 'operational',
              health: bState?.health ?? 100,
              constructionProgress: undefined  // TODO: wire from construction project when tracked
            }
          }
        })
      : [...views, ...constructionSites]

    res.json({ buildings: buildingsWithState.map((v) => enrichBuildingView(v, input.runtime)), inProgress })
  })

  router.get('/buildings/:id', (req: Request, res: Response) => {
    const view = findVisibleBuilding(req.params.id ?? '')
    if (!view) {
      res.status(404).json({ error: 'BUILDING_NOT_FOUND' })
      return
    }
    res.json({ building: enrichBuildingView(view, input.runtime) })
  })

  router.post('/buildings/:id/apply', auth, (req: Request, res: Response) => {
    const view = findVisibleBuilding(req.params.id ?? '')
    if (!view) {
      res.status(404).json({ error: 'BUILDING_NOT_FOUND' })
      return
    }
    const def = view.def
    const accountId = req.auth!.sub
    const body = (req.body ?? {}) as { shift?: unknown }
    const shift = body.shift
    if (typeof shift !== 'string' || !VALID_SHIFTS.includes(shift as Shift)) {
      res.status(400).json({ error: 'INVALID_SHIFT' })
      return
    }
    const slot = def.hiring.find((h) => h.shift === shift)
    if (!slot) {
      res.status(400).json({ error: 'NO_SLOT_FOR_SHIFT' })
      return
    }
    const existingJob = input.jobs.listJobs(accountId)[0]
    if (existingJob) {
      res.status(409).json({
        error: 'ALREADY_HIRED',
        message: '你已經有工作了，請先辭職再應徵新的工作。',
        job: existingJob,
      })
      return
    }
    const employees = input.jobs.listEmployeesOf(def.id, shift as Shift)
    if (employees.length >= slot.capacity && !employees.some((e) => e.accountId === accountId)) {
      res.status(409).json({ error: 'SLOT_FULL' })
      return
    }
    const job = input.jobs.apply({
      accountId,
      buildingId: def.id,
      shift: shift as Shift,
      tick: input.runtime.getCurrentTick()
    })
    res.json({ job, building: def })
  })

  router.post('/buildings/:id/quit', auth, (req: Request, res: Response) => {
    const view = findVisibleBuilding(req.params.id ?? '')
    if (!view) {
      res.status(404).json({ error: 'BUILDING_NOT_FOUND' })
      return
    }
    const def = view.def
    const accountId = req.auth!.sub
    const body = (req.body ?? {}) as { shift?: unknown }
    const shift = body.shift
    if (typeof shift !== 'string' || !VALID_SHIFTS.includes(shift as Shift)) {
      res.status(400).json({ error: 'INVALID_SHIFT' })
      return
    }
    const removed = input.jobs.quit(accountId, def.id, shift as Shift)
    res.json({ removed })
  })

  router.post('/buildings/:id/work', auth, (req: Request, res: Response) => {
    const view = findVisibleBuilding(req.params.id ?? '')
    if (!view) {
      res.status(404).json({ error: 'BUILDING_NOT_FOUND' })
      return
    }
    const def = view.def
    const accountId = req.auth!.sub
    const currentTick = input.runtime.getCurrentTick()
    const currentShift = shiftFor(currentTick)
    if (!currentShift) {
      res.status(400).json({ error: 'NO_ACTIVE_SHIFT', message: '現在不是可打卡的班別時間。' })
      return
    }
    const slot = def.hiring.find((h) => h.shift === currentShift)
    if (!slot) {
      res.status(400).json({ error: 'NO_SLOT_THIS_SHIFT', message: '這裡目前沒有正在上班的班別。' })
      return
    }
    const job = input.jobs.getJob(accountId, def.id, currentShift)
    if (!job) {
      res.status(403).json({ error: 'NOT_HIRED', message: '你沒有這個時段的工作，不能打卡。' })
      return
    }
    if (currentTick - job.lastShiftTick < DAILY_SHIFT_COOLDOWN_TICKS) {
      res.status(429).json({
        error: 'SHIFT_COOLDOWN',
        message: '這個班別今天已經打過卡了，請等下一輪班表。',
        nextAvailableAtTick: job.lastShiftTick + DAILY_SHIFT_COOLDOWN_TICKS
      })
      return
    }
    const updated = input.jobs.recordShiftCompletion({
      accountId,
      buildingId: def.id,
      shift: currentShift,
      tick: currentTick,
      wage: slot.wage
    })
    const wallet = input.jobs.addGold(accountId, slot.wage)
    // 工作會消耗體力，不同 type 不同（factory 比咖啡廳累）
    const energyCost =
      def.type === 'factory' ? -8 : def.type === 'restaurant' || def.type === 'shop' ? -4 : -5
    const walletAfterEnergy = input.jobs.addEnergy(accountId, energyCost)
    res.json({ job: updated, wallet: walletAfterEnergy, wage: slot.wage })
  })

  router.post('/buildings/:id/rest', auth, (req: Request, res: Response) => {
    const view = findVisibleBuilding(req.params.id ?? '')
    if (!view) {
      res.status(404).json({ error: 'BUILDING_NOT_FOUND' })
      return
    }
    const def = view.def
    if (!def.restorative) {
      res.status(400).json({ error: 'NOT_RESTORATIVE' })
      return
    }
    const accountId = req.auth!.sub
    const tick = input.runtime.getCurrentTick()
    const wallet = input.jobs.getWallet(accountId)
    // 簡單 cooldown：用 wallet.updatedAt 換算成 tick 不準確，直接用 wallet.energy
    // 還沒滿 → 才能 rest
    if (wallet.energy >= 100) {
      res.status(429).json({ error: 'ALREADY_FULL_ENERGY' })
      return
    }
    const updated = input.jobs.addEnergy(accountId, REST_RESTORATION)
    res.json({ wallet: updated, restoredAt: tick, building: def })
  })

  router.get('/wallet', auth, (req: Request, res: Response) => {
    const currentTick = input.runtime.getCurrentTick()
    const wallet = input.jobs.getWallet(req.auth!.sub)
    const jobs = input.jobs.listJobs(req.auth!.sub)
    res.json({ wallet, jobs, currentTick, currentShift: shiftFor(currentTick) })
  })

  router.get('/areas/:tileId', (req: Request, res: Response) => {
    const tileId = req.params.tileId ?? ''
    const state = input.runtime.getAreaState(tileId)
    if (!state) {
      res.status(404).json({ error: 'TILE_NOT_FOUND' })
      return
    }
    const ambient = input.runtime.getAmbientNarrator()
    let ambientResult = null
    if (ambient) {
      const ctx = input.runtime.buildAmbientContext(tileId)
      if (ctx) {
        ambientResult = ambient.getOrSchedule(ctx, input.runtime.getCurrentTick())
      }
    }
    res.json({ areaState: state, ambient: ambientResult })
  })

  router.get('/areas', (_req: Request, res: Response) => {
    res.json({ areas: input.runtime.getAreaStates() })
  })

  router.get('/buildings-catalog', (_req: Request, res: Response) => {
    res.json({ buildings: listAllBuildings() })
  })

  return router
}

function constructionSiteView(project: ConstructionProjectRow | undefined): BuildingRuntimeView | null {
  if (!project) return null
  return { def: constructionSiteDef(project), occupants: [] }
}

function constructionSiteDef(project: ConstructionProjectRow): BuildingDef {
  const seed = hashString(project.projectId)
  return {
    id: project.buildingId,
    tileId: project.targetTileId,
    nameZh: `自主工地 ${project.progress}/${project.targetProgress}`,
    nameEn: `Autonomous Site ${project.progress}/${project.targetProgress}`,
    descriptionZh: `這是由 ${project.initiatedByNpcId} 發起的 NPC 自主建案。進度 ${project.progress}/${project.targetProgress}。`,
    type: 'construction',
    placement: {
      col: 2 + (seed % 11),
      row: 2 + ((seed >>> 4) % 6),
      glyph: '🚧',
      size: 26
    },
    interior: {
      cols: 9,
      rows: 7,
      backgroundColor: 0x241a10,
      props: [
        { col: 2, row: 2, glyph: '🧱', size: 24, label: '材料' },
        { col: 5, row: 3, glyph: '🪵', size: 24, label: '木料' },
        { col: 6, row: 5, glyph: '🔨', size: 22, label: '工具' }
      ]
    },
    ownerNpcId: project.initiatedByNpcId,
    hiring: [],
    enterable: true,
    restorative: false
  }
}

function hashString(value: string): number {
  let h = 5381
  for (const ch of value) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0
  return h
}

function enrichBuildingView(view: BuildingRuntimeView, runtime: SimulationRuntime): object {
  const occupants = view.occupants.map((occ) => {
    const npcInfo = runtime.getNpcActivityAndName(occ.npcId)
    const lastProductive = runtime.getLastProductiveAction(occ.npcId)
    return {
      ...occ,
      nameZh: npcInfo?.nameZh ?? occ.npcId,
      activity: npcInfo?.activity ?? 'idle',
      domain: lastProductive?.domain ?? undefined,
      narration: lastProductive?.narration ?? undefined,
    }
  })
  return { ...view, occupants }
}
