import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the same dist/ works at a domain root (Netlify) and under a
  // subpath (GitHub Pages /the-wnba-schedule/).
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // Full-app userEvent tests under v8 instrumentation can brush the default 5s
    // ceiling on a loaded CI runner (mount + several interaction clicks). Give them
    // headroom so a busy runner doesn't flake a passing test. 30s matches the NFL and
    // both March Madness viewers; 15s was this repo's own outlier, and it started
    // timing out once a second full-app suite joined the run to compete for workers.
    testTimeout: 30000,
    // Pin the suite's timezone so any test asserting a day heading, or what counts
    // as "today", is runner-independent. UTC is what these tests were already
    // written against: CI's runners sit in UTC, so this changes nothing there. What
    // it fixes is the LOCAL run, which until now needed an explicit `TZ=UTC` prefix
    // and failed in a confusing way without one. test/guards.test.js asserts the pin
    // so it cannot be dropped unnoticed on an already-UTC runner.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/data/**'],
      // Enforced gate: the suite (and CI's coverage:badge step) fails if any metric
      // slips below 100%. Genuinely unreachable defensive arms carry an inline
      // `/* v8 ignore next */` with a justification rather than lowering these.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})
