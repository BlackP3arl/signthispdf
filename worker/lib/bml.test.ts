import { describe, it, expect } from 'vitest'
import { sha1Signature, bmlBaseUrl } from './bml'

describe('sha1Signature', () => {
  // Known vector: sha1("amount=2000&currency=MVR&apiKey=abc")
  it('matches the BML formula', async () => {
    const sig = await sha1Signature(2000, 'MVR', 'abc')
    expect(sig).toBe('723844c30b4fd81839688a19469b8f0e76547e5b')
  })

  it('is deterministic', async () => {
    const a = await sha1Signature(2000, 'MVR', 'abc')
    const b = await sha1Signature(2000, 'MVR', 'abc')
    expect(a).toBe(b)
  })

  it('changes when amount changes', async () => {
    const a = await sha1Signature(2000, 'MVR', 'abc')
    const b = await sha1Signature(3000, 'MVR', 'abc')
    expect(a).not.toBe(b)
  })
})

describe('bmlBaseUrl', () => {
  it('returns sandbox URL for sandbox mode', () => {
    expect(bmlBaseUrl('sandbox')).toBe('https://api.uat.merchants.bankofmaldives.com.mv/public/')
  })
  it('returns production URL otherwise', () => {
    expect(bmlBaseUrl('production')).toBe('https://api.merchants.bankofmaldives.com.mv/public/')
  })
})
