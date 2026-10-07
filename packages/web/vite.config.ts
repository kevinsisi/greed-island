import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/mp-api': {
        target: 'http://127.0.0.1:4179',
        changeOrigin: false,
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/card-images': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
