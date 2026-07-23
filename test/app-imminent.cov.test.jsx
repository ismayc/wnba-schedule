import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render } from '@testing-library/react'

// Keep the detail summary/player off the network, like app.cov.test.jsx.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

const flush = async () => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
  })
}

const mount = () =>
  render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  // Nothing live — the overlay reports no in-progress games.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('warm polling before tip-off', () => {
  it('polls at the live cadence when a game is imminent even with nothing live yet', async () => {
    // Sit 5 minutes before a committed, not-yet-played game's tip: nothing is live,
    // but a game is imminent, so the poll must run at the 30s live cadence.
    const upcoming = GAMES.find((g) => !g.score && !g.postponed && !g.canceled)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(new Date(upcoming.tip).getTime() - 5 * 60_000))

    mount()
    await flush()
    const afterMount = fetch.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)

    // A poll fires at 30s (live cadence). If we were idle it would take 120s.
    await act(async () => {
      vi.advanceTimersByTime(30_000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(afterMount)
  })

  it('stays on the idle cadence when nothing is live or imminent', async () => {
    // Sit a full day before the next unscored game: nothing live, nothing imminent,
    // and the snapshot still has future games (so the season isn't over). This pins
    // the idle branch deterministically rather than letting it hinge on wall-clock.
    const upcoming = GAMES.find((g) => !g.score && !g.postponed && !g.canceled)
    vi.useFakeTimers()
    vi.setSystemTime(new Date(new Date(upcoming.tip).getTime() - 24 * 60 * 60_000))

    mount()
    await flush()
    const afterMount = fetch.mock.calls.length
    expect(afterMount).toBeGreaterThan(0)

    // No extra poll at 30s — the idle interval is 2 minutes.
    await act(async () => {
      vi.advanceTimersByTime(30_000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetch.mock.calls.length).toBe(afterMount)

    // The next poll lands once the full 120s idle interval elapses.
    await act(async () => {
      vi.advanceTimersByTime(90_000)
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(fetch.mock.calls.length).toBeGreaterThan(afterMount)
  })
})
