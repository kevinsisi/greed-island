import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseWalletResponse } from '../api/wallet'
import { WalletSpendButton, WalletStatus } from '../components/game/WalletStatus'
import { canSpendWallet, createWalletReader, loadingWallet, walletReadState, type WalletReadState } from './walletRead'
import type { ServerWalletResponse } from '../api/client'

const uninitialized = (): ServerWalletResponse => ({ wallet: null, walletInitialized: false, jobs: [], currentTick: 7, currentShift: null })
const initialized = (gold = 73): ServerWalletResponse => ({ wallet: { accountId: 1, gold, energy: 48, updatedAt: 10 }, walletInitialized: true, jobs: [], currentTick: 7, currentShift: 'morning' })
afterEach(() => vi.useRealTimers())
describe('same-account nullable wallet boundary', () => {
  it('keeps explicit absence null and existing balances exact', () => {
    expect(parseWalletResponse(uninitialized(), 1)).toEqual(uninitialized())
    expect(parseWalletResponse(initialized(), 1)).toEqual(initialized())
    const read = walletReadState(uninitialized())
    expect(read.status).toBe('uninitialized'); expect(read.response?.wallet).toBeNull()
  })
  it('fails closed for absent flag, contradictory null/initialized values and invalid own fields', () => {
    for (const value of [{ ...uninitialized(), walletInitialized: undefined }, { ...uninitialized(), walletInitialized: true },
      { ...initialized(), walletInitialized: false }, { ...initialized(), wallet: { ...initialized().wallet, gold: -1 } },
      { ...initialized(), wallet: { ...initialized().wallet, energy: 101 } }, { ...uninitialized(), jobs: [{ accountId: 2 }] },
      { ...uninitialized(), currentTick: -1 }, { ...uninitialized(), currentShift: ['morning'] }]) expect(() => parseWalletResponse(value, 1)).toThrow()
    expect(() => parseWalletResponse({ ...initialized(), wallet: { ...initialized().wallet, accountId: 2 } }, 1)).toThrow('context changed')
  })
  it('renders unavailable/uninitialized status and disables purchase without pretending a zero balance', () => {
    for (const read of [loadingWallet(), { status: 'unavailable', response: null } as const, walletReadState(uninitialized())]) {
      expect(canSpendWallet(read, 10)).toBe(false)
      const html = renderToStaticMarkup(<><WalletStatus read={read} /><WalletSpendButton read={read} amount={10} busy={false} onClick={() => {}} className="">進食</WalletSpendButton></>)
      expect(html).toContain('disabled=""'); expect(html).not.toContain('0 潮幣'); expect(html).not.toContain('100/100')
    }
    expect(renderToStaticMarkup(<WalletStatus read={walletReadState(uninitialized())} locale="en" />)).toContain('not initialized')
    const ready = walletReadState(initialized(73))
    expect(renderToStaticMarkup(<WalletStatus read={ready} />)).toContain('73 潮幣 · 體力 48/100')
    expect(renderToStaticMarkup(<WalletSpendButton read={ready} amount={10} busy={false} onClick={() => {}} className="">進食</WalletSpendButton>)).not.toContain('disabled=""')
    expect(canSpendWallet(walletReadState(initialized(9)), 10)).toBe(false)
    expect(canSpendWallet(walletReadState(initialized(10)), 10)).toBe(true)
    expect(canSpendWallet(ready, -1)).toBe(false)
  })
  it('single-flights reads, does not initialize absent state, and clears prior balances on failure', async () => {
    let resolve!: (value: ServerWalletResponse) => void
    const onChange = vi.fn(), load = vi.fn(() => new Promise<ServerWalletResponse>(done => { resolve = done }))
    const reader = createWalletReader({ owner: { epoch: 1, accountId: 1 }, isCurrent: () => true, load, onChange })
    const first = reader.refresh(), repeated = reader.refresh()
    expect(first).toBe(repeated); expect(load).toHaveBeenCalledOnce()
    resolve(uninitialized()); await first
    expect(onChange).toHaveBeenLastCalledWith(walletReadState(uninitialized()))
    load.mockImplementationOnce(async () => initialized()); await reader.refresh()
    expect(onChange).toHaveBeenLastCalledWith(walletReadState(initialized()))
    load.mockImplementationOnce(async () => { throw new Error('offline') }); await reader.refresh()
    expect(onChange).toHaveBeenLastCalledWith({ status: 'unavailable', response: null })
    reader.dispose()
  })
  it.each(['replacement', 'same-account-new-epoch', 'logout', 'unmount'])('ignores an old wallet response after %s', async kind => {
    let current = { epoch: 1, accountId: 1 as number | null }, resolve!: (value: ServerWalletResponse) => void
    const changes: WalletReadState[] = []
    const reader = createWalletReader({ owner: { epoch: 1, accountId: 1 }, isCurrent: owner => owner.epoch === current.epoch && owner.accountId === current.accountId,
      load: () => new Promise(done => { resolve = done }), onChange: value => changes.push(value) })
    const pending = reader.refresh()
    if (kind === 'unmount') reader.dispose()
    else current = { epoch: 2, accountId: kind === 'logout' ? null : kind === 'replacement' ? 2 : 1 }
    resolve(initialized()); await pending
    expect(changes).toEqual([]); reader.dispose()
  })
  it('bounds an inconclusive read, disables purchases, and ignores its eventual obsolete response', async () => {
    vi.useFakeTimers()
    let resolve!: (value: ServerWalletResponse) => void
    const onChange = vi.fn()
    const reader = createWalletReader({ owner: { epoch: 1, accountId: 1 }, isCurrent: () => true,
      load: () => new Promise(done => { resolve = done }), onChange })
    const pending = reader.refresh()
    await vi.advanceTimersByTimeAsync(6000); await pending
    expect(onChange).toHaveBeenLastCalledWith({ status: 'unavailable', response: null })
    resolve(initialized()); await Promise.resolve(); expect(onChange).toHaveBeenCalledOnce()
    reader.dispose()
  })
})
