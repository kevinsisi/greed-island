import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder'
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder'
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder'
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder'
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder'
import { Scene } from '@babylonjs/core/scene'
import { getNpc } from './npc'
import { WORLD, type DemoState } from './types'

export interface WorldVisuals {
  blockers: AbstractMesh[]
  player: TransformNode
  enemy: TransformNode
  seeds: TransformNode[]
  gate: AbstractMesh
  relic: TransformNode
  marker: TransformNode
  animate: (time: number, state: DemoState, moving: boolean) => void
  dispose?: () => void
}

/** Procedural presentation only. All quest and combat facts come from DemoState. */
export function createWorld(scene: Scene): WorldVisuals {
  const blockers: AbstractMesh[] = []
  const animatedWater: Mesh[] = []
  const flags: Mesh[] = []
  const motes: Mesh[] = []
  const staticDetails: Mesh[] = []
  let serial = 0
  const id = (label: string) => `prototype-${label}-${serial++}`
  const material = (name: string, hex: string, glow = 0, alpha = 1) => {
    const result = new StandardMaterial(id(name), scene)
    result.diffuseColor = Color3.FromHexString(hex)
    result.specularColor = Color3.Black()
    result.emissiveColor = result.diffuseColor.scale(glow)
    result.alpha = alpha
    return result
  }
  const colors = {
    grass: material('island-grass', '#718675'),
    forestFloor: material('forest-moss', '#566f5c'),
    sand: material('warm-sand', '#c3b38f'),
    path: material('limestone-path', '#b6af9b'),
    pathEdge: material('weathered-path-edge', '#899084'),
    cliff: material('cliff', '#737e78'),
    water: material('sea', '#477e82', 0.12),
    foam: material('foam', '#9bcac2', 0.15, 0.5),
    wood: material('cedar', '#775e4b'),
    darkWood: material('dark-wood', '#394641'),
    wall: material('cabin-wall', '#cab894'),
    window: material('amber-window', '#dbb773', 0.24),
    roof: material('terracotta-roof', '#a9614e'),
    leaf: material('pine', '#33594b'),
    leafLight: material('pine-sunlit', '#52715a'),
    stone: material('ruin-stone', '#929c92'),
    darkStone: material('ruin-shadow', '#63756f'),
    teal: material('relic-teal', '#62d9bd', 0.6),
    gold: material('seed-gold', '#f6ca67', 0.75),
    ivory: material('ivory', '#d8d0b4'),
    brass: material('aged-brass', '#b99755'),
    leather: material('saddle-leather', '#825840'),
    cloakTeal: material('guide-cloak', '#367971'),
    cloakHerbalist: material('herbalist-cloak', '#788151'),
    cloakScout: material('scout-cloak', '#4d6d7a'),
    ember: material('explorer-cape', '#bb573e'),
    skin: material('skin', '#d9ac86'),
    outfit: material('explorer-coat', '#c9bd9f'),
    trousers: material('trousers', '#3f5657'),
    red: material('sentinel-eye', '#ff9366', 0.8),
  }

  scene.clearColor = new Color4(0.83, 0.78, 0.69, 1)
  scene.ambientColor = new Color3(0.1, 0.13, 0.14)
  scene.fogMode = Scene.FOGMODE_LINEAR
  scene.fogColor = new Color3(0.83, 0.78, 0.69)
  scene.fogStart = 32
  scene.fogEnd = 108
  const sky = new HemisphericLight(id('sky-light'), new Vector3(0, 1, 0), scene)
  sky.intensity = 0.62
  sky.diffuse = new Color3(0.8, 0.9, 1)
  sky.groundColor = new Color3(0.28, 0.37, 0.35)
  const sun = new DirectionalLight(id('sunlight'), new Vector3(0.6, -1.2, 0.35), scene)
  sun.position.set(-24, 40, -20)
  sun.intensity = 0.9
  sun.diffuse = new Color3(1, 0.88, 0.72)
  sun.shadowMinZ = 1
  sun.shadowMaxZ = 120
  const shadows = new ShadowGenerator(1024, sun)
  shadows.usePercentageCloserFiltering = true
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW
  shadows.bias = 0.004
  shadows.normalBias = 0.035
  shadows.darkness = 0.28

  const finish = (mesh: Mesh, mat: StandardMaterial, x: number, y: number, z: number, parent?: TransformNode) => {
    mesh.material = mat
    mesh.position.set(x, y, z)
    mesh.parent = parent ?? null
    mesh.isPickable = false
    mesh.receiveShadows = true
    return mesh
  }
  const box = (name: string, size: [number, number, number], mat: StandardMaterial, x: number, y: number, z: number, parent?: TransformNode) =>
    finish(CreateBox(id(name), { width: size[0], height: size[1], depth: size[2] }, scene), mat, x, y, z, parent)
  const cylinder = (name: string, diameter: number, height: number, mat: StandardMaterial, x: number, y: number, z: number, parent?: TransformNode, top = diameter, sides = 8) =>
    finish(CreateCylinder(id(name), { diameterBottom: diameter, diameterTop: top, height, tessellation: sides }, scene), mat, x, y, z, parent)
  const stone = (name: string, scale: [number, number, number], mat: StandardMaterial, x: number, y: number, z: number, parent?: TransformNode) => {
    const mesh = finish(CreateIcoSphere(id(name), { radius: 1, subdivisions: 1, flat: true }, scene), mat, x, y, z, parent)
    mesh.scaling.set(...scale)
    return mesh
  }
  const castShadow = (mesh: Mesh) => { shadows.addShadowCaster(mesh); return mesh }
  // Small stationary accents are merged by material after construction.
  const detail = (mesh: Mesh) => {
    mesh.receiveShadows = false
    staticDetails.push(mesh)
    return mesh
  }
  const block = (mesh: Mesh) => {
    mesh.checkCollisions = true
    mesh.isPickable = true
    mesh.metadata = { cameraBlocker: true }
    blockers.push(mesh)
    return castShadow(mesh)
  }
  const cameraBlock = (mesh: Mesh) => {
    mesh.isPickable = true
    mesh.metadata = { cameraBlocker: true }
    blockers.push(mesh)
    return castShadow(mesh)
  }

  // The entire permitted rectangle lies on this continuous top surface.
  const outline = [[-16, -26], [-13.5, -31], [12, -31], [16, -26], [16, 29], [13.5, 37], [-13.5, 37], [-16, 29]] as const
  const islandLayer = (name: string, y: number, scale: number, mat: StandardMaterial) => {
    const positions = [0, y, 3]
    for (const [x, z] of outline) positions.push(x * scale, y, (z - 3) * scale + 3)
    const indices: number[] = []
    for (let i = 1; i <= outline.length; i++) indices.push(0, i === outline.length ? 1 : i + 1, i)
    const normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)
    const data = new VertexData()
    data.positions = positions
    data.indices = indices
    data.normals = normals
    const mesh = new Mesh(id(name), scene)
    data.applyToMesh(mesh)
    finish(mesh, mat, 0, 0, 0)
    return mesh
  }
  islandLayer('beach-outline', -0.3, 1.075, colors.sand)
  islandLayer('walkable-island', -0.035, 1, colors.grass)
  const water = box('ocean', [500, 0.2, 500], colors.water, 0, -0.95, 0)
  water.receiveShadows = false
  box('harbor-courtyard', [25, 0.035, 17], colors.sand, 0, -0.018, -21.5)
  box('forest-soil', [27, 0.025, 28], colors.forestFloor, 0, -0.015, 2)
  box('ruin-plaza', [20, 0.04, 17], colors.stone, 0, -0.009, 27)

  const path = [[0, -27], [0, -19], [-1.4, -12], [-1.8, -5], [0.7, 3], [0.8, 11], [0, 19], [0, 30]] as const
  path.slice(1).forEach(([x, z], index) => {
    const previous = path[index]
    if (!previous) return
    const [lastX, lastZ] = previous
    const length = Math.hypot(x - lastX, z - lastZ)
    const segment = box('trail', [3.8, 0.04, length + 0.4], colors.path, (x + lastX) / 2, 0.006, (z + lastZ) / 2)
    segment.rotation.y = Math.atan2(x - lastX, z - lastZ)
    const normalX = (z - lastZ) / length
    const normalZ = -(x - lastX) / length
    for (const fraction of [0.23, 0.76]) {
      for (const side of [-1, 1]) {
        const edge = detail(stone('trail-edge-stone', [0.2, 0.08, 0.43], colors.pathEdge,
          lastX + (x - lastX) * fraction + normalX * side * 1.92, 0.035,
          lastZ + (z - lastZ) * fraction + normalZ * side * 1.92))
        edge.rotation.y = segment.rotation.y + side * 0.17
      }
    }
    const joint = detail(box('trail-paving-joint', [3.2, 0.008, 0.035], colors.pathEdge, (x + lastX) / 2, 0.031, (z + lastZ) / 2))
    joint.rotation.y = segment.rotation.y
  })
  for (let index = 0; index < 22; index++) {
    const z = -28 + index * 2.9
    const side = index % 2 ? -1 : 1
    const rock = stone('coast-rock', [1.7 + (index % 3) * 0.4, 0.8, 2.1], colors.cliff, side * (15.3 + (index % 2) * 0.2), -0.25, z)
    rock.rotation.y = index * 1.3
    castShadow(rock)
  }
  for (let index = 0; index < 16; index++) {
    const side = index % 2 ? -1 : 1
    const ripple = box('water-ripple', [2.3 + index % 3, 0.02, 0.11], colors.foam, side * (18 + index % 4 * 2), -0.8, -27 + index * 4.5)
    ripple.rotation.y = index * 0.17
    animatedWater.push(ripple)
  }

  // Warm harbor architecture sits beside, rather than across, the route.
  const cabin = (x: number, z: number, angle: number) => {
    const root = new TransformNode(id('cabin'), scene)
    root.position.set(x, 0, z)
    root.rotation.y = angle
    block(box('cabin-walls', [4.3, 2.9, 3.7], colors.wall, 0, 1.45, 0, root))
    detail(box('cabin-stone-footing', [4.36, 0.32, 3.76], colors.darkStone, 0, 0.16, 0, root))
    detail(box('cabin-eaves', [4.66, 0.15, 4.12], colors.darkWood, 0, 2.89, 0, root))
    const roof = cylinder('cabin-roof', 6.3, 2.0, colors.roof, 0, 3.42, 0, root, 0, 4)
    roof.rotation.y = Math.PI / 4
    roof.scaling.z = 0.9
    cameraBlock(roof)
    box('door', [0.95, 1.95, 0.07], colors.darkWood, 0, 0.99, -1.88, root)
    detail(box('door-lintel', [1.16, 0.16, 0.15], colors.wood, 0, 2.03, -1.96, root))
    detail(box('door-inset', [0.71, 1.4, 0.03], colors.wood, 0, 1.12, -1.93, root))
    detail(stone('door-handle', [0.055, 0.055, 0.035], colors.brass, 0.27, 1.13, -1.97, root))
    for (const side of [-1, 1]) {
      detail(box('facade-timber', [0.16, 2.65, 0.14], colors.wood, side * 2.06, 1.54, -1.9, root))
      detail(box('door-post', [0.12, 1.97, 0.14], colors.wood, side * 0.53, 1, -1.96, root))
      box('window-frame', [0.75, 0.92, 0.1], colors.wood, side * 1.42, 1.6, -1.9, root)
      detail(box('warm-window', [0.54, 0.68, 0.12], colors.window, side * 1.42, 1.6, -1.92, root))
      detail(box('window-mullion', [0.06, 0.74, 0.15], colors.darkWood, side * 1.42, 1.6, -1.97, root))
      detail(box('window-crossbar', [0.62, 0.045, 0.15], colors.darkWood, side * 1.42, 1.6, -1.97, root))
      detail(box('window-sill', [0.9, 0.1, 0.29], colors.stone, side * 1.42, 1.1, -1.96, root))
      detail(box('window-shutter', [0.18, 0.83, 0.1], colors.cloakTeal, side * 1.91, 1.61, -1.91, root))
    }
    castShadow(box('chimney', [0.58, 2.1, 0.65], colors.darkStone, 1.2, 3.7, 0.3, root))
    box('doorstep', [1.5, 0.18, 0.55], colors.wood, 0, 0.09, -2.05, root)
  }
  cabin(-8, -21, -0.2)
  cabin(8.3, -17, 0.3)
  for (let index = 0; index < 9; index++) box('dock-plank', [3.3, 0.22, 0.62], colors.wood, 6, -0.25, -28.5 - index * 0.67)
  for (const x of [4.3, 7.7]) {
    for (const z of [-29, -33.7]) cylinder('dock-post', 0.26, 2.1, colors.darkWood, x, -0.35, z)
  }
  const boat = new TransformNode(id('boat'), scene)
  boat.position.set(10.3, -0.65, -31.4)
  boat.rotation.y = -0.25
  const hull = cylinder('boat-hull', 2.5, 0.6, colors.wood, 0, 0, 0, boat, 3.2, 6)
  hull.scaling.z = 1.8
  cylinder('boat-mast', 0.12, 4.1, colors.darkWood, 0, 1.8, 0, boat)
  const sail = box('boat-sail', [1.65, 2.1, 0.025], colors.ivory, 0.83, 2.3, 0, boat)
  sail.rotation.y = 0.2
  for (const [x, z] of [[-5.2, -22], [-6, -15], [7, -23]] as const) {
    const crate = block(box('supply-crate', [0.95, 0.9, 0.95], colors.wood, x, 0.45, z))
    crate.rotation.y = x * 0.12
    box('crate-band', [1.01, 0.11, 1.01], colors.darkWood, x, 0.65, z)
  }

  const lantern = (x: number, z: number) => {
    cylinder('lantern-post', 0.13, 2.2, colors.darkWood, x, 1.1, z)
    box('lantern-hook', [0.55, 0.1, 0.1], colors.darkWood, x + 0.2, 2.15, z)
    box('lantern-glass', [0.26, 0.4, 0.26], colors.gold, x + 0.4, 1.88, z)
    cylinder('lantern-cap', 0.46, 0.12, colors.darkWood, x + 0.4, 2.15, z, undefined, 0.2, 4)
  }
  lantern(-3.1, -19)
  lantern(3.2, -12)
  lantern(-3.5, 15.3)
  const banner = (x: number, z: number, mat: StandardMaterial) => {
    cylinder('banner-pole', 0.12, 3.4, colors.darkWood, x, 1.7, z)
    const cloth = box('banner-cloth', [0.93, 1.45, 0.04], mat, x + 0.48, 2.55, z)
    cloth.rotation.z = -0.05
    flags.push(cloth)
  }
  banner(3, -15, colors.ember)
  banner(-3.1, 21, colors.teal)

  // Small, separated conifers preserve the silhouette without enclosing the camera.
  const tree = (x: number, z: number, height: number, variant: number) => {
    block(cylinder('tree-trunk', 0.45, height * 0.65, colors.wood, x, height * 0.325, z))
    const lower = cylinder('pine-lower', height * 0.65, height * 0.62, variant % 2 ? colors.leaf : colors.leafLight, x, height * 0.66, z, undefined, 0.08, 6)
    const upper = cylinder('pine-upper', height * 0.5, height * 0.5, variant % 2 ? colors.leafLight : colors.leaf, x, height * 0.91, z, undefined, 0, 6)
    lower.rotation.y = variant
    upper.rotation.y = variant + 0.6
    // A foliage camera hit shortens the follow arm; the crown itself is not solid.
    for (const crown of [lower, upper]) cameraBlock(crown)
  }
  const trees = [[-10, -10], [-7.8, -8], [9.5, -7], [7.8, -3], [-10.8, -1], [-8, 3], [10.5, 4], [8, 8], [-10, 10], [-7.6, 13], [10.5, 14], [12, -13], [-12, -16], [12, 23], [-12, 25]] as const
  trees.forEach(([x, z], index) => tree(x, z, 4.1 + (index % 4) * 0.65, index))
  for (let index = 0; index < 16; index++) {
    const side = index % 2 ? -1 : 1
    const x = side * (3.4 + index % 3 * 0.8)
    const z = -11 + index * 1.7
    for (const lean of [-1, 1]) {
      const blade = detail(cylinder('wild-grass', 0.2, 0.34 + index % 3 * 0.07, colors.leafLight,
        x + lean * 0.08, 0.15, z, undefined, 0, 3))
      blade.rotation.z = lean * 0.27
    }
  }
  for (let index = 0; index < 28; index++) {
    const side = index % 2 ? -1 : 1
    const x = side * (5.8 + (index % 5) * 1.5)
    const z = -12 + index * 0.93
    const bush = stone('forest-shrub', [0.6, 0.36, 0.54], index % 3 ? colors.leafLight : colors.leaf, x, 0.22, z)
    bush.rotation.y = index
  }
  for (const [x, z, size] of [[-10, -4, 1.4], [10, 0, 1.6], [-9, 7, 1.5], [10, 11, 1.9], [-11, 18, 2.5], [11, 18, 2.5]] as const) {
    const rock = block(stone('trail-boulder', [size, size * 0.7, size * 1.2], colors.darkStone, x, size * 0.45, z))
    rock.rotation.y = z * 0.25
  }

  // The luminous seal reaches both island edges, so it cannot be bypassed.
  for (const x of [-4.1, 4.1]) {
    block(box('gate-pillar', [1.2, 4.6, 1.45], colors.darkStone, x, 2.3, WORLD.gate.z))
    castShadow(box('gate-cap', [1.7, 0.4, 1.8], colors.stone, x, 4.7, WORLD.gate.z))
    box('gate-inlay', [0.13, 3.2, 0.04], colors.teal, x, 2.6, WORLD.gate.z - 0.74)
  }
  cameraBlock(box('gate-lintel', [9.3, 0.9, 1.55], colors.darkStone, 0, 4.6, WORLD.gate.z))
  const sealMaterial = material('wind-seal', '#64cfb1', 0.7, 0.27)
  sealMaterial.backFaceCulling = false
  const gate = block(box('closed-wind-seal', [26, 3.8, 0.5], sealMaterial, 0, 1.9, WORLD.gate.z))
  gate.receiveShadows = false
  shadows.removeShadowCaster(gate)
  const gateRunes: Mesh[] = []
  for (const x of [-10, -7, -2.3, 0, 2.3, 7, 10]) {
    const rune = box('wind-rune', [0.42, 0.42, 0.08], colors.teal, x, 1.7, WORLD.gate.z - 0.3)
    rune.rotation.z = Math.PI / 4
    gateRunes.push(rune)
  }
  const openPath: Mesh[] = []
  for (let index = 0; index < 5; index++) openPath.push(box('awakened-path', [2.8, 0.03, 0.2], colors.teal, 0, 0.06, 16 + index * 1.3))

  // Broken columns frame the destination and leave a clear central approach.
  for (const [x, z, height] of [[-6, 23, 3.6], [6, 23, 4.5], [-6, 30, 4.5], [6, 30, 2.8], [-4, 34, 3.6], [4, 34, 3.6]] as const) {
    block(cylinder('ruin-column', 1.1, height, colors.stone, x, height / 2, z, undefined, 0.95, 6))
    cylinder('column-base', 1.7, 0.28, colors.darkStone, x, 0.14, z, undefined, 1.7, 6)
    cylinder('column-capital', 1.65, 0.35, colors.stone, x, height, z, undefined, 1.65, 6)
    box('column-inlay', [0.14, height * 0.55, 0.05], colors.teal, x, height * 0.58, z - 0.56)
  }
  block(box('ruin-back-wall', [13.5, 1.7, 1], colors.darkStone, 0, 0.85, 35))
  castShadow(box('ruin-crown', [9.3, 0.5, 1.4], colors.stone, 0, 3.7, 34))
  for (const [x, z] of [[-8, 28], [8.5, 26], [-8.5, 33], [8, 33]] as const) {
    const rubble = block(stone('ruin-rubble', [1.2, 0.7, 1.1], colors.stone, x, 0.5, z))
    rubble.rotation.y = z
  }
  cylinder('relic-dais', 4.5, 0.09, colors.darkStone, 0, 0.015, WORLD.relic.z, undefined, 4.5, 12)
  const relicRing = finish(CreateTorus(id('relic-ring'), { diameter: 3.5, thickness: 0.07, tessellation: 36 }, scene), colors.teal, 0, 0.085, WORLD.relic.z)
  relicRing.receiveShadows = false

  const cloak = (mat: StandardMaterial, body: TransformNode) => {
    // Three folded panels produce a cloth silhouette without a rectangular slab.
    const positions = [
      -0.28, 0, -0.06, 0, 0.035, -0.14, 0.28, 0, -0.06,
      -0.37, -0.43, -0.16, 0, -0.41, -0.28, 0.37, -0.43, -0.16,
      -0.46, -0.85, -0.23, 0, -0.96, -0.37, 0.46, -0.85, -0.23,
    ]
    const indices = [0, 1, 3, 1, 4, 3, 1, 2, 4, 2, 5, 4, 3, 4, 6, 4, 7, 6, 4, 5, 7, 5, 8, 7]
    const normals: number[] = []
    VertexData.ComputeNormals(positions, indices, normals)
    const data = new VertexData()
    data.positions = positions
    data.indices = indices
    data.normals = normals
    const cape = new Mesh(id('folded-cloak'), scene)
    data.applyToMesh(cape)
    mat.backFaceCulling = false
    finish(cape, mat, 0, 1.52, -0.2, body)
    return castShadow(cape)
  }
  const createPerson = (name: string, capeMat: StandardMaterial, guide = false) => {
    const root = new TransformNode(id(name), scene)
    const body = new TransformNode(id(`${name}-body`), scene)
    body.parent = root
    const coat = guide ? colors.leather : colors.outfit
    castShadow(cylinder('coat-body', 0.65, 0.73, coat, 0, 1.12, 0, body, 0.52, 8))
    const head = castShadow(stone('head', [0.255, 0.3, 0.235], colors.skin, 0, 1.8, 0.055, body))
    cylinder('neck', 0.2, 0.18, colors.skin, 0, 1.54, 0.025, body, 0.19, 8)
    const hair = finish(CreateSphere(id('hair-cap'), { diameter: 0.55, segments: 8, slice: 0.55 }, scene), colors.darkWood, 0, 1.89, 0.025, body)
    castShadow(hair)
    const cape = cloak(capeMat, body)
    cape.rotation.x = -0.15
    cylinder('cloak-mantle', 0.84, 0.2, capeMat, 0, 1.45, -0.015, body, 0.43, 8)
    cylinder('raised-collar', 0.35, 0.16, capeMat, 0, 1.57, 0, body, 0.32, 8)
    cylinder('leather-belt', 0.66, 0.105, colors.darkWood, 0, 0.94, 0, body, 0.64, 8)
    box('belt-buckle', [0.11, 0.1, 0.025], colors.brass, 0, 0.94, 0.335, body)
    stone('cloak-clasp', [0.055, 0.055, 0.025], colors.brass, 0, 1.47, 0.31, body)
    castShadow(stone('leather-backpack', [0.24, 0.31, 0.16], colors.leather, 0, 1.19, -0.45, body))
    box('pack-flap', [0.35, 0.17, 0.04], colors.wood, 0, 1.32, -0.592, body)
    box('pack-buckle', [0.065, 0.095, 0.025], colors.brass, 0, 1.2, -0.607, body)
    const bedroll = cylinder('rolled-travel-blanket', 0.22, 0.63, colors.trousers, 0, 1.48, -0.46, body, 0.22, 8)
    bedroll.rotation.z = Math.PI / 2
    const limbs: TransformNode[] = []
    for (const side of [-1, 1]) {
      const strap = box('pack-strap', [0.045, 0.37, 0.03], colors.darkWood, side * 0.13, 1.24, -0.586, body)
      strap.rotation.z = side * 0.08
      stone('ear', [0.055, 0.085, 0.045], colors.skin, side * 0.25, 1.8, 0.02, body)
      const leg = new TransformNode(id('leg-pivot'), scene)
      leg.parent = body
      leg.position.set(side * 0.19, 0.78, 0)
      castShadow(cylinder('trouser', 0.23, 0.47, colors.trousers, 0, -0.23, 0, leg, 0.27, 6))
      cylinder('boot-cuff', 0.265, 0.14, colors.leather, 0, -0.46, 0, leg, 0.285, 8)
      castShadow(stone('travel-boot', [0.15, 0.17, 0.235], colors.darkWood, 0, -0.63, 0.07, leg))
      box('boot-sole', [0.27, 0.055, 0.37], colors.darkWood, 0, -0.746, 0.06, leg)
      limbs.push(leg)
      const arm = new TransformNode(id('arm-pivot'), scene)
      arm.parent = body
      arm.position.set(side * 0.37, 1.47, 0)
      stone('round-shoulder', [0.16, 0.17, 0.17], capeMat, 0, -0.06, 0, arm)
      castShadow(cylinder('sleeve', 0.19, 0.43, coat, 0, -0.27, 0, arm, 0.24, 6))
      cylinder('wrist-cuff', 0.205, 0.07, colors.leather, 0, -0.47, 0, arm, 0.205, 8)
      stone('hand', [0.095, 0.12, 0.105], colors.skin, 0, -0.57, 0, arm)
      limbs.push(arm)
    }
    if (guide) {
      cylinder('guide-hat-brim', 0.88, 0.07, colors.sand, 0, 2.05, 0, body, 0.88, 10)
      cylinder('guide-hat-top', 0.52, 0.29, colors.sand, 0, 2.23, 0, body, 0.35, 8)
      cylinder('guide-hat-ribbon', 0.51, 0.07, colors.cloakTeal, 0, 2.13, 0, body, 0.485, 8)
      const feather = stone('guide-hat-feather', [0.065, 0.23, 0.025], colors.ivory, 0.23, 2.34, -0.07, body)
      feather.rotation.z = -0.35
      cylinder('guide-lantern-staff', 0.07, 1.8, colors.wood, -0.61, 0.9, 0.12, body, 0.07, 6)
      cylinder('guide-staff-light', 0.16, 0.23, colors.window, -0.61, 1.82, 0.12, body, 0.16, 6)
      stone('guide-satchel', [0.19, 0.23, 0.12], colors.leather, 0.37, 0.8, 0.05, body)
    }
    // Eyes face +Z, matching the engine's yaw convention.
    for (const side of [-1, 1]) box('eye', [0.045, 0.04, 0.025], colors.darkWood, side * 0.095, 1.83, 0.276, body)
    stone('nose', [0.045, 0.055, 0.055], colors.skin, 0, 1.77, 0.28, body)
    return { root, body, head, cape, limbs }
  }
  const explorer = createPerson('explorer', colors.ember)
  explorer.root.position.set(WORLD.spawn.x, 0, WORLD.spawn.z)
  const guide = createPerson('harbor-guide', colors.cloakTeal, true)
  guide.root.position.set(WORLD.guide.x, 0, WORLD.guide.z)
  guide.root.rotation.y = Math.PI
  finish(CreateTorus(id('guide-circle'), { diameter: 1.5, thickness: 0.055, tessellation: 24 }, scene), colors.gold, 0, 0.055, 0, guide.root)
  const herbalist = createPerson('herbalist-fern', colors.cloakHerbalist)
  herbalist.root.position.set(-7, 0, -4)
  const basket = cylinder('herb-basket', 0.31, 0.4, colors.wood, -0.42, 0.84, 0.06, herbalist.body, 0.45, 8)
  basket.rotation.z = -0.1
  for (const side of [-1, 0, 1]) {
    stone('gathered-herbs', [0.09, 0.15, 0.08], colors.leafLight, -0.42 + side * 0.08, 1.09, 0.06, herbalist.body)
  }
  cylinder('herbalist-headband', 0.535, 0.09, colors.cloakHerbalist, 0, 1.95, 0.025, herbalist.body, 0.535, 8)
  const scout = createPerson('scout-loan', colors.cloakScout)
  scout.root.position.set(7, 0, 5)
  const mapCase = cylinder('scout-map-case', 0.19, 0.46, colors.leather, 0.4, 0.95, -0.02, scout.body, 0.19, 8)
  mapCase.rotation.z = -0.25
  cylinder('scout-walking-staff', 0.065, 1.7, colors.darkWood, 0.64, 0.85, 0.12, scout.body, 0.065, 6)
  stone('scout-compass', [0.075, 0.075, 0.025], colors.brass, -0.16, 1.2, 0.29, scout.body)
  const people = { guide, herbalist, scout }
  const personIds = ['guide', 'herbalist', 'scout'] as const
  const actorCollider = (name: string, actor: TransformNode, diameter: number, height: number) => {
    const proxy = CreateCylinder(id(name), { diameter, height, tessellation: 8 }, scene)
    proxy.parent = actor
    proxy.position.y = height / 2
    proxy.isVisible = false
    proxy.isPickable = false
    proxy.checkCollisions = true
    proxy.metadata = { cameraBlocker: false }
    // Physical collision uses scene meshes; leave the follow-camera blocker set unchanged.
    return proxy
  }
  for (const npcId of personIds) actorCollider(`${npcId}-collision`, people[npcId].root, 0.65, 1.85)

  const enemy = new TransformNode(id('stone-sentinel'), scene)
  enemy.position.set(WORLD.enemy.x, 0, WORLD.enemy.z)
  const enemyCollider = actorCollider('sentinel-collision', enemy, 1.35, 2.6)
  const sentinelTorso = castShadow(stone('sentinel-torso', [0.85, 0.92, 0.54], colors.darkStone, 0, 1.42, 0, enemy))
  castShadow(stone('sentinel-head', [0.47, 0.44, 0.42], colors.stone, 0, 2.52, 0, enemy))
  const sentinelEye = box('sentinel-eye', [0.56, 0.13, 0.09], colors.red, 0, 2.57, -0.43, enemy)
  for (const side of [-1, 1]) {
    castShadow(stone('sentinel-shoulder', [0.4, 0.43, 0.4], colors.stone, side * 0.88, 2, 0, enemy))
    castShadow(stone('sentinel-arm', [0.29, 0.72, 0.3], colors.darkStone, side * 1.02, 1.12, 0, enemy))
    castShadow(box('sentinel-leg', [0.49, 0.65, 0.6], colors.stone, side * 0.4, 0.34, 0, enemy))
  }
  box('sentinel-chest-rune', [0.18, 0.62, 0.08], colors.red, 0, 1.55, -0.53, enemy)
  const enemyRing = finish(CreateTorus(id('encounter-ring'), { diameter: 4.1, thickness: 0.06, tessellation: 32 }, scene), colors.roof, WORLD.enemy.x, 0.05, WORLD.enemy.z)

  const seedMeshes: Mesh[] = []
  const seeds = WORLD.seeds.map((position, index) => {
    const root = new TransformNode(id('light-seed'), scene)
    root.position.set(position.x, 0, position.z)
    cylinder('seed-plinth', 1.2, 0.16, colors.darkStone, 0, 0.08, 0, root, 1.05, 6)
    const crystal = stone('golden-seed', [0.3, 0.48, 0.3], colors.gold, 0, 0.95, 0, root)
    crystal.rotation.z = 0.2
    seedMeshes.push(crystal)
    const halo = finish(CreateTorus(id('seed-halo'), { diameter: 0.9, thickness: 0.035, tessellation: 20 }, scene), colors.gold, 0, 0.3, 0, root)
    halo.rotation.x = Math.PI / 4
    halo.rotation.z = index
    return root
  })
  const relic = new TransformNode(id('tide-relic'), scene)
  relic.position.set(WORLD.relic.x, 0, WORLD.relic.z)
  const relicCrystal = stone('tide-crystal', [0.63, 1.1, 0.63], colors.teal, 0, 1.65, 0, relic)
  for (let index = 0; index < 3; index++) {
    const orbit = finish(CreateTorus(id('relic-orbit'), { diameter: 2.25, thickness: 0.06, tessellation: 36 }, scene), colors.gold, 0, 1.6, 0, relic)
    orbit.rotation.x = index * Math.PI / 3
    orbit.rotation.z = 0.4
  }

  const marker = new TransformNode(id('objective-marker'), scene)
  const markerGem = cylinder('objective-pointer', 0.55, 0.72, colors.gold, 0, 3.8, 0, marker, 0, 4)
  markerGem.rotation.x = Math.PI
  markerGem.rotation.y = Math.PI / 4
  const markerRing = finish(CreateTorus(id('objective-ring'), { diameter: 1.7, thickness: 0.045, tessellation: 24 }, scene), colors.gold, 0, 0.06, 0, marker)
  for (let index = 0; index < 14; index++) {
    const mote = stone('forest-mote', [0.035, 0.035, 0.035], index % 3 ? colors.gold : colors.teal, Math.sin(index * 7) * 6, 1.4 + index % 3, -8 + index * 2.2)
    mote.receiveShadows = false
    motes.push(mote)
  }
  const sunDisc = finish(CreateSphere(id('distant-sun'), { diameter: 11, segments: 12 }, scene), material('sun-disc', '#ffe2a2', 1), -40, 30, 90)
  sunDisc.receiveShadows = false
  const distantMat = material('distant-islands', '#9da995')
  for (const [x, z, width, height] of [[-48, 45, 26, 8], [45, 68, 33, 12], [-55, -40, 25, 6]] as const) {
    cylinder('distant-island', width, height, distantMat, x, height / 2 - 3, z, undefined, 0, 5)
  }

  const detailGroups = new Map<StandardMaterial, Mesh[]>()
  for (const mesh of staticDetails) {
    const mat = mesh.material
    if (!(mat instanceof StandardMaterial)) continue
    mesh.computeWorldMatrix(true)
    const group = detailGroups.get(mat) ?? []
    group.push(mesh)
    detailGroups.set(mat, group)
  }
  for (const [mat, meshes] of detailGroups) {
    const merged = Mesh.MergeMeshes(meshes, true, true)
    if (!merged) continue
    merged.name = id('static-detail-batch')
    merged.material = mat
    merged.isPickable = false
    merged.receiveShadows = false
  }

  let lastEnemyHp = 100
  let hitUntil = -1
  let lastTime = 0
  let npcPositionsInitialized = false
  let npcRunId = ''
  return {
    blockers,
    player: explorer.root,
    enemy,
    seeds,
    gate,
    relic,
    marker,
    animate(time, state, moving) {
      const delta = Math.min(0.05, Math.max(0, time - lastTime))
      lastTime = time
      if (npcRunId !== state.runId) {
        npcPositionsInitialized = false
        npcRunId = state.runId
      }
      const step = moving ? Math.sin(time * 11) * 0.62 : 0
      explorer.limbs.forEach((limb, index) => { limb.rotation.x = step * ([1, -0.7, -1, 0.7][index] ?? 0) })
      explorer.body.position.y = moving ? Math.abs(Math.sin(time * 11)) * 0.07 : Math.sin(time * 2) * 0.018
      explorer.cape.rotation.x = -0.15 - (moving ? 0.16 : 0) + Math.sin(time * 5) * 0.025
      for (const npcId of personIds) {
        const npc = getNpc(state, npcId)
        const person = people[npcId]
        const dx = npc.position.x - person.root.position.x
        const dz = npc.position.z - person.root.position.z
        const walking = Math.hypot(dx, dz) > 0.015
        if (!npcPositionsInitialized) person.root.position.set(npc.position.x, 0, npc.position.z)
        else {
          const blend = 1 - Math.exp(-delta * 8)
          person.root.position.x += dx * blend
          person.root.position.z += dz * blend
        }
        if (walking) {
          const targetYaw = Math.atan2(dx, dz)
          const turn = Math.atan2(Math.sin(targetYaw - person.root.rotation.y), Math.cos(targetYaw - person.root.rotation.y))
          person.root.rotation.y += turn * Math.min(1, delta * 8)
        }
        const npcStep = walking ? Math.sin(time * 8) * 0.38 : 0
        person.limbs.forEach((limb, index) => { limb.rotation.x = npcStep * ([1, -0.6, -1, 0.6][index] ?? 0) })
        person.body.position.y = walking ? Math.abs(Math.sin(time * 8)) * 0.04 : Math.sin(time * 1.7) * 0.018
        person.head.rotation.x = !walking && (npc.goal === 'gather' || npc.goal === 'study') ? 0.15 : 0
        person.head.rotation.y = walking ? 0 : Math.sin(time * 0.7) * 0.08
        person.body.rotation.x = !walking && npc.goal === 'gather' ? 0.14 : 0
        person.cape.rotation.x = -0.15 - (walking ? 0.1 : 0) + Math.sin(time * 3) * 0.025
      }
      npcPositionsInitialized = true
      const sentinel = getNpc(state, 'sentinel')
      enemy.position.x = sentinel.position.x
      enemy.position.z = sentinel.position.z
      enemyRing.position.x = sentinel.position.x
      enemyRing.position.z = sentinel.position.z
      if (state.enemyHp < lastEnemyHp) hitUntil = time + 0.24
      lastEnemyHp = state.enemyHp
      enemy.setEnabled(state.enemyHp > 0)
      enemyCollider.checkCollisions = state.enemyHp > 0
      enemyRing.setEnabled(state.enemyHp > 0)
      sentinelTorso.position.y = 1.42 + Math.sin(time * 2.4) * 0.06
      sentinelEye.scaling.x = time < hitUntil ? 1.45 : 1 + Math.sin(time * 3) * 0.08
      sentinelTorso.rotation.z = time < hitUntil ? Math.sin(time * 50) * 0.14 : 0
      seeds.forEach((seed, index) => {
        seed.setEnabled(!state.seeds.includes(index))
        const crystal = seedMeshes[index]
        if (crystal) {
          crystal.position.y = 0.95 + Math.sin(time * 2.1 + index) * 0.14
          crystal.rotation.y += delta * 0.75
        }
      })
      gate.setEnabled(!state.bridgeOpen)
      gate.checkCollisions = !state.bridgeOpen
      gate.isPickable = !state.bridgeOpen
      gateRunes.forEach((rune, index) => {
        rune.setEnabled(!state.bridgeOpen)
        rune.position.y = 1.7 + Math.sin(time * 1.7 + index) * 0.18
      })
      openPath.forEach((tile) => tile.setEnabled(state.bridgeOpen))
      relic.setEnabled(!state.relic)
      relicCrystal.position.y = 1.65 + Math.sin(time * 1.5) * 0.2
      relic.rotation.y += delta * 0.35
      markerGem.position.y = 3.65 + Math.sin(time * 2.8) * 0.18
      markerRing.scaling.setAll(1 + Math.sin(time * 2.8) * 0.06)
      marker.setEnabled(state.stage !== 'complete')
      boat.position.y = -0.65 + Math.sin(time * 0.8) * 0.07
      boat.rotation.z = Math.sin(time * 0.65) * 0.025
      animatedWater.forEach((ripple, index) => { ripple.position.y = -0.8 + Math.sin(time * 0.8 + index) * 0.025 })
      flags.forEach((flag, index) => { flag.rotation.y = Math.sin(time * 2 + index) * 0.12 })
      motes.forEach((mote, index) => {
        mote.position.y = 1.4 + index % 3 + Math.sin(time * 0.8 + index) * 0.25
        mote.visibility = 0.35 + (Math.sin(time + index) + 1) * 0.3
      })
    },
    dispose() { shadows.dispose() },
  }
}
