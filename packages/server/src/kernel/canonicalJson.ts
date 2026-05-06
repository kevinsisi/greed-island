import { createHash } from 'node:crypto'

export type JsonPrimitive = string | number | boolean | null
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

export function toCanonicalValue(value: unknown, path = '$'): JsonValue {
  if (value === null) {
    return null
  }

  if (typeof value === 'string' || typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Non-finite number is not canonical JSON at ${path}`)
    }
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item, index) => toCanonicalValue(item, `${path}[${index}]`))
  }

  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`Only plain objects can be canonical JSON at ${path}`)
    }

    const record = value as Record<string, unknown>
    const canonicalObject: Record<string, JsonValue> = {}
    for (const key of Object.keys(record).sort()) {
      const child = record[key]
      if (child === undefined) {
        throw new TypeError(`Undefined is not canonical JSON at ${path}.${key}`)
      }
      canonicalObject[key] = toCanonicalValue(child, `${path}.${key}`)
    }
    return canonicalObject
  }

  throw new TypeError(`Unsupported canonical JSON value at ${path}`)
}

export function toCanonicalJson(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value))
}

export function hashCanonicalJson(value: unknown): string {
  return createHash('sha256').update(toCanonicalJson(value)).digest('hex')
}

export function cloneCanonical<T>(value: T): T {
  return JSON.parse(toCanonicalJson(value)) as T
}
