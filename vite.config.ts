import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { signatureApiPlugin } from './vite-plugin-signature-api'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), signatureApiPlugin()],
})
