import { Engine } from '@babylonjs/core/Engines/engine'
import { Scene } from '@babylonjs/core/scene'
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Ray } from '@babylonjs/core/Culling/ray'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import '@babylonjs/core/Collisions/collisionCoordinator'
import { distance, getInteraction, getObjective } from './model'
import { WORLD, type CardId, type DemoAction, type DemoControls, type DemoState, type SceneTelemetry } from './types'
import { createWorld } from './world'

interface SceneOptions {
  getState: () => DemoState
  controls: DemoControls
  dispatch: (action: DemoAction) => void
  onTelemetry: (telemetry: SceneTelemetry) => void
  onReady: () => void
  onError: (message: string) => void
}

const WALK_SPEED = 4.5
const SPRINT_SPEED = 7
const BODY_RADIUS = 0.4
const BODY_HEIGHT = 0.85
const DEFAULT_CAMERA_DISTANCE = 8
const DEFAULT_CAMERA_PITCH = 0.52
const CAMERA_TARGET_HEIGHT = 1.35
const CAMERA_MARGIN = 0.35
const CAMERA_NEAR_PADDING = 0.02
const PLAYER_FADE_START = 1.2
const PLAYER_FADE_END = 0.45
const ATTACK_RANGE = 4
const ATTACK_WARNING_SECONDS = 1
const ATTACK_CYCLE_SECONDS = 2
const STATE_INTERVAL = 0.1
const TELEMETRY_INTERVAL = 0.2
const SIMULATION_INTERVAL = 0.5
const FULL_TURN = Math.PI * 2
const MAX_FRAME_DELTA = 0.05
const LOOK_SENSITIVITY = 0.005
const DIRECTION_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'])
const CONTROL_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'KeyE', 'Space', 'Digit1', 'Digit2', 'Digit3'])

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function editableTarget(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, textarea, select, [contenteditable="true"]')
}

