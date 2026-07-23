import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Control the summary fetch per-test so we can drive the attendance/officials rows and
// the abort path that the network-stubbed suites never reach.
vi.mock('../src/services/summary.js', () => ({ fetchGameSummary: vi.fn() }))
import { fetchGameSummary } from '../src/services/summary.js'
import GameDetail from '../src/components/GameDetail.jsx'
import { ServicesProvider } from '../src/context/services.jsx'
import { GAMES } from '../src/data/schedule.js'

const TZ = 'America/New_York'
const doubleOT = GAMES.find((g) => g.line && g.line.home.length > 5)

const open = (game, props = {}) =>
  render(<GameDetail game={game} games={GAMES} tz={TZ} onClose={() => {}} {...props} />)

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  fetchGameSummary.mockReset()
  fetchGameSummary.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
})

describe('GameDetail coverage', () => {
  it('labels a double-overtime column as OT2 in the line score', async () => {
    open(doubleOT)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const heads = [...document.querySelectorAll('.linescore thead th')].map((n) => n.textContent)
    expect(heads).toContain('OT2')
  })

  it('renders an en-dash for a missing quarter and null for an empty line', async () => {
    const withGap = {
      id: 'gap1',
      tip: '2026-06-01T17:00:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'NY',
      score: [70, 65],
      line: { home: [20, 25, 15, 10], away: [18, null, 20, 12] },
    }
    open(withGap)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    const cells = [...document.querySelectorAll('.linescore tbody td')].map((n) => n.textContent)
    expect(cells).toContain('–')

    // An empty line renders no table at all.
    cleanup()
    open({ ...withGap, id: 'empty1', line: { home: [], away: [] } })
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(document.querySelector('.linescore')).toBeNull()
  })

  it('hides game leaders when there are no stars, or none on either roster', async () => {
    const noStars = {
      id: 'ns1',
      tip: '2026-06-02T17:00:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'NY',
      score: [80, 70],
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
    }
    open(noStars)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.queryByText('Game leaders')).toBeNull()

    // Stars that belong to neither team also collapse the section.
    cleanup()
    open({ ...noStars, id: 'ns2', stars: [{ cat: 'points', v: '30', who: 'Nobody', team: 'ZZZ' }] })
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    expect(screen.queryByText('Game leaders')).toBeNull()
  })

  it('shows an uncategorised stat label verbatim in game leaders', async () => {
    const oddCat = {
      id: 'oc1',
      tip: '2026-06-03T17:00:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'NY',
      score: [80, 70],
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
      stars: [{ cat: 'steals', v: '5', who: 'A. Player', team: 'NY' }],
    }
    open(oddCat)
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    // 'steals' isn't in CAT_LABEL, so it renders as-is.
    expect(screen.getByText('steals')).toBeInTheDocument()
  })

  it('shows the live status label in the header of an in-progress game', () => {
    const live = {
      id: 'live1',
      tip: '2026-06-06T17:00:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'NY',
      live: true,
      score: [55, 50],
      statusLabel: 'Q3 3:12',
      line: { home: [20, 20, 15], away: [18, 17, 15] },
    }
    open(live)
    expect(document.querySelector('.md-state').textContent).toBe('Q3 3:12')

    // A live game with no status label falls back to a plain "Live".
    cleanup()
    open({ ...live, id: 'live2', statusLabel: undefined })
    expect(document.querySelector('.md-state').textContent).toBe('Live')
  })

  it('closes when the backdrop itself is pressed', () => {
    const onClose = vi.fn()
    const played = GAMES.find((g) => g.score && g.venue)
    open(played, { onClose })
    fireEvent.mouseDown(document.querySelector('.modal-wrap'))
    expect(onClose).toHaveBeenCalled()
  })

  it('shows attendance and officials once the summary loads', async () => {
    fetchGameSummary.mockResolvedValue({
      box: null,
      teamStats: null,
      injuries: [],
      info: { attendance: 18211, officials: ['Ref One', 'Ref Two'] },
      winprob: null,
    })
    const played = GAMES.find((g) => g.score && g.venue)
    open(played)
    expect(await screen.findByText('Attendance')).toBeInTheDocument()
    expect(screen.getByText('18,211')).toBeInTheDocument()
    expect(screen.getByText('Officials')).toBeInTheDocument()
    expect(screen.getByText('Ref One · Ref Two')).toBeInTheDocument()
  })

  it('renders watch chips for a game on the viewer’s services', () => {
    localStorage.setItem('wnba:services', JSON.stringify(['peacock']))
    const game = {
      id: 'w1',
      tip: '2026-06-04T17:00:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'NY',
      score: [80, 70],
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
      broadcast: ['NBC', 'Peacock'],
    }
    render(
      <ServicesProvider>
        <GameDetail game={game} games={GAMES} tz={TZ} onClose={() => {}} />
      </ServicesProvider>
    )
    const watch = document.querySelector('.md-facts .watch')
    expect(watch).toBeInTheDocument()
    expect(watch).toHaveAccessibleName('Watch on Peacock')
  })

  it('renders a venue without a state, omitting the trailing comma', () => {
    const game = {
      id: 'v1',
      tip: '2026-06-05T17:00:00.000Z',
      seasonType: 'regular',
      home: 'MIN',
      away: 'NY',
      score: [80, 70],
      venue: 'Neutral Arena',
      city: 'Someplace',
      line: { home: [20, 20, 20, 20], away: [18, 18, 17, 17] },
    }
    open(game)
    const dd = [...document.querySelectorAll('.md-facts dd')].find((n) =>
      n.textContent.includes('Neutral Arena')
    )
    expect(dd.textContent).toBe('Neutral Arena, Someplace')
  })

  it('leaves the tale of the tape unmarked when the teams are dead even', async () => {
    // A tiny standings universe where MIN and NY have identical records.
    const games = [
      { id: 'm1', seasonType: 'regular', tip: '2026-05-01T00:00:00.000Z', home: 'MIN', away: 'SEA', score: [80, 70], line: { home: [], away: [] } },
      { id: 'n1', seasonType: 'regular', tip: '2026-05-01T00:00:00.000Z', home: 'NY', away: 'DAL', score: [80, 70], line: { home: [], away: [] } },
    ]
    const game = { id: 'even1', seasonType: 'regular', tip: '2026-09-01T00:00:00.000Z', home: 'NY', away: 'MIN' }
    render(<GameDetail game={game} games={games} tz={TZ} onClose={() => {}} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Matchup' }))
    // Equal record, PPG, and allowed → no side is bolded on those rows.
    expect(document.querySelectorAll('.tale-val.better').length).toBe(0)
  })

  it('opens the home team’s schedule from the actions row', async () => {
    const onPickTeam = vi.fn()
    const onClose = vi.fn()
    const played = GAMES.find((g) => g.score && g.venue)
    open(played, { onPickTeam, onClose })
    const btns = screen.getAllByRole('button', { name: /schedule$/ })
    await userEvent.click(btns[1]) // the home side
    expect(onPickTeam).toHaveBeenCalledWith(played.home)
    expect(onClose).toHaveBeenCalled()
  })

  it('falls back to raw abbrs for an All-Star game with no side names', () => {
    const allStar = {
      id: 'as-noname',
      tip: '2026-07-26T00:30:00.000Z',
      seasonType: 'allstar',
      home: 'COOP',
      away: 'SPO',
      venue: 'United Center',
    }
    open(allStar)
    const strongs = [...document.querySelectorAll('.md-head strong')].map((n) => n.textContent)
    expect(strongs).toContain('SPO')
    expect(strongs).toContain('COOP')
  })

  it('falls back to the first tab when the active one disappears', async () => {
    const played = GAMES.find((g) => g.score && g.venue)
    const upcoming = GAMES.find((g) => !g.score && !g.postponed && !g.canceled)
    const { rerender } = render(
      <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
    )
    // Move to the Scoring tab, which only exists for a played game…
    await userEvent.click(screen.getByRole('tab', { name: 'Scoring' }))
    // …then swap in an upcoming game, whose TABS have no Scoring: the render
    // before the effect resets falls back to the first tab.
    rerender(<GameDetail game={upcoming} games={GAMES} tz={TZ} onClose={() => {}} />)
    expect(screen.queryByRole('tab', { name: 'Scoring' })).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'Matchup' })).toHaveAttribute('aria-selected', 'true')
    )
  })

  it('ignores a summary that resolves after the modal has closed', async () => {
    let resolve
    fetchGameSummary.mockReturnValue(new Promise((r) => { resolve = r }))
    const played = GAMES.find((g) => g.score && g.venue)
    const { unmount } = render(
      <GameDetail game={played} games={GAMES} tz={TZ} onClose={() => {}} />
    )
    unmount() // aborts the in-flight request
    // Resolving now hits the aborted guard and must not throw.
    resolve({ box: null, teamStats: null, injuries: [], info: { attendance: 1, officials: [] }, winprob: null })
    await Promise.resolve()
    expect(document.querySelector('.modal')).toBeNull()
  })
})
