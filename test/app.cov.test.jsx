import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Keep the game-detail summary and player log off the network and deterministic.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: () => Promise.resolve(null) }))
vi.mock('../src/services/player.js', () => ({
  fetchPlayer: () => Promise.resolve(null),
  headshotUrl: () => 'data:image/gif;base64,',
}))

// The live-overlay cases here mark a committed game in progress and expect a toast.
// App stops polling once every game is final (the seasonOver gate), which is what the
// live schedule becomes on September 25, so read the frozen September 4 board: a
// season genuinely in progress. See test/fixtures/season-2026.js.
vi.mock('../src/data/schedule.js', async (importOriginal) => ({
  ...(await importOriginal()),
  GAMES: (await import('./fixtures/season-2026.js')).GAMES_2026,
}))

import App from '../src/App.jsx'
import { FollowProvider } from '../src/context/follow.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES_2026 as GAMES } from './fixtures/season-2026.js'
import { HISTORY } from '../src/data/history.js'
import { TEAM_BY_ABBR } from '../src/data/teams.js'
const teamNameOf = (a) => TEAM_BY_ABBR[a]?.name ?? a

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

// The team / my-teams / services controls live in a panel that's collapsed unless a
// filter is already active on load; open it before reaching for anything inside.
const openFilters = () => userEvent.click(screen.getByRole('button', { name: /⚙ Filters/ }))

describe('live overlay on a committed game', () => {
  it('surfaces the live-now count once a poll reports an in-progress game', async () => {
    fetch.mockResolvedValue(scoreboard([liveEvent()]))
    await mount()
    await waitFor(() => expect(screen.getByText(/live now/)).toBeInTheDocument())
    expect(screen.getByText(/1 live now/)).toBeInTheDocument()
  })
})