/** Local prototype controller. The scene submits actions; the demo reducer owns progress. */
export function createDemoScene(canvas: HTMLCanvasElement, options: SceneOptions): { dispose: () => void } {
  let engine: Engine
  try {
    engine = new Engine(canvas, true, { stencil: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' })
  } catch (error) {
    console.error('[prototype3d] WebGL initialization failed', error)
    options.onError('無法啟動 3D 畫面。請使用支援 WebGL 的瀏覽器，並開啟硬體加速。')
    return { dispose: () => undefined }
  }

  const scene = new Scene(engine)
  scene.collisionsEnabled = true
  const camera = new FreeCamera('prototype-follow-camera', Vector3.Zero(), scene)
  camera.inputs.clear()
  camera.minZ = 0.08
  camera.maxZ = 180
  camera.fov = 0.85
  scene.activeCamera = camera

  let world: ReturnType<typeof createWorld>
  try {
    world = createWorld(scene)
  } catch (error) {
    console.error('[prototype3d] World creation failed', error)
    scene.dispose()
    engine.dispose()
    options.onError('3D 場景載入失敗。重新整理後可從本機存檔繼續。')
    return { dispose: () => undefined }
  }

  const body = new Mesh('player-collision-body', scene)
  body.ellipsoid = new Vector3(BODY_RADIUS, BODY_HEIGHT, BODY_RADIUS)
  body.isVisible = false
  body.isPickable = false
  const blockers = new Set([...world.blockers, world.gate])
  const playerMeshes = world.player.getChildMeshes().map(mesh => ({ mesh, visibility: mesh.visibility }))

  const warningMaterial = new StandardMaterial('enemy-warning-material', scene)
  warningMaterial.diffuseColor = Color3.FromHexString('#ff813b')
  warningMaterial.emissiveColor = Color3.FromHexString('#c54220')
  warningMaterial.disableLighting = true
  warningMaterial.alpha = 0.85
  const warningRing = MeshBuilder.CreateTorus('enemy-attack-warning', { diameter: ATTACK_RANGE * 2, thickness: 0.11, tessellation: 48 }, scene)
  warningRing.position.set(WORLD.enemy.x, 0.08, WORLD.enemy.z)
  warningRing.material = warningMaterial
  warningRing.isPickable = false
  warningRing.setEnabled(false)

  type Effect = { mesh: Mesh; material: StandardMaterial; age: number; duration: number; start: Vector3; end: Vector3; projectile: boolean }
  const effects: Effect[] = []
  function effect(color: string, start: Vector3, end?: Vector3): void {
    const projectile = !!end
    const mesh = projectile
      ? MeshBuilder.CreateSphere('ember-cast', { diameter: 0.5, segments: 6 }, scene)
      : MeshBuilder.CreateTorus('card-cast-ring', { diameter: 1, thickness: 0.12, tessellation: 32 }, scene)
    const material = new StandardMaterial('card-cast-material', scene)
    material.emissiveColor = Color3.FromHexString(color)
    material.diffuseColor = material.emissiveColor
    material.disableLighting = true
    mesh.material = material
    mesh.isPickable = false
    mesh.position.copyFrom(start)
    effects.push({ mesh, material, age: 0, duration: projectile ? 0.4 : 0.8, start, end: end ?? start, projectile })
  }

  let state = options.getState()
  let lastRunId = state.runId
  let lastState = state
  let lastPublishedPosition = { ...state.position }
  let yaw = 0
  let pitch = DEFAULT_CAMERA_PITCH
  let cameraDistance = DEFAULT_CAMERA_DISTANCE
  let actualCameraDistance = cameraDistance
  let attackElapsed = 0
  let attackHit = false
  let stateElapsed = 0
  let simulationElapsed = 0
  let telemetryElapsed = TELEMETRY_INTERVAL
  let animationTime = 0
  let disposed = false
  let ready = false
  let previousFrame = performance.now()
  let pointer: { id: number; x: number; y: number } | null = null
  const pressed = new Set<string>()
  const pendingDirections = new Set<string>()
  const directionActive = (code: string): boolean => pressed.has(code) || pendingDirections.has(code)
  const controls = options.controls
  const originalTouchAction = canvas.style.touchAction
  canvas.style.touchAction = 'none'
  body.position.set(state.position.x, BODY_HEIGHT, state.position.z)
  world.player.position.set(state.position.x, 0, state.position.z)

  function publishPosition(): void {
    const position = { x: body.position.x, z: body.position.z }
    if (distance(position, lastPublishedPosition) < 0.001) return
    lastPublishedPosition = position
    options.dispatch({ type: 'move', position })
  }

  function cast(card: CardId): void {
    publishPosition()
    options.dispatch({ type: 'select-card', card })
    options.dispatch({ type: 'cast', card })
  }

  function keyDown(event: KeyboardEvent): void {
    if (!CONTROL_KEYS.has(event.code) || editableTarget(event.target) || controls.paused || document.hidden) return
    if (event.code === 'Space' && event.target instanceof Element && event.target.closest('button, a')) return
    event.preventDefault()
    pressed.add(event.code)
    if (event.repeat) return
    // Preserve a press/release pair arriving between two animation frames.
    if (DIRECTION_KEYS.has(event.code)) pendingDirections.add(event.code)
    if (event.code === 'KeyE') {
      publishPosition()
      options.dispatch({ type: 'interact' })
    }
    if (event.code === 'Space') cast(options.getState().selectedCard)
    const card = ({ Digit1: 'ember', Digit2: 'tide', Digit3: 'wind' } as const)[event.code as 'Digit1' | 'Digit2' | 'Digit3']
    if (card) cast(card)
  }

  function keyUp(event: KeyboardEvent): void {
    pressed.delete(event.code)
  }

  function clearInput(): void {
    pressed.clear()
    pendingDirections.clear()
    controls.x = 0
    controls.y = 0
    controls.lookX = 0
    controls.lookY = 0
    controls.sprint = false
    if (pointer && canvas.hasPointerCapture(pointer.id)) canvas.releasePointerCapture(pointer.id)
    pointer = null
    previousFrame = performance.now()
    publishPosition()
  }

  function pointerDown(event: PointerEvent): void {
    if (controls.paused || pointer || (event.pointerType === 'mouse' && event.button !== 0)) return
    canvas.focus({ preventScroll: true })
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }
    canvas.setPointerCapture(event.pointerId)
  }

  function pointerMove(event: PointerEvent): void {
    if (!pointer || pointer.id !== event.pointerId || controls.paused) return
    yaw += (event.clientX - pointer.x) * LOOK_SENSITIVITY
    pitch = clamp(pitch + (event.clientY - pointer.y) * LOOK_SENSITIVITY, 0.22, 1.05)
    pointer.x = event.clientX
    pointer.y = event.clientY
  }

  function pointerUp(event: PointerEvent): void {
    if (pointer?.id !== event.pointerId) return
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
    pointer = null
  }

  function wheel(event: WheelEvent): void {
    event.preventDefault()
    if (!controls.paused) cameraDistance = clamp(cameraDistance + event.deltaY * 0.008, 4, 12)
  }

  function contextLost(): void {
    clearInput()
    options.onError('3D 繪圖暫時中斷。請重新整理，繼續本機存檔。')
  }

  function resize(): void {
    if (disposed) return
    const compact = canvas.clientWidth < 700
    const maximumPixelRatio = compact ? 1.35 : 1.75
    engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, maximumPixelRatio))
    engine.resize()
  }

  function updateCamera(delta: number, instant = false): boolean {
    const target = new Vector3(body.position.x, CAMERA_TARGET_HEIGHT, body.position.z)
    const cameraDirection = new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
    const ray = new Ray(target, cameraDirection, cameraDistance)
    const hit = scene.pickWithRay(ray, mesh => blockers.has(mesh) && mesh.isEnabled())
    const safeDistance = hit?.hit ? Math.max(camera.minZ + CAMERA_NEAR_PADDING, hit.distance - CAMERA_MARGIN) : cameraDistance
    // Retract immediately to keep the view outside walls; ease back out into the open.
    actualCameraDistance = instant || safeDistance < actualCameraDistance
      ? safeDistance
      : actualCameraDistance + (safeDistance - actualCameraDistance) * Math.min(1, delta * 6)
    camera.position.copyFrom(target.add(cameraDirection.scale(actualCameraDistance)))
    camera.position.y = Math.max(0.6, camera.position.y)
    camera.setTarget(target)
    // A wall can push the camera into the character; fade only this player's meshes.
    const playerVisibility = clamp((actualCameraDistance - PLAYER_FADE_END) / (PLAYER_FADE_START - PLAYER_FADE_END), 0, 1)
    for (const item of playerMeshes) item.mesh.visibility = item.visibility * playerVisibility
    return safeDistance < cameraDistance - 0.1
  }

  window.addEventListener('keydown', keyDown)
  window.addEventListener('keyup', keyUp)
  window.addEventListener('blur', clearInput)
  document.addEventListener('visibilitychange', clearInput)
  canvas.addEventListener('pointerdown', pointerDown)
  canvas.addEventListener('pointermove', pointerMove)
  canvas.addEventListener('pointerup', pointerUp)
  canvas.addEventListener('pointercancel', pointerUp)
  canvas.addEventListener('lostpointercapture', pointerUp)
  canvas.addEventListener('wheel', wheel, { passive: false })
  canvas.addEventListener('webglcontextlost', contextLost)
  window.addEventListener('resize', resize)
  const observer = new ResizeObserver(resize)
  observer.observe(canvas)
  resize()
  world.gate.checkCollisions = !state.bridgeOpen
  world.gate.setEnabled(!state.bridgeOpen)
  updateCamera(0, true)

  const render = (): void => {
    if (disposed) return
    const now = performance.now()
    const delta = Math.min(MAX_FRAME_DELTA, (now - previousFrame) / 1000)
    previousFrame = now
    if (document.hidden) return
    state = options.getState()
    const newRun = state.runId !== lastRunId
    const teleported = state.position !== lastState.position && distance(state.position, { x: body.position.x, z: body.position.z }) > 1.5
    if (newRun || teleported) {
      body.position.set(state.position.x, BODY_HEIGHT, state.position.z)
      lastPublishedPosition = { ...state.position }
      attackElapsed = 0
      attackHit = false
      simulationElapsed = 0
      stateElapsed = 0
      if (newRun) {
        yaw = 0
        pitch = DEFAULT_CAMERA_PITCH
        cameraDistance = DEFAULT_CAMERA_DISTANCE
        clearInput()
        for (const item of effects) { item.mesh.dispose(); item.material.dispose() }
        effects.length = 0
      }
      updateCamera(delta, true)
    }
    lastRunId = state.runId
    if (!newRun) {
      if (state.enemyHp < lastState.enemyHp) effect('#ffad4e', new Vector3(body.position.x, 1.05, body.position.z), new Vector3(WORLD.enemy.x, 0.8, WORLD.enemy.z))
      if (state.hp > lastState.hp && state.energy < lastState.energy) effect('#7ce4d2', new Vector3(body.position.x, 0.12, body.position.z))
      if (state.bridgeOpen && !lastState.bridgeOpen) effect('#d7f08a', new Vector3(WORLD.gate.x, 0.18, WORLD.gate.z))
      if (state.hp < lastState.hp) effect('#f96a43', new Vector3(body.position.x, 0.11, body.position.z))
    }
    lastState = state
    world.gate.checkCollisions = !state.bridgeOpen
    world.gate.setEnabled(!state.bridgeOpen)

    const paused = controls.paused || state.hp <= 0
    let moving = false
    if (!paused) {
      animationTime += delta
      if (controls.recenter) {
        yaw = world.player.rotation.y
        pitch = DEFAULT_CAMERA_PITCH
        cameraDistance = DEFAULT_CAMERA_DISTANCE
        controls.recenter = false
      }
      yaw += controls.lookX * delta * 2
      pitch = clamp(pitch + controls.lookY * delta * 1.5, 0.22, 1.05)
      let horizontal = controls.x + Number(directionActive('KeyD') || directionActive('ArrowRight')) - Number(directionActive('KeyA') || directionActive('ArrowLeft'))
      let forward = controls.y + Number(directionActive('KeyW') || directionActive('ArrowUp')) - Number(directionActive('KeyS') || directionActive('ArrowDown'))
      const length = Math.hypot(horizontal, forward)
      if (length > 0.06) {
        if (length > 1) { horizontal /= length; forward /= length }
        const speed = controls.sprint || pressed.has('ShiftLeft') || pressed.has('ShiftRight') ? SPRINT_SPEED : WALK_SPEED
        const movement = new Vector3((Math.cos(yaw) * horizontal + Math.sin(yaw) * forward) * speed * delta, 0, (-Math.sin(yaw) * horizontal + Math.cos(yaw) * forward) * speed * delta)
        const before = body.position.clone()
        body.moveWithCollisions(movement)
        body.position.x = clamp(body.position.x, WORLD.bounds.minX + BODY_RADIUS, WORLD.bounds.maxX - BODY_RADIUS)
        body.position.z = clamp(body.position.z, WORLD.bounds.minZ + BODY_RADIUS, WORLD.bounds.maxZ - BODY_RADIUS)
        body.position.y = BODY_HEIGHT
        // Keep a closed full-width gateway impassable even at its extreme edges.
        if (!state.bridgeOpen && before.z < WORLD.gate.z && body.position.z > WORLD.gate.z - BODY_RADIUS - 0.4) body.position.z = WORLD.gate.z - BODY_RADIUS - 0.4
        moving = Vector3.DistanceSquared(before, body.position) > 0.000001
        const heading = Math.atan2(movement.x, movement.z)
        const turn = Math.atan2(Math.sin(heading - world.player.rotation.y), Math.cos(heading - world.player.rotation.y))
        world.player.rotation.y += turn * Math.min(1, delta * 15)
      }
      pendingDirections.clear()

      stateElapsed += delta
      if (stateElapsed >= STATE_INTERVAL) { publishPosition(); stateElapsed = 0 }
      simulationElapsed += delta
      if (simulationElapsed >= SIMULATION_INTERVAL) {
        // NPC time advances even when energy is full; hidden/paused time never catches up.
        const step = Math.min(simulationElapsed, SIMULATION_INTERVAL)
        options.dispatch({ type: 'tick', delta: step })
        if (state.energy < 100) options.dispatch({ type: 'recover', delta: step })
        simulationElapsed = 0
      }
    } else {
      pressed.clear()
      pendingDirections.clear()
      publishPosition()
      simulationElapsed = 0
    }

    world.player.position.set(body.position.x, 0, body.position.z)
    const frameState = { ...state, position: { x: body.position.x, z: body.position.z } }
    const enemyNearby = state.stage === 'forest' && state.enemyHp > 0 && distance(frameState.position, WORLD.enemy) < ATTACK_RANGE
    if (!paused && enemyNearby) {
      attackElapsed += delta
      if (attackElapsed >= ATTACK_CYCLE_SECONDS) { attackElapsed = 0; attackHit = false }
      const windingUp = attackElapsed < ATTACK_WARNING_SECONDS
      warningRing.setEnabled(windingUp)
      const warningScale = 0.3 + 0.7 * Math.min(1, attackElapsed / ATTACK_WARNING_SECONDS)
      warningRing.scaling.set(warningScale, 1, warningScale)
      warningMaterial.alpha = 0.5 + 0.35 * Math.sin(attackElapsed * 15) ** 2
      if (!windingUp && !attackHit) {
        publishPosition()
        options.dispatch({ type: 'enemy-hit', amount: 8 })
        attackHit = true
      }
    } else {
      attackElapsed = 0
      attackHit = false
      warningRing.setEnabled(false)
    }

    const objective = getObjective(frameState)
    world.marker.position.x = objective.position.x
    world.marker.position.z = objective.position.z
    world.animate(animationTime, frameState, moving)
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const item = effects[index]!
      if (!paused) item.age += delta
      const progress = Math.min(1, item.age / item.duration)
      if (item.projectile) {
        Vector3.LerpToRef(item.start, item.end, progress, item.mesh.position)
        item.mesh.position.y += Math.sin(progress * Math.PI) * 0.7
      } else {
        item.mesh.scaling.setAll(1 + progress * 5)
        item.material.alpha = 1 - progress
      }
      if (progress >= 1) { item.mesh.dispose(); item.material.dispose(); effects.splice(index, 1) }
    }
    const cameraOccluded = updateCamera(delta)
    telemetryElapsed += delta
    if (telemetryElapsed >= TELEMETRY_INTERVAL) {
      telemetryElapsed = 0
      options.onTelemetry({
        zone: body.position.z < -9 ? '潮汐港口' : body.position.z < WORLD.gate.z ? '微光森林' : '風眠遺跡',
        distance: distance(frameState.position, objective.position),
        nearby: getInteraction(frameState),
        enemyNearby,
        cameraOccluded,
        heading: ((yaw % FULL_TURN) + FULL_TURN) % FULL_TURN,
      })
    }
    scene.render()
    if (!ready) { ready = true; options.onReady() }
  }

  function safeRender(): void {
    try { render() } catch (error) {
      engine.stopRenderLoop(safeRender)
      console.error('[prototype3d] Rendering failed', error)
      options.onError('3D 畫面遇到問題。請重新整理，繼續本機存檔。')
    }
  }
  engine.runRenderLoop(safeRender)

  return {
    dispose(): void {
      if (disposed) return
      disposed = true
      clearInput()
      engine.stopRenderLoop(safeRender)
      observer.disconnect()
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      window.removeEventListener('blur', clearInput)
      document.removeEventListener('visibilitychange', clearInput)
      window.removeEventListener('resize', resize)
      canvas.removeEventListener('pointerdown', pointerDown)
      canvas.removeEventListener('pointermove', pointerMove)
      canvas.removeEventListener('pointerup', pointerUp)
      canvas.removeEventListener('pointercancel', pointerUp)
      canvas.removeEventListener('lostpointercapture', pointerUp)
      canvas.removeEventListener('wheel', wheel)
      canvas.removeEventListener('webglcontextlost', contextLost)
      canvas.style.touchAction = originalTouchAction
      scene.dispose()
      engine.dispose()
    },
  }
}
