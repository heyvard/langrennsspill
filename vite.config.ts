import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/langrennsspill/' : '/',
  plugins: [react()],
  test: {
    // sim/ er ren TS uten DOM — testene trenger ingen nettleser.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
