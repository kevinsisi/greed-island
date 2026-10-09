import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Explicit disposable loopback fixture routing; every UI still uses the sole /api boundary.
const apiTarget = process.env.UNIFIED_FIXTURE_API === '1' ? 'http://127.0.0.1:4179' : 'http://localhost:3000'
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', port: 5173,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: false },
      '/card-images': { target: apiTarget, changeOrigin: false },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
})
