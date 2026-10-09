import test from 'node:test'
import assert from 'node:assert/strict'
import { readFunctionalOptions, planMoves, planRegions } from './test-l390-functional.mjs'
const sha = 'a'.repeat(40)
const credentials = { GREED_L390_TEST_USER_ONE: 'synthetic-one', GREED_L390_TEST_PASSWORD_ONE: 'old-pass', GREED_L390_TEST_ACCOUNT_ID_ONE: '41', GREED_L390_TEST_USER_TWO: 'synthetic-two', GREED_L390_TEST_PASSWORD_TWO: 'old-pass', GREED_L390_TEST_ACCOUNT_ID_TWO: '42' }
const flags = ['--expected-sha', sha, '--approved-existing-accounts', '--approved-public-chat']
test('functional source is gated before any authentication and bound to verified origin/SHA/IDs', () => {
  const config = readFunctionalOptions(flags, credentials)
  assert.equal(config.base, 'https://greed.sisihome.org'); assert.deepEqual(config.accounts.map(value => value.expectedId), [41, 42])
  assert.throws(() => readFunctionalOptions(flags.filter(value => value !== '--approved-public-chat'), credentials), /approval/)
  assert.throws(() => readFunctionalOptions(['--expected-sha', sha, '--approved-public-chat'], credentials), /exactly one/)
  assert.throws(() => readFunctionalOptions([...flags, '--base-url', 'https://evil.example'], credentials), /destination/)
  assert.throws(() => readFunctionalOptions([...flags, '--base-url', 'http://127.0.0.1:4179'], credentials), /destination/)
  assert.throws(() => readFunctionalOptions([...flags, '--expected-sha', sha], credentials), /duplicate/)
  assert.throws(() => readFunctionalOptions(flags, { ...credentials, GREED_L390_TEST_ACCOUNT_ID_TWO: '41' }), /distinct/)
  assert.throws(() => readFunctionalOptions(flags, { ...credentials, GREED_L390_TEST_ACCOUNT_ID_ONE: '9007199254740992' }), /numeric/)
  assert.equal(readFunctionalOptions([...flags, '--local-fixture', '--base-url', 'http://127.0.0.1:4179'], credentials).origin, 'http://127.0.0.1:4179')
})
test('optional signup requires explicitly supplied synthetic names and new-password policy', () => {
  const registerFlags = ['--expected-sha', sha, '--approved-register-synthetic-accounts', '--approved-public-chat']
  assert.throws(() => readFunctionalOptions(registerFlags, credentials), /synthetic credentials/)
  const env = { ...credentials, GREED_L390_TEST_USER_ONE: 'l390-smoke-user-one', GREED_L390_TEST_USER_TWO: 'l390-smoke-user-two', GREED_L390_TEST_PASSWORD_ONE: 'operator-synthetic-password', GREED_L390_TEST_PASSWORD_TWO: 'operator-synthetic-password' }
  assert.equal(readFunctionalOptions(registerFlags, env).register, true)
  assert.throws(() => readFunctionalOptions([...registerFlags, '--approved-existing-accounts'], env), /exactly one/)
})
test('normal-intent planner finds a collision-respecting bounded path and fails closed if blocked', () => {
  const geometry = { movePerStep: 1 }
  const computeMove = (point, dx, dz) => {
    const next = { x: point.x + dx, z: point.z + dz }
    return next.x >= 0 && next.x <= 3 && next.z >= 0 && next.z <= 3 && !(next.x === 1 && next.z === 0) ? next : point
  }
  const moves = planMoves({ x: 0, z: 0 }, { x: 3, z: 0 }, geometry, computeMove, 0)
  assert.deepEqual(moves.reduce((point, intent) => computeMove(point, intent.dx, intent.dz), { x: 0, z: 0 }), { x: 3, z: 0 })
  assert.throws(() => planMoves({ x: 0, z: 0 }, { x: 3, z: 0 }, geometry, point => point, 0), /No bounded/)
})
test('region planner requires available edges and supported geometry', () => {
  const map = { regions: ['dock', 'central', 'locked'].map(id => ({ id, available: true, geometrySupported: id !== 'locked' })), adjacency: { dock: ['central', 'locked'], central: ['dock'] }, edges: [{ fromTileId: 'dock', toTileId: 'central', available: true }, { fromTileId: 'dock', toTileId: 'locked', available: true }] }
  assert.deepEqual(planRegions(map, 'dock', 'central'), ['central'])
  assert.throws(() => planRegions(map, 'dock', 'locked'), /No reviewed/)
  assert.throws(() => planRegions({ ...map, edges: [] }, 'dock', 'central'), /No reviewed/)
})
