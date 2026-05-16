export type SettlementStatus = 'stable' | 'strained' | 'declining' | 'recovering'

export type SettlementPressure = Readonly<{
  food: number
  safety: number
  economy: number
  logistics: number
}>

export type SettlementStorageItem = Readonly<{
  goodsId: string
  quantity: number
}>

export type SettlementRow = Readonly<{
  id: string
  tileId: string
  formedAtTick: number
  founderNpcIds: readonly string[]
  populationNpcIds: readonly string[]
  storage: readonly SettlementStorageItem[]
  pressure: SettlementPressure
  stability: number
  status: SettlementStatus
  updatedAtTick: number
}>

export function readSettlementRows(facts: Record<string, unknown>): SettlementRow[] {
  const raw = facts.settlements
  if (!Array.isArray(raw)) return []
  return raw.filter(isSettlementRow).sort(
    (a, b) =>
      a.status.localeCompare(b.status) ||
      a.tileId.localeCompare(b.tileId) ||
      a.id.localeCompare(b.id)
  )
}

export function settlementStorageTotal(row: SettlementRow): number {
  return row.storage.reduce((sum, item) => sum + item.quantity, 0)
}

function isSettlementRow(value: unknown): value is SettlementRow {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<SettlementRow>
  return (
    typeof row.id === 'string' &&
    typeof row.tileId === 'string' &&
    typeof row.formedAtTick === 'number' &&
    Array.isArray(row.founderNpcIds) && row.founderNpcIds.every((id) => typeof id === 'string') &&
    Array.isArray(row.populationNpcIds) && row.populationNpcIds.every((id) => typeof id === 'string') &&
    Array.isArray(row.storage) && row.storage.every(isSettlementStorageItem) &&
    isSettlementPressure(row.pressure) &&
    typeof row.stability === 'number' &&
    isSettlementStatus(row.status) &&
    typeof row.updatedAtTick === 'number'
  )
}

function isSettlementStorageItem(value: unknown): value is SettlementStorageItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<SettlementStorageItem>
  return typeof item.goodsId === 'string' && typeof item.quantity === 'number'
}

function isSettlementPressure(value: unknown): value is SettlementPressure {
  if (!value || typeof value !== 'object') return false
  const pressure = value as Partial<SettlementPressure>
  return (
    typeof pressure.food === 'number' &&
    typeof pressure.safety === 'number' &&
    typeof pressure.economy === 'number' &&
    typeof pressure.logistics === 'number'
  )
}

function isSettlementStatus(value: unknown): value is SettlementStatus {
  return value === 'stable' || value === 'strained' || value === 'declining' || value === 'recovering'
}
