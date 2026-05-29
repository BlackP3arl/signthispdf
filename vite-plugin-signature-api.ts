import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createApiRouter } from './server/apiRouter'

function attachApi(middlewares: Connect.Server, env: Record<string, string>) {
  const router = createApiRouter(env)
  middlewares.use('/api', (req, res, next) => {
    void router(req, res).catch(next)
  })
}

export function signatureApiPlugin(): Plugin {
  return {
    name: 'signature-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      attachApi(server.middlewares, env)
    },
    configurePreviewServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      attachApi(server.middlewares, env)
    },
  }
}
