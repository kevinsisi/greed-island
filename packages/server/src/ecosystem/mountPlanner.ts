export type MountAssignmentIntent = Readonly<{
  type: 'MOUNT_ASSIGNED'
  animalId: string
  npcId: string
  settlementId: string
  tick: number
}>

export type MountEligibleAnimal = Readonly<{
  animalId: string
  speciesId: string
  mountEligible: boolean
  mountedBy: string | null
  role: string
}>

export type UnmountedNpc = Readonly<{
  npcId: string
  mountedAnimalId: string | null
}>

export type MountAssignmentInput = Readonly<{
  tick: number
  settlementId: string
  livestock: readonly MountEligibleAnimal[]
  npcs: readonly UnmountedNpc[]
}>

export function planMountAssignment(input: MountAssignmentInput): readonly MountAssignmentIntent[] {
  const { tick, settlementId, livestock, npcs } = input

  const availableMounts = livestock.filter(
    (a) => a.mountEligible && a.mountedBy === null && a.role === 'livestock'
  )
  const unmountedNpcs = npcs.filter((n) => n.mountedAnimalId === null)

  const intents: MountAssignmentIntent[] = []
  const assignedAnimals = new Set<string>()

  for (const npc of unmountedNpcs) {
    const mount = availableMounts.find((a) => !assignedAnimals.has(a.animalId))
    if (!mount) break
    assignedAnimals.add(mount.animalId)
    intents.push({ type: 'MOUNT_ASSIGNED', animalId: mount.animalId, npcId: npc.npcId, settlementId, tick })
  }

  return intents
}