describe('live overlay ignores a poll that lands after teardown', () => {
  it('drops the response when the abort signal already fired (line 156)', async () => {
    // Hold the poll open, unmount (which aborts), then let the fetch settle. The
    // guard must swallow the result rather than set state on a dead tree.
    let settle
    fetch.mockReturnValue(new Promise((res) => { settle = () => res(scoreboard([liveEvent()])) }))
    const { unmount } = await mount()
    unmount()
    await act(async () => {
      settle()
    })
    expect(screen.queryByText(/live now/)).not.toBeInTheDocument()
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

  it('keeps an existing toast and stacks the next moment on top (line 190)', async () => {
    localStorage.setItem('wnba:alerts', '1')
    // Poll 1 tips the game off; poll 2 finals it. The second pass has to diff the
    // new moment against the toast already on screen, which is the only time the
    // existing-key set is built from a non-empty list.
    const finalEvent = () => ({
      id: LIVE_ID,
      competitions: [
        {
          status: { period: 4, displayClock: '0:00', type: { state: 'post', completed: true, shortDetail: 'Final' } },
          competitors: [
            { homeAway: 'home', score: { value: 82 } },
            { homeAway: 'away', score: { value: 79 } },
          ],
        },
      ],
    })
    // Pin the clock to the off-season so nothing is imminent and the cycle starts
    // cold. The first live game then flips it warm, which re-runs the poll effect
    // immediately — the only gap narrower than the 9s toast TTL.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'))

    // Each poll fans out over three days, so gate by round: round 1 tips the game
    // off, round 2 is held until the tipoff toast is provably on screen.
    let release
    const gate = new Promise((r) => { release = r })
    let calls = 0
    fetch.mockImplementation(async () => {
      calls += 1
      if (calls <= 3) return scoreboard([liveEvent()])
      await gate
      return scoreboard([finalEvent()])
    })

    await mount()
    // The default 1s findBy window is tight for a full mount plus a three-day poll
    // on a loaded CI runner; the file already allows far longer overall.
    const stack = await screen.findByRole('status', {}, { timeout: 10_000 })
    expect(stack).toHaveTextContent('Tipoff')
    release()
    // The final lands on top of the tipoff still showing — the only time the
    // already-seen key set is built from a non-empty stack.
    await waitFor(() => expect(stack).toHaveTextContent('Final'), { timeout: 10_000 })
    expect(stack).toHaveTextContent('Tipoff')
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
    await openFilters()
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
    // Spoiler-free defaults on, alerts default off — every read catch falls back to its default.
    expect(screen.getByTitle('Spoiler-free mode')).toHaveAttribute('aria-pressed', 'true')
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
    await openFilters()

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

  it('swallows the write failure when Clear all resets the watch-only preference', async () => {
    // A team applied on load auto-opens the panel and shows the "Clear all" action.
    window.history.replaceState(null, '', '/?team=MIN')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    await mount()
    await userEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    // The team filter is gone and the app is unharmed by the failed persist.
    expect(screen.getByDisplayValue('All teams')).toBeInTheDocument()
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

  it('renders the History view, and keeps the chosen season in the URL', async () => {
    window.history.replaceState(null, '', '/?view=history&season=2022')
    await mount()
    expect(screen.getByRole('button', { name: /📜 History/ })).toHaveAttribute(
      'aria-current',
      'page'
    )
    // 2022: Las Vegas over Connecticut.
    expect(screen.getByText(/win the title/)).toHaveTextContent(/Las Vegas Aces/)

    await userEvent.selectOptions(document.querySelector('.season-pick select'), '2024')
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get('season')).toBe('2024')
    )
    // 2024: New York's first title.
    expect(screen.getByText(/win the title/)).toHaveTextContent(/New York Liberty/)
  })

  it('opens a team panel describing the archived season, not the live one', async () => {
    // Regression: the panel was built from the live board wherever it was opened
    // from, so a team clicked in the History view showed this season's record and
    // this season's leading scorers. The season has to travel with the click.
    const season = HISTORY[0]
    const rows = Array.isArray(season.standings)
      ? season.standings
      : Object.values(season.standings).flat()
    window.history.replaceState(null, '', `/?view=history&season=${season.year}`)
    await mount()

    const chip = document.querySelector('.standings .hy-team')
    const abbr = rows.find((r) => chip.textContent.includes(teamNameOf(r.abbr)))
    await userEvent.click(chip)

    const panel = await screen.findByRole('dialog')
    const target = abbr || rows[0]
    expect(panel.querySelector('.tp-sub')).toHaveTextContent(`${target.w}–${target.l}`)
    expect(panel.querySelector('.tp-sub')).toHaveTextContent(`seed ${target.seed}`)
  })

  it('opens the archived season’s panel from the bracket too, not just the table', async () => {
    // The bracket reports a team by abbreviation alone, so it needs the season
    // stamped on separately from the standings table above it.
    const season = HISTORY[0]
    window.history.replaceState(null, '', `/?view=history&season=${season.year}`)
    await mount()

    const btn = document.querySelector('.bx-team')
    expect(btn).toBeTruthy()
    const rows = Array.isArray(season.standings)
      ? season.standings
      : Object.values(season.standings).flat()
    const target = rows.find((r) => btn.textContent.includes(teamNameOf(r.abbr)))
    await userEvent.click(btn)

    const panel = await screen.findByRole('dialog')
    if (target) {
      expect(panel.querySelector('.tp-sub')).toHaveTextContent(`${target.w}–${target.l}`)
      expect(panel.querySelector('.tp-sub')).toHaveTextContent(`seed ${target.seed}`)
    }
  })

  it('opens a historical game’s box score from the archived bracket', async () => {
    window.history.replaceState(null, '', '/?view=history&season=2023')
    await mount()
    await userEvent.click(document.querySelector('.dots .dot'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
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
    // ?team= applied on load auto-opens the filter panel.
    expect(screen.getByDisplayValue('Minnesota Lynx')).toBeInTheDocument()
    // The team-specific "Clear" chip, not the panel's "Clear all".
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
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
    await openFilters()
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
    // hide=0 opts out of the default spoiler-free mode, which suppresses the form strip.
    window.history.replaceState(null, '', '/?view=standings&hide=0')
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
