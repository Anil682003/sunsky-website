import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Vitest does not pick up the React plugin's JSX transform for the SSR/test
  // pipeline, so pin the automatic runtime here.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: true,          // CSS modules must resolve so className lookups in tests are real
  },
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/cache-api': {
        target: 'https://cache.holidaybooking.be',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cache-api/, ''),
      },
    },
  },
})
