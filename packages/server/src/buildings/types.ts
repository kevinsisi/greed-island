// Building data + interior types — Living World v0.10.0.

export type BuildingType =
  | 'residential'
  | 'shop'
  | 'restaurant'
  | 'office'
  | 'factory'
  | 'library'
  | 'exchange'
  | 'temple'
  | 'landmark'
  | 'construction'

export type Shift = 'morning' | 'afternoon' | 'night'

export type BuildingPlacement = Readonly<{
  col: number
  row: number
  glyph: string
  size: number
}>

export type InteriorProp = Readonly<{
  col: number
  row: number
  glyph: string
  size?: number
  label?: string
}>

export type InteriorLayout = Readonly<{
  cols: number
  rows: number
  props: readonly InteriorProp[]
  backgroundColor?: number
}>

export type BuildingHiringSlot = Readonly<{
  shift: Shift
  capacity: number
  wage: number
  taskZh: string
}>

export type BuildingDef = Readonly<{
  id: string
  tileId: string
  nameZh: string
  nameEn: string
  descriptionZh: string
  type: BuildingType
  placement: BuildingPlacement
  interior: InteriorLayout
  ownerNpcId: string | null
  hiring: readonly BuildingHiringSlot[]
  enterable: boolean
  restorative: boolean
}>

export type BuildingOccupant = Readonly<{
  npcId: string
  shift: Shift | null
  isOwner: boolean
}>

export type BuildingRuntimeView = Readonly<{
  def: BuildingDef
  occupants: readonly BuildingOccupant[]
}>

export type PlayerJobRecord = Readonly<{
  accountId: number
  buildingId: string
  shift: Shift
  hiredAtTick: number
  totalEarnings: number
  shiftsCompleted: number
  lastShiftTick: number
}>

export const REST_RESTORATION = 25
