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
    // The page-level suites render Results, HotelDetail and the whole checkout, then drive
    // them through real user events. Any one of them finishes in a second on its own; run in
    // parallel with the rest they can pass 5s and fail on the clock rather than on a defect.
    testTimeout: 20000,
    // Capped on purpose. These suites are whole PAGES in jsdom driven by real user events,
    // and several of them wait on an IntersectionObserver or a debounce. Run 12-wide they
    // starve each other for CPU and fail on the clock — a different one each time, which
    // reads as a broken test suite rather than a busy machine.
    poolOptions: { threads: { maxThreads: 4 } },
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
