import { defineConfig } from 'vitest/config'
import { cloudflareTest } from '@cloudflare/vitest-pool-workers'

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      // Hermetic test secrets — keep unit tests independent of .dev.vars so
      // config-presence checks pass and handlers reach their real logic.
      miniflare: {
        bindings: {
          ENTITLEMENT_SECRET: 'test-secret',
          OPENROUTER_API_KEY: 'test-openrouter-key',
          BML_API_KEY: 'test-bml-key',
        },
      },
    }),
  ],
})
