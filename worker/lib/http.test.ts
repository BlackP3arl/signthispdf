import { describe, it, expect } from 'vitest'
import { json, allowedOrigins, corsHeaders, readJson } from './http'

describe('json', () => {
  it('serializes body with status and content-type', async () => {
    const res = json(402, { error: 'nope' })
    expect(res.status).toBe(402)
    expect(res.headers.get('Content-Type')).toBe('application/json')
    expect(await res.json()).toEqual({ error: 'nope' })
  })

  it('merges extra headers', () => {
    const res = json(200, {}, { 'Access-Control-Allow-Origin': 'https://a.com' })
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://a.com')
  })
})

describe('allowedOrigins', () => {
  it('includes APP_URL and extras', () => {
    const set = allowedOrigins({
      APP_URL: 'https://a.com',
      APP_ALLOWED_ORIGINS: 'https://b.com, https://c.com',
    } as never)
    expect(set.has('https://a.com')).toBe(true)
    expect(set.has('https://b.com')).toBe(true)
    expect(set.has('https://c.com')).toBe(true)
  })
})

describe('corsHeaders', () => {
  const reqUrl = 'https://app.example.com/api/x'

  it('returns headers for an allowed origin', () => {
    const set = new Set(['https://a.com'])
    const h = corsHeaders('https://a.com', set, reqUrl)
    expect(h?.['Access-Control-Allow-Origin']).toBe('https://a.com')
  })

  it('returns null for a forbidden origin', () => {
    const set = new Set(['https://a.com'])
    expect(corsHeaders('https://evil.com', set, reqUrl)).toBeNull()
  })

  it('returns empty object when no Origin header (same-origin)', () => {
    const set = new Set(['https://a.com'])
    expect(corsHeaders(null, set, reqUrl)).toEqual({})
  })

  it('always allows the request own origin regardless of port', () => {
    // Worker serves app + API same-origin; its own calls must never be blocked
    const set = new Set(['https://a.com'])
    const h = corsHeaders('https://app.example.com', set, 'https://app.example.com/api/x')
    expect(h?.['Access-Control-Allow-Origin']).toBe('https://app.example.com')
  })
})

describe('readJson', () => {
  it('parses a small JSON body', async () => {
    const req = new Request('https://x/', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
      headers: { 'Content-Type': 'application/json' },
    })
    expect(await readJson(req)).toEqual({ a: 1 })
  })

  it('returns {} for an empty body', async () => {
    const req = new Request('https://x/', { method: 'POST', body: '' })
    expect(await readJson(req)).toEqual({})
  })

  it('rejects an oversized body', async () => {
    const big = 'x'.repeat(5000)
    const req = new Request('https://x/', {
      method: 'POST',
      body: JSON.stringify({ big }),
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(readJson(req, 4096)).rejects.toThrow('Request body too large')
  })

  it('rejects invalid JSON', async () => {
    const req = new Request('https://x/', {
      method: 'POST',
      body: '{bad',
      headers: { 'Content-Type': 'application/json' },
    })
    await expect(readJson(req)).rejects.toThrow('Invalid JSON body')
  })
})
