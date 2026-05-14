import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        // SSE needs streaming, no buffering
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Disable any buffering so SSE chunks reach the browser immediately
            proxyRes.headers['x-accel-buffering'] = 'no'
          })
        },
      },
    },
  },
})
