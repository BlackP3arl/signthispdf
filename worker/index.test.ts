import { describe, it, expect } from 'vitest'
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import worker from './index'

function ctx() {
  return createExecutionContext()
}

describe('routing + headers', () => {
  it('unknown /api path returns 404 JSON', async () => {
    const c = ctx()
    const res = await worker.fetch(new Request('https://app/api/nope', { method: 'POST' }), env, c)
    await waitOnExecutionContext(c)
    expect(res.status).toBe(404)
  })

  it('generate-signatures without a token returns 402', async () => {
    const c = ctx()
    const res = await worker.fetch(
      new Request('https://app/api/generate-signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'X' }),
      }),
      env,
      c,
    )
    await waitOnExecutionContext(c)
    expect(res.status).toBe(402)
  })

  it('applies security headers to API responses', async () => {
    const c = ctx()
    const res = await worker.fetch(new Request('https://app/api/nope', { method: 'POST' }), env, c)
    await waitOnExecutionContext(c)
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(res.headers.get('X-Frame-Options')).toBe('DENY')
    expect(res.headers.get('Content-Security-Policy')).toContain("default-src 'self'")
  })

  it('OPTIONS preflight returns 204', async () => {
    const c = ctx()
    const res = await worker.fetch(
      new Request('https://app/api/create-transaction', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      }),
      env,
      c,
    )
    await waitOnExecutionContext(c)
    expect(res.status).toBe(204)
  })
})
