import type { Connect, Plugin } from 'vite'
import { loadEnv } from 'vite'
import { createSignatureApiHandler } from './server/signatureApiHandler'

const API_PATH = '/api/generate-signatures'

function attachSignatureApi(
  middlewares: Connect.Server,
  env: Record<string, string>,
) {
  const handler = createSignatureApiHandler(env)
  middlewares.use(API_PATH, (req, res, next) => {
    void handler(req, res).catch(next)
  })
}

export function signatureApiPlugin(): Plugin {
  return {
    name: 'signature-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      attachSignatureApi(server.middlewares, env)
    },
    configurePreviewServer(server) {
      const env = loadEnv(server.config.mode, server.config.root, '')
      attachSignatureApi(server.middlewares, env)
    },
  }
}
