import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// Keep the real overlay math (applyLive/liveCount) but make the fetch itself reject,
// so App's load() try/catch is exercised — the committed season must still render.
vi.mock('../src/services/espn.js', async (importActual) => {
  const actual = await importActual()
  return { ...actual, fetchLive: vi.fn().mockRejectedValue(new Error('feed down')) }
})

// load() only runs while the season is live: App skips the poll entirely once every
// game is final, so on the live schedule this try/catch stops being reachable on
// September 25. Read the frozen September 4 board; see test/fixtures/season-2026.js.
vi.mock('../src/data/schedule.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/season-2026.js')).GAMES_2026,
}))

import App from '../src/App.jsx'
import { fetchLive } from '../src/services/espn.js'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('a rejecting live feed', () => {
  it('swallows the error and still renders the committed schedule', async () => {
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    await act(async () => {})
    await waitFor(() => expect(fetchLive).toHaveBeenCalled())
    expect(document.querySelectorAll('.game').length).toBeGreaterThan(0)
  })
})
