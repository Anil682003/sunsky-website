import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    proxy: {
      '/cache-api': {
        target: 'http://91.134.71.79:3001',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cache-api/, ''),
      },
    },
  },
})
