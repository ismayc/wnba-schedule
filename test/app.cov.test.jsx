import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Keep the game-detail summary and player log off the network and deterministic.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

// A committed game to hang a live overlay on. NY vs CON, already final in the snapshot.
const LIVE_ID = GAMES[0].id
const HOME = GAMES[0].home // 'NY'

const liveEvent = (id = LIVE_ID) => ({
  id,
  competitions: [
    {
      status: {
        period: 3,
        displayClock: '4:21',
        type: { state: 'in', completed: false, shortDetail: 'Q3 4:21' },
      },
      competitors: [
        { homeAway: 'home', score: { value: 60 } },
        { homeAway: 'away', score: { value: 58 } },
      ],
    },
  ],
})
const scoreboard = (events) => ({ ok: true, json: async () => ({ events }) })

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

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  window.history.replaceState(null, '', '/')
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('live overlay on a committed game', () => {
  it('surfaces the live-now count once a poll reports an in-progress game', async () => {
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    await mount()
    await waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())
    expect(screen.getByText(/1 live now/)).toBeInTheDocument()
  })
})

describe('live alerts fire toasts', () => {
  it('raises a tipoff toast for a followed team when a game goes live', async () => {
    localStorage.setItem('wnba:alerts', '1')
    localStorage.setItem('wnba:followed', JSON.stringify([HOME]))
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    await mount()
    // The overlay flips a committed (not-live) game to live -> a tipoff moment.
    const toast = await screen.findByRole('status')
    expect(within(toast).getByText('Tipoff')).toBeInTheDocument()

    // Clicking the toast body opens that game's detail (Toasts onOpen).
    await userEvent.click(within(toast).getByRole('button', { name: /Tipoff/ }))
    expect(screen.getByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })

  it('lets a toast be dismissed', async () => {
    localStorage.setItem('wnba:alerts', '1')
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    await mount()
    const toast = await screen.findByRole('status')
    await userEvent.click(within(toast).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument())
  })

  it('retires a toast on its own after a few seconds', async () => {
    localStorage.setItem('wnba:alerts', '1')
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    vi.useFakeTimers()
    render(
      <FollowProvider>
        <ServicesProvider>
          <App />
        </ServicesProvider>
      </FollowProvider>
    )
    // Flush the mount poll's fetch chain (microtasks, not faked timers).
    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('status')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(9000)
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('followed team filter', () => {
  it('shows the My teams chip and narrows the schedule when toggled', async () => {
    localStorage.setItem('wnba:followed', JSON.stringify([HOME]))
    await mount()
    const before = document.querySelectorAll('.game').length
    const chip = screen.getByRole('button', { name: /My teams \(1\)/ })
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    const after = document.querySelectorAll('.game').length
    expect(after).toBeGreaterThan(0)
    expect(after).toBeLessThan(before)
  })
})

describe('localStorage unavailable (private mode)', () => {
  it('falls back to defaults when reads throw', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    await mount()
    // Spoiler-free defaults off, alerts default off — the read catches all returned false.
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTitle('Live alerts off')).toHaveAttribute('aria-pressed', 'false')
  })

  it('swallows write failures across every persisted toggle', async () => {
    // Services must be present so the "On my services" toggle (a localStorage write) exists.
    localStorage.setItem('wnba:services', JSON.stringify(['youtubetv', 'prime', 'peacock']))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    // Mount alone exercises the spoiler-free and show-past persistence effects' catches.
    await mount()

    // Theme toggle write catch, both ternary directions.
    const themeBtn = screen.getByTitle('Toggle theme')
    await userEvent.click(themeBtn)
    await userEvent.click(themeBtn)

    // Alerts write catch, both '1' and '0' branches.
    await userEvent.click(screen.getByTitle('Live alerts off'))
    await userEvent.click(screen.getByTitle('Live alerts on'))

    // Watch-only write catch, both branches.
    const watchBtn = screen.getByRole('button', { name: /On my services/ })
    await userEvent.click(watchBtn)
    await userEvent.click(watchBtn)

    // Nothing threw out to the UI; the app is still on its feet.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument()
  })
})

describe('the other views render', () => {
  it('renders the Week view', async () => {
    window.history.replaceState(null, '', '/?view=week')
    await mount()
    expect(screen.getByRole('button', { name: /📆 Week/ })).toHaveAttribute('aria-current', 'page')
    expect(document.querySelector('main')).toBeInTheDocument()
  })

  it('renders the Playoffs bracket', async () => {
    window.history.replaceState(null, '', '/?view=playoffs')
    await mount()
    expect(screen.getByRole('button', { name: /🏆 Playoffs/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })

  it('renders the Radial bracket', async () => {
    window.history.replaceState(null, '', '/?view=radial')
    await mount()
    expect(screen.getByRole('button', { name: /🎯 Radial/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
  })
})

describe('timezone select', () => {
  it('changes the timezone and records it in the URL', async () => {
    window.history.replaceState(null, '', '/?tz=America/New_York')
    await mount()
    await userEvent.selectOptions(screen.getByLabelText('Timezone'), 'America/Los_Angeles')
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('tz')).toBe('America/Los_Angeles')
    )
  })
})

describe('clearing the team filter', () => {
  it('drops the team back to all teams', async () => {
    window.history.replaceState(null, '', '/?team=MIN')
    await mount()
    expect(screen.getByDisplayValue('Minnesota Lynx')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Clear/ }))
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('team')).toBeNull()
    )
    expect(screen.getByDisplayValue('All teams')).toBeInTheDocument()
  })
})

describe('the calendar modal', () => {
  it('opens from the filter bar and closes again', async () => {
    await mount()
    await userEvent.click(screen.getByRole('button', { name: /📅 Calendar/ }))
    const dialog = screen.getByRole('dialog', { name: 'Calendar' })
    expect(dialog).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Calendar' })).not.toBeInTheDocument()
  })
})

describe('the services picker from an existing selection', () => {
  it('opens the editor from the gear button', async () => {
    localStorage.setItem('wnba:services', JSON.stringify(['peacock']))
    await mount()
    await userEvent.click(screen.getByRole('button', { name: 'Edit my services' }))
    expect(screen.getByRole('dialog', { name: 'My services' })).toBeInTheDocument()
  })
})

describe('game detail wiring', () => {
  it('closes on the Close button', async () => {
    await mount()
    await userEvent.click(document.querySelector('.game'))
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
  })

  it('jumps to a team schedule from the detail', async () => {
    // Deep-link straight to a real-team game: the "<team> schedule" actions only exist
    // for franchises, and around the All-Star break the first card can be the All-Star
    // Game (custom sides, no such button), which made this data-dependent.
    const real = GAMES.find((g) => g.seasonType !== 'allstar')
    window.history.replaceState(null, '', `/?game=${real.id}`)
    await mount()
    const dialog = screen.getByRole('dialog', { name: 'Game detail' })
    // The two "<team> schedule" actions call onPickTeam then close.
    const schedBtn = within(dialog).getAllByRole('button', { name: /schedule/ })[0]
    await userEvent.click(schedBtn)
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Game detail' })).not.toBeInTheDocument()
    )
    // A team is now pinned in the filter select.
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('team')).toBeTruthy()
    )
  })
})

describe('team panel wiring', () => {
  it('jumps to the full schedule from the panel', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    const panel = screen.getByRole('dialog')
    await userEvent.click(within(panel).getByRole('button', { name: /Full schedule/ }))
    // onSchedule pins the team and switches to the schedule view.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /📋 Schedule/ })).toHaveAttribute(
        'aria-current',
        'page'
      )
    )
  })

  it('opens a past game from the form strip', async () => {
    window.history.replaceState(null, '', '/?view=standings')
    await mount()
    await userEvent.click(document.querySelector('.team-btn'))
    const panel = screen.getByRole('dialog')
    const chip = panel.querySelector('.tp-chip')
    expect(chip).toBeTruthy()
    await userEvent.click(chip)
    // onOpenGame closes the panel and opens that game's detail.
    expect(await screen.findByRole('dialog', { name: 'Game detail' })).toBeInTheDocument()
  })
})

describe('player modal wiring', () => {
  it('opens a player from the stats leaders and closes it', async () => {
    window.history.replaceState(null, '', '/?view=stats')
    await mount()
    const playerBtn = document.querySelector('.lead-player')
    expect(playerBtn).toBeTruthy()
    await userEvent.click(playerBtn)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})
