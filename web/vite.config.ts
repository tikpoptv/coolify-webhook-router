import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the Go server runs on :8787 and Vite proxies API calls to it.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8787',
      '/hook': 'http://127.0.0.1:8787',
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
})
