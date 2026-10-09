import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Ray } from '@babylonjs/core/Culling/ray'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder'
import { CreateLines } from '@babylonjs/core/Meshes/Builders/linesBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { LinesMesh } from '@babylonjs/core/Meshes/linesMesh'
import type { MultiplayerSceneOptions, PlayerWorldSnapshot, WorldPoint } from './types'
import { isGameplayFocus } from './input'
import { harborBeaconVisual } from './harborBeacon'
import { findNavigationPath, moveIntentToward, type NavigationPoint } from './navigation'

const INPUT_INTERVAL_MS = 100
const INTERPOLATION_MS = 100
const TELEPORT_DISTANCE = 4
const CAMERA_HEIGHT = 1.3
const DEFAULT_DISTANCE = 8
const DEFAULT_PITCH = 0.55
const LOOK_SENSITIVITY = 0.005
const DIRECTION_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

/** Presentation and direction intents only. This controller never advances a player position. */
export function createMultiplayerScene(canvas: HTMLCanvasElement, options: MultiplayerSceneOptions): { dispose: () => void } {
  let engine: Engine
  try {
    engine = new Engine(canvas, true, { stencil: true, powerPreference: 'high-performance', preserveDrawingBuffer: false })
  } catch (error) {
    console.error('[multiplayer3d] WebGL initialization failed', error)
    options.onError('無法啟動 3D 港口。請使用支援 WebGL 的瀏覽器並開啟硬體加速。')
    return { dispose: () => undefined }
  }

  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.8, 0.81, 0.73, 1)
  scene.fogMode = Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(0.8, 0.81, 0.73)
  scene.fogStart = 45
  scene.fogEnd = 130
  const camera = new FreeCamera('multiplayer-follow-camera', new Vector3(0, 12, -20), scene)
  camera.inputs.clear()
  camera.minZ = 0.08
  camera.maxZ = 180
  camera.fov = 0.9
  camera.setTarget(Vector3.Zero())
  scene.activeCamera = camera
  const sky = new HemisphericLight('harbor-sky', new Vector3(0, 1, 0), scene)
  sky.intensity = 0.85
  sky.diffuse = new Color3(0.91, 0.95, 1)
  sky.groundColor = new Color3(0.25, 0.35, 0.32)
  const sunlight = new DirectionalLight('harbor-sun', new Vector3(0.5, -1, 0.4), scene)
  sunlight.intensity = 0.85
  sunlight.diffuse = new Color3(1, 0.87, 0.68)

  const material = (name: string, hex: string, glow = 0) => {
    const value = new StandardMaterial(name, scene)
    value.diffuseColor = Color3.FromHexString(hex)
    value.specularColor = Color3.Black()
    value.emissiveColor = value.diffuseColor.scale(glow)
    return value
  }
  const mats = {
    sea: material('harbor-sea', '#477f85', 0.15),
    land: material('harbor-land', '#aeb39b'),
    stone: material('harbor-stone', '#8c9892'),
    darkStone: material('harbor-dark-stone', '#536967'),
    wood: material('harbor-wood', '#755f4c'),
    wall: material('harbor-wall', '#d1c2a2'),
    dark: material('harbor-dark', '#344a49'),
    skin: material('harbor-skin', '#ddb48e'),
    self: material('harbor-self-cloak', '#c56746'),
    peer: material('harbor-peer-cloak', '#3c8c87'),
    cream: material('harbor-travel-coat', '#d3c5a7'),
    gold: material('harbor-marker-gold', '#f0c879', 0.4),
    blocked: material('navigation-blocked', '#dc715e', 0.35),
    unlit: material('beacon-unlit', '#527174', 0.12),
    lit: material('beacon-lit', '#83e5d1', 0.6),
  }
  const box = (name: string, width: number, height: number, depth: number, mat: StandardMaterial, x: number, y: number, z: number, parent: TransformNode) => {
    const mesh = CreateBox(name, { width, height, depth }, scene)
    mesh.position.set(x, y, z)
    mesh.material = mat
    mesh.parent = parent
    mesh.isPickable = false
    return mesh
  }
  const cylinder = (name: string, diameter: number, height: number, mat: StandardMaterial, x: number, y: number, z: number, parent: TransformNode, top = diameter) => {
    const mesh = CreateCylinder(name, { diameterBottom: diameter, diameterTop: top, height, tessellation: 8 }, scene)
    mesh.position.set(x, y, z)
    mesh.material = mat
    mesh.parent = parent
    mesh.isPickable = false
    return mesh
  }
  const stone = (name: string, mat: StandardMaterial, x: number, y: number, z: number, scale: Vector3, parent: TransformNode) => {
    const mesh = CreateIcoSphere(name, { radius: 1, subdivisions: 1, flat: true }, scene)
    mesh.position.set(x, y, z)
    mesh.scaling.copyFrom(scale)
    mesh.material = mat
    mesh.parent = parent
    mesh.isPickable = false
    return mesh
  }

  type BeaconVisual = { crystal: Mesh; beam: Mesh; ring: Mesh; contributionLights: Mesh[] }
  type Region = { root: TransformNode; floor: Mesh; blockers: Set<Mesh>; beacon: BeaconVisual | null }
  let region: Region | null = null
  let geometryKey = ''
  function createRegion(snapshot: PlayerWorldSnapshot): Region {
    region?.root.dispose()
    const root = new TransformNode(`world-region-${snapshot.tileId}`, scene)
    const world = snapshot.geometry
    const width = world.maxX - world.minX
    const depth = world.maxZ - world.minZ
    const centerX = (world.minX + world.maxX) / 2
    const centerZ = (world.minZ + world.maxZ) / 2
    const blockers = new Set<Mesh>()
    if (world.presentation === 'harbor-3d') box('region-water', 350, 0.2, 350, mats.sea, centerX, -1.15, centerZ, root)
    box('region-edge', width + 2, 0.7, depth + 2, mats.darkStone, centerX, -0.48, centerZ, root)
    const floor = box('region-floor', width, 0.2, depth, mats.land, centerX, -0.1, centerZ, root)
    floor.isPickable = true
    // No authored road or building is invented. Footprints come from server geometry.
    world.obstacles.forEach((obstacle, index) => {
      const wall = box(`region-obstacle-${obstacle.id ?? index}`, obstacle.width, world.presentation === 'harbor-3d' ? 3 : 1.2, obstacle.depth,
        mats.wall, obstacle.x, world.presentation === 'harbor-3d' ? 1.5 : 0.6, obstacle.z, root)
      blockers.add(wall)
    })
    world.portals.forEach((portal, index) => {
      const ring = CreateTorus(`region-crossing-${index}`, { diameter: portal.radius * 2, thickness: 0.045, tessellation: 32 }, scene)
      ring.position.set(portal.x, 0.06, portal.z)
      ring.material = mats.gold
      ring.parent = root
      ring.isPickable = false
    })
    let beaconVisual: BeaconVisual | null = null
    const beacon = harborBeaconVisual(snapshot)
    if (beacon) {
      const beaconRoot = new TransformNode('canonical-harbor-beacon', scene)
      beaconRoot.position.set(beacon.x, 0, beacon.z)
      beaconRoot.parent = root
      // Original beacon remains walkable; only server geometry supplies blockers.
      cylinder('beacon-platform', 2.1, .025, mats.darkStone, 0, .018, 0, beaconRoot)
      const crystal = stone('beacon-crystal', mats.unlit, 0, 2.95, 0, new Vector3(.46, .74, .46), beaconRoot)
      const beam = cylinder('beacon-light-column', .18, 7, mats.lit, 0, 6, 0, beaconRoot, .08)
      const ring = CreateTorus('beacon-interaction-radius', { diameter: beacon.radius * 2, thickness: .045, tessellation: 48 }, scene)
      ring.position.y = .04; ring.material = mats.gold; ring.parent = beaconRoot; ring.isPickable = false
      const contributionLights: Mesh[] = []
      // Bounded decorative lamps; exact participants/required values remain in the panel.
      const lamps = Math.min(beacon.required, 32)
      for (let index = 0; index < lamps; index++) {
        const angle = Math.PI * 2 * index / lamps
        contributionLights.push(stone(`beacon-contribution-${index}`, mats.unlit, Math.cos(angle) * .76, .37, Math.sin(angle) * .76, new Vector3(.19, .23, .19), beaconRoot))
      }
      beaconVisual = { crystal, beam, ring, contributionLights }
    }
    return { root, floor, blockers, beacon: beaconVisual }
  }

  type VisualActor = WorldPoint & { id: string; y?: number; npcColor?: number }

  function createPlayer(player: VisualActor, self: boolean) {
    const root = new TransformNode(`multiplayer-player-${player.id}`, scene)
    root.position.set(player.x, player.y ?? 0, player.z)
    root.metadata = { playerId: player.id }
    const body = new TransformNode(`multiplayer-body-${player.id}`, scene)
    body.parent = root
    const npcMaterial = player.npcColor === undefined ? null : material(`npc-cloak-${player.id}`, `#${player.npcColor.toString(16).padStart(6, '0')}`)
    const cloakMaterial = npcMaterial ?? (self ? mats.self : mats.peer)
    cylinder(`player-coat-${player.id}`, 0.65, 0.77, mats.cream, 0, 1.05, 0, body, 0.5)
    stone(`player-head-${player.id}`, mats.skin, 0, 1.72, 0.03, new Vector3(0.25, 0.3, 0.23), body)
    cylinder(`player-hair-${player.id}`, 0.5, 0.18, mats.dark, 0, 1.95, 0.025, body, 0.38)
    cylinder(`player-collar-${player.id}`, 0.8, 0.17, cloakMaterial, 0, 1.43, 0, body, 0.46)
    const cloak = box(`player-cloak-${player.id}`, 0.7, 0.86, 0.065, cloakMaterial, 0, 1.02, -0.29, body)
    cloak.rotation.x = -0.12
    stone(`player-backpack-${player.id}`, mats.wood, 0, 1.15, -0.38, new Vector3(0.24, 0.3, 0.14), body)
    const limbs: TransformNode[] = []
    for (const side of [-1, 1]) {
      const leg = new TransformNode(`player-leg-${player.id}-${side}`, scene)
      leg.parent = body
      leg.position.set(side * 0.18, 0.73, 0)
      cylinder(`player-trouser-${player.id}-${side}`, 0.23, 0.46, mats.dark, 0, -0.23, 0, leg, 0.27)
      box(`player-boot-${player.id}-${side}`, 0.26, 0.2, 0.38, mats.wood, 0, -0.62, 0.06, leg)
      limbs.push(leg)
      const arm = new TransformNode(`player-arm-${player.id}-${side}`, scene)
      arm.parent = body
      arm.position.set(side * 0.4, 1.42, 0)
      cylinder(`player-sleeve-${player.id}-${side}`, 0.22, 0.43, cloakMaterial, 0, -0.25, 0, arm, 0.25)
      stone(`player-hand-${player.id}-${side}`, mats.skin, 0, -0.53, 0, new Vector3(0.1, 0.12, 0.1), arm)
      limbs.push(arm)
      box(`player-eye-${player.id}-${side}`, 0.04, 0.04, 0.02, mats.dark, side * 0.09, 1.78, 0.256, body)
    }
    const ring = CreateTorus(`player-ring-${player.id}`, { diameter: 1, thickness: self ? 0.055 : 0.025, tessellation: 24 }, scene)
    ring.material = self ? mats.gold : mats.lit
    ring.position.y = 0.035
    ring.parent = root
    ring.isPickable = false
    const meshes = root.getChildMeshes().map(mesh => ({ mesh, visibility: mesh.visibility }))
    return { root, body, cloak, limbs, meshes, self, npcMaterial, from: root.position.clone(), target: root.position.clone(), receivedAt: performance.now() }
  }
  const players = new Map<string, ReturnType<typeof createPlayer>>()
  let lastSnapshot: PlayerWorldSnapshot | null = null
  let lastTileId: string | null = null
  let lastSelfId: number | null = null
  let yaw = 0
  let pitch = DEFAULT_PITCH
  let distance = DEFAULT_DISTANCE
  let cameraDistance = distance
  let ready = false
  let disposed = false
  let lastFrame = performance.now()
  let animationTime = 0
  let lastIntentAt = -INPUT_INTERVAL_MS
  let sentMoving = false
  let wasPaused = true
  let navigationPath: NavigationPoint[] = []
  let navigationIndex = 0
  let navigationLine: LinesMesh | null = null
  let hasNavigationMarker = false
  let currentNavigationStatus = ''
  const navigationMarker = CreateTorus('player-navigation-target', { diameter: 1.3, thickness: 0.08, tessellation: 40 }, scene)
  navigationMarker.material = mats.gold
  navigationMarker.position.y = 0.08
  navigationMarker.isPickable = false
  navigationMarker.setEnabled(false)
  let pointer: { id: number; x: number; y: number; startX: number; startY: number; dragging: boolean; pointerType: string } | null = null
  const keys = new Set<string>()
  const pendingKeys = new Set<string>()
  const controls = options.controls
  const originalTouchAction = canvas.style.touchAction
  canvas.style.touchAction = 'none'

  function navigationStatus(message: string): void {
    if (message === currentNavigationStatus) return
    currentNavigationStatus = message
    options.onNavigationStatus?.(message)
  }
  function clearNavigation(message = ''): void {
    const hadRoute = navigationPath.length > 0
    navigationPath = []
    navigationIndex = 0
    hasNavigationMarker = false
    navigationMarker.setEnabled(false)
    navigationLine?.dispose()
    navigationLine = null
    navigationStatus(message)
    if (hadRoute) stopIntent()
  }
  function showRejectedDestination(point: NavigationPoint): void {
    navigationMarker.position.set(point.x, 0.08, point.z)
    navigationMarker.material = mats.blocked
    navigationMarker.setEnabled(true)
    hasNavigationMarker = true
  }
  function drawNavigationPath(start: NavigationPoint, path: NavigationPoint[]): void {
    navigationLine?.dispose()
    if (path.length === 0) { navigationLine = null; return }
    navigationLine = CreateLines('player-navigation-route', {
      points: [start, ...path].map((point) => new Vector3(point.x, 0.055, point.z)),
    }, scene)
    navigationLine.color = mats.gold.diffuseColor
    navigationLine.isPickable = false
  }
  function setNavigationDestination(): void {
    clearNavigation()
    stopIntent()
    const pick = scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === region?.floor, false, camera)
    if (!pick?.hit || !pick.pickedPoint) {
      navigationStatus('請在區域地面點選目的地。')
      return
    }
    const destination = { x: pick.pickedPoint.x, z: pick.pickedPoint.z }
    const snapshot = options.getSnapshot()
    const self = snapshot?.players.find((player) => player.accountId === options.getSelfId())
    if (!snapshot || !self?.online || controls.paused) return

    if (typeof snapshot.geometry.playerRadius !== 'number' || typeof snapshot.geometry.movePerStep !== 'number' || snapshot.geometry.movePerStep <= 0) {
      showRejectedDestination(destination)
      navigationStatus('目前世界伺服器未提供自動導航資料，請使用方向鍵或搖桿移動。')
      return
    }
    const start = { x: self.x, z: self.z }
    const path = findNavigationPath(start, destination, { ...snapshot.geometry, movePerTick: snapshot.geometry.movePerStep })
    if (path === null) {
      showRejectedDestination(destination)
      navigationStatus('這個位置無法安全抵達，請在可通行地面再點一次。')
      return
    }
    if (path.length === 0) {
      navigationMarker.position.set(destination.x, 0.08, destination.z)
      navigationMarker.material = mats.gold
      navigationMarker.setEnabled(true)
      hasNavigationMarker = true
      navigationStatus('你已在這個位置。')
      return
    }
    navigationPath = path
    navigationIndex = 0
    navigationMarker.position.set(destination.x, 0.08, destination.z)
    navigationMarker.material = mats.gold
    navigationMarker.setEnabled(true)
    hasNavigationMarker = true
    drawNavigationPath(start, path)
    navigationStatus('正在前往目的地。按方向鍵或搖桿即可取消。')
  }

  function stopIntent(): void {
    if (!sentMoving) return
    sentMoving = false
    lastIntentAt = performance.now()
    options.onMove(0, 0)
  }
  function clearInput(): void {
    const hadNavigation = hasNavigationMarker
    keys.clear()
    pendingKeys.clear()
    controls.x = 0
    controls.y = 0
    clearNavigation(hadNavigation ? '自動導航已停止。' : '')
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id)
    pointer = null
    lastFrame = performance.now()
    stopIntent()
  }
  function keyDown(event: KeyboardEvent): void {
    if (!DIRECTION_KEYS.has(event.code) || controls.paused || document.hidden) return
    if (!isGameplayFocus(event.target, canvas, document.body)) return
    // A held key must not restart movement after focus loss or reconnect cancellation.
    if (event.repeat && !keys.has(event.code)) return
    event.preventDefault()
    if (!event.repeat && hasNavigationMarker) clearNavigation('已切換手動移動，自動導航已取消。')
    keys.add(event.code)
    if (!event.repeat) pendingKeys.add(event.code)
  }
  function focusChanged(event: FocusEvent): void {
    if (!isGameplayFocus(event.target, canvas, document.body)) clearInput()
  }
  function keyUp(event: KeyboardEvent): void {
    keys.delete(event.code)
    pendingKeys.delete(event.code)
    const manualInput = Math.hypot(controls.x, controls.y) > 0.06
      || [...keys].some((key) => DIRECTION_KEYS.has(key))
    if (!manualInput && navigationPath.length === 0) stopIntent()
  }
  function pointerDown(event: PointerEvent): void {
    if (controls.paused || pointer || (event.pointerType === 'mouse' && event.button !== 0)) return
    canvas.focus({ preventScroll: true })
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, dragging: false, pointerType: event.pointerType }
    canvas.setPointerCapture(event.pointerId)
  }
  function pointerMove(event: PointerEvent): void {
    if (!pointer || pointer.id !== event.pointerId || controls.paused) return
    const distanceFromStart = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY)
    const dragThreshold = pointer.pointerType === 'mouse' ? 5 : 11
    if (!pointer.dragging && distanceFromStart < dragThreshold) {
      pointer.x = event.clientX
      pointer.y = event.clientY
      return
    }
    pointer.dragging = true
    yaw += (event.clientX - pointer.x) * LOOK_SENSITIVITY
    pitch = clamp(pitch + (event.clientY - pointer.y) * LOOK_SENSITIVITY, 0.25, 1.05)
    pointer.x = event.clientX
    pointer.y = event.clientY
  }
  function pointerEnd(event: PointerEvent, allowDestination: boolean): void {
    if (pointer?.id !== event.pointerId) return
    const distanceFromStart = Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY)
    const dragThreshold = pointer.pointerType === 'mouse' ? 5 : 11
    const wasClick = !pointer.dragging && distanceFromStart < dragThreshold
    pointer = null
    if (wasClick && allowDestination && !controls.paused) setNavigationDestination()
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
  }
  function pointerUp(event: PointerEvent): void { pointerEnd(event, true) }
  function pointerCancel(event: PointerEvent): void { pointerEnd(event, false) }
  const cancelManualNavigation = () => {
    if (hasNavigationMarker) clearNavigation('已切換手動移動，自動導航已取消。')
  }
  controls.cancelNavigation = cancelManualNavigation
  function wheel(event: WheelEvent): void {
    event.preventDefault()
    if (!controls.paused) distance = clamp(distance + event.deltaY * 0.008, 4, 11)
  }
  function resize(): void {
    if (disposed) return
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, canvas.clientWidth < 700 ? 1.25 : 1.5))
    engine.resize()
  }
  function contextLost(): void {
    clearInput()
    options.onError('3D 繪圖中斷，請重新整理並重新連線。玩家位置仍由伺服器保存。')
  }

  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  window.addEventListener('keydown', keyDown)
  window.addEventListener('keyup', keyUp)
  window.addEventListener('blur', clearInput)
  window.addEventListener('resize', resize)
  document.addEventListener('visibilitychange', clearInput)
  document.addEventListener('focusin', focusChanged)
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('pointercancel', pointerCancel)
  canvas.addEventListener('lostpointercapture', pointerCancel)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('webglcontextlost', contextLost)
  resize()

  function render(): void {
    if (disposed) return
    const now = performance.now()
    const delta = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000))
    lastFrame = now
    if (document.hidden) return
    const snapshot = options.getSnapshot()
    const selfId = options.getSelfId()
    const self = snapshot?.players.find(player => player.accountId === selfId)
    const paused = controls.paused || !snapshot || !self || !self.online
    if (paused && !wasPaused) clearInput()
    wasPaused = paused

    if (snapshot) {
      const nextGeometryKey = JSON.stringify([snapshot.tileId, snapshot.geometry, harborBeaconVisual(snapshot) && [snapshot.beacon.id, snapshot.beacon.x, snapshot.beacon.z, snapshot.beacon.radius, snapshot.beacon.required]])
      if (nextGeometryKey !== geometryKey) {
        const geometryChanged = geometryKey !== ''
        region = createRegion(snapshot)
        geometryKey = nextGeometryKey
        if (geometryChanged) clearNavigation('區域地圖已更新，請重新設定目的地。')
      }
      if (lastTileId !== snapshot.tileId || lastSelfId !== selfId) {
        for (const player of players.values()) { player.root.dispose(); player.npcMaterial?.dispose() }
        players.clear()
        lastSnapshot = null
        lastTileId = snapshot.tileId
        lastSelfId = selfId
        yaw = 0
        pitch = DEFAULT_PITCH
        distance = DEFAULT_DISTANCE
        clearInput()
      }
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot
        const actors: VisualActor[] = [
          ...snapshot.players.filter(p => p.accountId === selfId || p.online).map(p => ({ id: `player-${p.accountId}`, x: p.x, z: p.z })),
          ...snapshot.npcs.map(npc => ({ id: `npc-${npc.id}`, ...npc.presentationPosition, y: npc.subZ, npcColor: npc.color })),
        ]
        const visibleIds = new Set<string>()
        for (const authoritative of actors) {
          visibleIds.add(authoritative.id)
          let visual = players.get(authoritative.id)
          if (!visual) {
            visual = createPlayer(authoritative, authoritative.id === `player-${selfId}`)
            players.set(authoritative.id, visual)
            // Canonical-grid coordinates use one unit per area cell.
            visual.root.scaling.setAll(snapshot.geometry.presentation === 'canonical-area-grid' ? 0.42 : 1)
          }
          if (visual.npcMaterial && authoritative.npcColor !== undefined) visual.npcMaterial.diffuseColor = Color3.FromHexString(`#${authoritative.npcColor.toString(16).padStart(6, '0')}`)
          visual.from.copyFrom(visual.root.position)
          visual.target.set(authoritative.x, authoritative.y ?? 0, authoritative.z)
          visual.receivedAt = now
          if (Vector3.Distance(visual.from, visual.target) > TELEPORT_DISTANCE) visual.from.copyFrom(visual.target)
        }
        for (const [id, visual] of players) {
          if (!visibleIds.has(id)) { visual.root.dispose(); visual.npcMaterial?.dispose(); players.delete(id) }
        }
        if (region?.beacon) {
          region.beacon.crystal.material = snapshot.beacon.completed ? mats.lit : mats.unlit
          region.beacon.beam.setEnabled(snapshot.beacon.completed)
          region.beacon.ring.material = snapshot.beacon.completed ? mats.lit : mats.gold
          region.beacon.contributionLights.forEach((light, index) => { light.material = index < snapshot.beacon.contributors.length ? mats.lit : mats.unlit })
        }
      }
    } else {
      clearNavigation()
      for (const player of players.values()) { player.root.dispose(); player.npcMaterial?.dispose() }
      players.clear()
      region?.root.dispose()
      region = null
      geometryKey = ''
      lastSnapshot = null
      lastTileId = null
      lastSelfId = null
    }

    if (!paused && now - lastIntentAt >= INPUT_INTERVAL_MS) {
      const active = (key: string) => keys.has(key) || pendingKeys.has(key)
      let x = controls.x + Number(active('KeyD') || active('ArrowRight')) - Number(active('KeyA') || active('ArrowLeft'))
      let z = controls.y + Number(active('KeyW') || active('ArrowUp')) - Number(active('KeyS') || active('ArrowDown'))
      const manualMagnitude = Math.hypot(x, z)
      if (manualMagnitude > 0.06 && hasNavigationMarker) clearNavigation('已切換手動移動，自動導航已取消。')
      let autoMoving = false
      if (manualMagnitude <= 0.06 && navigationPath.length > 0 && self) {
        while (navigationIndex < navigationPath.length) {
          const waypoint = navigationPath[navigationIndex]
          if (!waypoint) { navigationIndex = navigationPath.length; break }
          if (Math.hypot(waypoint.x - self.x, waypoint.z - self.z) > 0.015) break
          navigationIndex += 1
        }
        if (navigationIndex >= navigationPath.length) {
          clearNavigation('已抵達目的地。')
          stopIntent()
        } else {
          const waypoint = navigationPath[navigationIndex]
          const speed = snapshot.geometry.movePerStep
          if (!waypoint || typeof speed !== 'number') {
            clearNavigation('導航資料已變更，請重新設定目的地。')
            stopIntent()
          } else {
            const worldIntent = moveIntentToward(self, waypoint, speed)
            if (worldIntent) {
              // Movement controls are camera-relative; invert yaw to preserve the world-space route.
              x = Math.cos(yaw) * worldIntent.x - Math.sin(yaw) * worldIntent.z
              z = Math.sin(yaw) * worldIntent.x + Math.cos(yaw) * worldIntent.z
              autoMoving = true
            }
          }
        }
      }
      const magnitude = Math.hypot(x, z)
      if (autoMoving || magnitude > 0.06) {
        if (magnitude > 1) { x /= magnitude; z /= magnitude }
        options.onMove(Math.cos(yaw) * x + Math.sin(yaw) * z, -Math.sin(yaw) * x + Math.cos(yaw) * z)
        sentMoving = true
      } else stopIntent()
      lastIntentAt = now
      pendingKeys.clear()
    } else if (paused) {
      keys.clear()
      pendingKeys.clear()
      controls.x = 0
      controls.y = 0
      stopIntent()
    }

    animationTime += delta
    for (const visual of players.values()) {
      const previous = visual.root.position.clone()
      Vector3.LerpToRef(visual.from, visual.target, clamp((now - visual.receivedAt) / INTERPOLATION_MS, 0, 1), visual.root.position)
      const moved = visual.root.position.subtract(previous)
      const walking = moved.lengthSquared() > 0.000001
      if (walking) {
        const heading = Math.atan2(moved.x, moved.z)
        const turn = Math.atan2(Math.sin(heading - visual.root.rotation.y), Math.cos(heading - visual.root.rotation.y))
        visual.root.rotation.y += turn * Math.min(1, delta * 15)
      }
      visual.limbs.forEach((limb, index) => { limb.rotation.x = walking ? Math.sin(animationTime * 10) * (index % 2 ? -0.45 : 0.55) : 0 })
      visual.body.position.y = walking ? Math.abs(Math.sin(animationTime * 10)) * 0.045 : 0
      visual.cloak.rotation.x = -0.12 - (walking ? 0.1 : 0)
    }
    const selfVisual = selfId ? players.get(`player-${selfId}`) : undefined
    if (selfVisual) {
      if (controls.recenter) { yaw = selfVisual.root.rotation.y; pitch = DEFAULT_PITCH; distance = DEFAULT_DISTANCE; controls.recenter = false }
      const target = selfVisual.root.position.add(new Vector3(0, CAMERA_HEIGHT, 0))
      const direction = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
      const hit = scene.pickWithRay(new Ray(target, direction, distance), mesh => region?.blockers.has(mesh as Mesh) ?? false)
      const safeDistance = hit?.hit ? Math.max(camera.minZ + 0.02, hit.distance - 0.35) : distance
      cameraDistance = safeDistance < cameraDistance ? safeDistance : cameraDistance + (safeDistance - cameraDistance) * Math.min(1, delta * 6)
      camera.position.copyFrom(target.add(direction.scale(cameraDistance)))
      camera.setTarget(target)
      const visibility = clamp((cameraDistance - 2) / 1.5, 0, 1)
      for (const item of selfVisual.meshes) item.mesh.visibility = item.visibility * visibility
    } else if (snapshot) {
      const center = new Vector3((snapshot.geometry.minX + snapshot.geometry.maxX) / 2, 0, (snapshot.geometry.minZ + snapshot.geometry.maxZ) / 2)
      camera.position.copyFrom(center.add(new Vector3(0, 18, -18)))
      camera.setTarget(center)
    }
    scene.render()
    if (!ready) { ready = true; options.onReady() }
  }
  function safeRender(): void {
    try { render() } catch (error) {
      engine.stopRenderLoop(safeRender)
      clearInput()
      console.error('[multiplayer3d] Scene rendering failed', error)
      options.onError('世界場景畫面中斷。請重新整理以取得伺服器最新狀態。')
    }
  }
  engine.runRenderLoop(safeRender)

  return { dispose(): void {
    if (disposed) return
    disposed = true
    clearInput()
    engine.stopRenderLoop(safeRender)
    observer.disconnect()
    window.removeEventListener('keydown', keyDown)
    window.removeEventListener('keyup', keyUp)
    window.removeEventListener('blur', clearInput)
    window.removeEventListener('resize', resize)
    document.removeEventListener('visibilitychange', clearInput)
    document.removeEventListener('focusin', focusChanged)
    canvas.removeEventListener('pointerdown', pointerDown)
    canvas.removeEventListener('pointermove', pointerMove)
    canvas.removeEventListener('pointerup', pointerUp)
    canvas.removeEventListener('pointercancel', pointerCancel)
    canvas.removeEventListener('lostpointercapture', pointerCancel)
    canvas.removeEventListener('wheel', wheel)
    canvas.removeEventListener('webglcontextlost', contextLost)
    canvas.style.touchAction = originalTouchAction
    if (controls.cancelNavigation === cancelManualNavigation) delete controls.cancelNavigation
    scene.dispose()
    engine.dispose()
  } }
}

