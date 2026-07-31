import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    // CLI smoke tests spawn real subprocesses (node dist/index.js init ...)
    // which take 5-6s each; under parallel CI load they can exceed vitest's
    // default 5s per-test timeout.
    testTimeout: 60_000,
    hookTimeout: 30_000,
  },
})
