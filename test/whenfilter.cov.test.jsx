import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
// The Upcoming filter has to have something to keep, and the live schedule runs out of
// unplayed games on September 25. Read the frozen September 4 board; see
// test/fixtures/season-2026.js.
vi.mock('../src/data/schedule.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/season-2026.js')).GAMES_2026,
}))
import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { whenBucket } from '../src/utils/time.js'

const NOW = new Date('2026-07-19T18:00:00.000Z').getTime()

const game = (over) => ({ id: 'g', tip: '2026-07-19T18:00:00.000Z', home: 'NY', away: 'CON', ...over })

const mount = async () => {
  const utils = render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
  return utils
}

// Pin the clock as well as the board.
//
// Freezing the September 4 board above is only half the job: which bucket a game
// falls in is a comparison against Date.now(), so once the real clock passes the
// frozen board every game reads as finished and the Upcoming filter has nothing
// left to keep. NOW is the same instant the whenBucket unit tests below use, and
// it sits mid-season on the frozen board, with played and unplayed games either
// side of it. Verified by rehearsal: this test failed from September 26, 2026 on,
// with the fixture untouched.
//
// Only Date is faked, so userEvent's timers and waitFor keep working.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('whenBucket', () => {
  it('reads a ticking game as live', () => {
    expect(whenBucket(game({ live: true }), NOW)).toBe('live')
  })

  it('reads a game that has tipped without a feed as live too', () => {
    // Inside the ~2h15m window liveState calls this 'likely-live' — the card shows it
    // as under way, so the filter has to agree or the chip lies about what's on screen.
    expect(whenBucket(game(), NOW + 30 * 60 * 1000)).toBe('live')
  })

  it('reads a scheduled game as upcoming', () => {
    expect(whenBucket(game(), NOW - 60 * 60 * 1000)).toBe('upcoming')
  })

  it('reads a played game as finished', () => {
    expect(whenBucket(game({ score: [90, 82] }), NOW)).toBe('final')
  })

  it('reads a long-past game with no score as finished', () => {
    expect(whenBucket(game(), NOW + 10 * 60 * 60 * 1000)).toBe('final')
  })

  it('keeps a postponed game out of all three buckets', () => {
    expect(whenBucket(game({ postponed: true }), NOW)).toBe('void')
    expect(whenBucket(game({ canceled: true }), NOW)).toBe('void')
  })
})

describe('the When filter in the app', () => {
  const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))

  it('narrows the schedule, counts on the badge, and clears', async () => {
    await mount()
    await openFilters()

    const finished = screen.getByRole('button', { name: '✓ Finished' })
    expect(finished).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(finished)
    expect(finished).toHaveAttribute('aria-pressed', 'true')

    // Mid-season this has teeth on its own, because upcoming games are on screen to be
    // filtered out. Come the offseason every committed game is played and the property
    // would hold with the filter disabled — so assert the CONTRAST, which bites in
    // either half of the year.
    const cardCount = () => document.querySelectorAll('article.game').length
    // The All-Star card is a deliberate early return in GameCard with its own
    // markup and no state- class, so it is excluded from the state assertions
    // rather than weakening them. It only shows up here because the pinned clock
    // sits near the break; the real games either side still carry the class.
    const stateCards = () => document.querySelectorAll('article.game:not(.allstar)')
    expect(cardCount()).toBeGreaterThan(0)
    // Non-vacuous: the loop below has to actually iterate over real games.
    expect(stateCards().length).toBeGreaterThan(0)
    for (const c of stateCards()) {
      expect(c.className).toMatch(/state-(final|past)\b/)
    }

    expect(screen.getByRole('button', { name: /⚙ Filters/ })).toHaveTextContent('1')

    const beforeUpcoming = cardCount()
    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    // Every card on screen is now unplayed, a strictly different set from the one above.
    for (const c of stateCards()) {
      expect(c.className).not.toMatch(/state-(final|past)\b/)
    }
    expect(cardCount()).not.toBe(beforeUpcoming)

    await userEvent.click(screen.getByRole('button', { name: /Clear all/ }))
    expect(cardCount()).toBeGreaterThan(beforeUpcoming)
    expect(screen.getByRole('button', { name: '✓ Finished' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  it('clicking the active chip clears it instead of stacking a second bucket', async () => {
    await mount()
    await openFilters()
    const upcoming = screen.getByRole('button', { name: '⏱ Upcoming' })
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(upcoming)
    expect(upcoming).toHaveAttribute('aria-pressed', 'false')
  })

  it('switching buckets replaces the selection', async () => {
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(screen.getByRole('button', { name: '⏱ Upcoming' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
    expect(screen.getByRole('button', { name: '✓ Finished' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  })
})
