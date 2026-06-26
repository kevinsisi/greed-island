import { describe, expect, it, vi } from 'vitest'
import { createSingleFlight } from './singleFlight'

describe('createSingleFlight', () => {
  it('reuses an in-flight task instead of starting overlapping work', async () => {
    let resolveTask!: (value: string) => void
    const task = vi.fn(() => new Promise<string>((resolve) => {
      resolveTask = resolve
    }))
    const singleFlight = createSingleFlight<string>()

    const first = singleFlight.run(task)
    const second = singleFlight.run(task)
    resolveTask('ok')

    await expect(first).resolves.toBe('ok')
    await expect(second).resolves.toBe('ok')
    expect(task).toHaveBeenCalledTimes(1)
  })

  it('allows a new task after the previous one settles', async () => {
    const task = vi.fn<() => Promise<string>>()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second')
    const singleFlight = createSingleFlight<string>()

    await expect(singleFlight.run(task)).resolves.toBe('first')
    await expect(singleFlight.run(task)).resolves.toBe('second')
    expect(task).toHaveBeenCalledTimes(2)
  })
})
