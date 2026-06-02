import { describe, it, expect } from 'vitest'
import { env } from 'cloudflare:test'
import { savePreview, getPreview, linkPreviewToPaid, getPaidSignature } from './preview'

describe('preview cache', () => {
  it('saves and retrieves a preview image', async () => {
    const id = await savePreview(env as never, 'data:image/png;base64,AAAA')
    expect(id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await getPreview(env as never, id)).toBe('data:image/png;base64,AAAA')
  })

  it('returns null for an unknown preview id', async () => {
    expect(await getPreview(env as never, 'does-not-exist')).toBeNull()
  })

  it('links a preview to a paid sid and serves the clean signature once', async () => {
    const id = await savePreview(env as never, 'data:image/png;base64,CLEAN')
    await linkPreviewToPaid(env as never, 'sid-1', id)
    expect(await getPaidSignature(env as never, 'sid-1')).toBe('data:image/png;base64,CLEAN')
  })

  it('returns null when paid sid has no linked preview', async () => {
    expect(await getPaidSignature(env as never, 'sid-unknown')).toBeNull()
  })
})
