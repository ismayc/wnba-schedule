import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))

// Two playoff slots still waiting on an opponent, in the shape fetch-schedule.mjs writes
// to PENDING (trimmed from New York's feed on 2026-09-30, moved onto the frozen board's
// dates). One is date-only with ESPN naming the candidates; the other has a real tip and
// no candidate name, and the real team is on the opposite side.
vi.mock('../src/data/schedule.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/season-2026.js')).GAMES_2026,
  PENDING: [
    {
      slot: '401918295',
      tip: '2026-09-06T04:00:00.000Z',
      timeTbd: true,
      seasonType: 'playoffs',
      home: null,
      away: 'NY',
      opponent: 'Dream/Mystics',
      round: 'SF',
      game: 1,
      note: 'Semifinals - Game 1',
    },
    {
      slot: '401918299',
      tip: '2026-09-07T23:30:00.000Z',
      seasonType: 'playoffs',
      home: 'CON',
      away: null,
      opponent: 'TBD',
      round: 'SF',
      game: 3,
      note: 'Semifinals - Game 3',
    },
  ],
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'

const mount = async () => {
  render(
    <FollowProvider>
      <ServicesProvider>
        <App />
      </ServicesProvider>
    </FollowProvider>
  )
  await act(async () => {})
}

const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))
const slots = () => [...document.querySelectorAll('.game.pending')].map((el) => el.getAttribute('aria-label'))
const NY_SLOT = 'Semifinals - Game 1, opponent to be decided'
const CON_SLOT = 'Semifinals - Game 3, opponent to be decided'

// The frozen September 4 board, read on September 4, so both slots sit inside the
// default fortnight window whatever the real date is.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-09-04T16:00:00Z'))
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/?tz=America/Los_Angeles')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('playoff slots waiting on an opponent', () => {
  it('render on the board as inert cards naming what is still undecided', async () => {
    await mount()
    expect(slots()).toEqual([NY_SLOT, CON_SLOT])

    const [ny, con] = document.querySelectorAll('.game.pending')
    // Date-only: no invented tip time, and the ET date holds even in Pacific time (the
    // 04:00Z placeholder is 9 PM on September 5 there).
    expect(ny).toHaveTextContent('Time TBD')
    expect(ny.closest('.day').id).toBe('day-2026-09-06')
    expect(ny).toHaveTextContent('Dream/Mystics winner')
    // A real tip prints like any game's; no candidate name reads "To be decided".
    expect(con).toHaveTextContent('4:30')
    expect(con).toHaveTextContent('To be decided')
    expect(con).not.toHaveTextContent('winner')
    // Nothing to open yet.
    expect(ny).not.toHaveAttribute('role')
    expect(con).not.toHaveAttribute('tabindex')
  })

  it('follow the team filter through their one real side', async () => {
    window.history.replaceState(null, '', '/?tz=America/Los_Angeles&team=NY')
    await mount()
    expect(slots()).toEqual([NY_SLOT])
  })

  it('follow "My teams" through their one real side', async () => {
    localStorage.setItem('wnba:followed', JSON.stringify(['CON']))
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: /My teams \(1\)/ }))
    expect(slots()).toEqual([CON_SLOT])
  })

  it('drop out under "On my services", having no broadcast yet', async () => {
    localStorage.setItem('wnba:services', JSON.stringify(['peacock']))
    localStorage.setItem('wnba:watchOnly', '1')
    await mount()
    expect(slots()).toEqual([])
  })

  it('count as playoffs and as upcoming', async () => {
    await mount()
    await openFilters()
    await userEvent.click(screen.getByRole('button', { name: 'Regular season' }))
    expect(slots()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: 'Regular season' }))

    await userEvent.click(screen.getByRole('button', { name: '✓ Finished' }))
    expect(slots()).toEqual([])
    await userEvent.click(screen.getByRole('button', { name: '⏱ Upcoming' }))
    expect(slots()).toEqual([NY_SLOT, CON_SLOT])
  })

  it('search by the undecided side as ESPN names it', async () => {
    await mount()
    await openFilters()
    const box = screen.getByLabelText('Search games')
    await userEvent.type(box, 'Mystics')
    expect(slots()).toEqual([NY_SLOT])
    await userEvent.clear(box)
    await userEvent.type(box, 'Connecticut')
    expect(slots()).toEqual([CON_SLOT])
  })
})
