import { describe, expect, it } from 'vitest'
import { resolveUnifiedConfig } from './unifiedConfig.js'

const base = { GREED_ISLAND_DB_PATH: '/tmp/synthetic-canonical.sqlite', GREED_ISLAND_ALLOWED_ORIGINS: 'https://greed.example.test' }

describe('one unified startup config', () => {
  it('requires explicit canonical DB and Origins, with no JWT secret or old mode', () => {
    expect(() => resolveUnifiedConfig({})).toThrow('GREED_ISLAND_DB_PATH')
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_DB_PATH: './data.sqlite' })).toThrow('absolute')
    expect(() => resolveUnifiedConfig({ GREED_ISLAND_DB_PATH: base.GREED_ISLAND_DB_PATH })).toThrow('ALLOWED_ORIGINS')
    expect(resolveUnifiedConfig(base)).toMatchObject({ host: '127.0.0.1', port: 3000, secureCookies: true, sessionMs: 43_200_000 })
  })
  it.each(['0', '-1', '65536', '4179x', '4.5', ' 4179', ''])('rejects invalid port %s', PORT => {
    expect(() => resolveUnifiedConfig({ ...base, PORT })).toThrow('PORT')
  })
  it.each(['https://greed.example.test/', 'https://greed.example.test/path', 'https://user:password@greed.example.test', 'null', 'ftp://greed.example.test'])('rejects malformed Origin %s', GREED_ISLAND_ALLOWED_ORIGINS => {
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_ALLOWED_ORIGINS })).toThrow()
  })
  it('requires HTTPS and cannot turn off cookie security on network listeners/origins', () => {
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_ALLOWED_ORIGINS: 'http://greed.example.test' })).toThrow('HTTPS')
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_LOCAL_HTTP: '1', HOST: '0.0.0.0' })).toThrow('loopback')
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_LOCAL_HTTP: '1' })).toThrow('loopback origins')
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_LOCAL_HTTP: 'yes' })).toThrow('0 or 1')
  })
  it('supports only explicit loopback HTTP fixtures and deduplicates origins', () => {
    const config = resolveUnifiedConfig({ ...base, PORT: '4179', GREED_ISLAND_LOCAL_HTTP: '1', GREED_ISLAND_ALLOWED_ORIGINS: 'http://127.0.0.1:4178,http://127.0.0.1:4178\nhttp://localhost:4178' })
    expect(config.allowedOrigins).toEqual(['http://127.0.0.1:4178', 'http://localhost:4178'])
    expect(config.secureCookies).toBe(false)
  })
  it.each(['0', '2592000001', 'NaN', '1200x'])('bounds session duration %s', GREED_ISLAND_SESSION_MS => {
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_SESSION_MS })).toThrow('SESSION_MS')
  })
  it('accepts only an exact commit SHA for deployment health evidence', () => {
    expect(resolveUnifiedConfig({ ...base, GREED_ISLAND_BUILD_SHA: 'a'.repeat(40) }).buildSha).toBe('a'.repeat(40))
    expect(() => resolveUnifiedConfig({ ...base, GREED_ISLAND_BUILD_SHA: 'latest' })).toThrow('commit SHA')
  })
  it('binds optional OpenCode credential trust only to exact immutable startup origins', () => {
    expect(resolveUnifiedConfig({ ...base, OPENCODE_CREDENTIAL_ORIGIN: 'https://provider.example.test:8443' }).openCodeCredentialOrigin).toBe('https://provider.example.test:8443')
    expect(resolveUnifiedConfig({ ...base, OPENCODE_SERVER_URL: 'https://edited.example.test' }).openCodeCredentialOrigin).toBeUndefined()
    for (const raw of ['', 'invalid', 'https://user:password@provider.example.test', 'https://provider.example.test/path', 'https://provider.example.test/', 'ftp://provider.example.test']) {
      expect(resolveUnifiedConfig({ ...base, OPENCODE_CREDENTIAL_ORIGIN: raw }).openCodeCredentialOrigin).toBeUndefined()
    }
  })
})
