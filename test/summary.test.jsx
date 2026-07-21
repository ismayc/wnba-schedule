import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { PlayerBox, TeamStatsSection, InjuryReport, WinProbSection } from '../src/components/GameSummary.jsx'
import { fetchGameSummary } from '../src/services/summary.js'

// Player box score column order, as sampled from a real WNBA summary. OREB/DREB are
// present so we can assert they get filtered out (REB already sums them).
const KEYS = [
  'minutes', 'points', 'fieldGoalsMade-fieldGoalsAttempted', 'rebounds',
  'offensiveRebounds', 'defensiveRebounds', 'assists', 'turnovers', 'steals', 'blocks',
]

const ath = (starter, id, name, jersey, pos, stats, dnp = false) => ({
  starter,
  didNotPlay: dnp,
  athlete: { id, displayName: name, jersey, position: { abbreviation: pos } },
  stats,
})

const teamStat = (name, label, displayValue) => ({ name, label, displayValue })

// A completed game: NY (away) vs MIN (home).
const summary = () => ({
  boxscore: {
    players: [
      {
        team: { abbreviation: 'NY', displayName: 'New York Liberty' },
        statistics: [
          {
            keys: KEYS,
            labels: ['MIN', 'PTS', 'FG', 'REB', 'OREB', 'DREB', 'AST', 'TO', 'STL', 'BLK'],
            athletes: [
              ath(true, '1', 'Sabrina Ionescu', '20', 'G', ['34', '22', '8-15', '5', '1', '4', '7', '2', '1', '0']),
              ath(false, '3', 'Bench Player', '2', 'G', ['10', '4', '2-5', '1', '0', '1', '2', '0', '0', '0']),
            ],
            totals: ['', '82', '30-70', '35', '10', '25', '21', '13', '5', '3'],
          },
        ],
      },
      {
        team: { abbreviation: 'MIN', displayName: 'Minnesota Lynx' },
        statistics: [
          {
            keys: KEYS,
            labels: ['MIN', 'PTS', 'FG', 'REB', 'OREB', 'DREB', 'AST', 'TO', 'STL', 'BLK'],
            athletes: [
              ath(true, '4', 'Napheesa Collier', '24', 'F', ['35', '25', '9-16', '8', '2', '6', '3', '1', '2', '1']),
            ],
            totals: ['', '96', '35-67', '37', '7', '30', '26', '16', '9', '5'],
          },
        ],
      },
    ],
    teams: [
      {
        homeAway: 'away',
        team: { abbreviation: 'NY' },
        statistics: [
          teamStat('fieldGoalPct', 'Field Goal %', '39'),
          teamStat('totalRebounds', 'Rebounds', '35'),
          teamStat('totalTurnovers', 'Total Turnovers', '17'),
        ],
      },
      {
        homeAway: 'home',
        team: { abbreviation: 'MIN' },
        statistics: [
          teamStat('fieldGoalPct', 'Field Goal %', '52'),
          teamStat('totalRebounds', 'Rebounds', '37'),
          teamStat('totalTurnovers', 'Total Turnovers', '18'),
        ],
      },
    ],
  },
  injuries: [
    {
      team: { abbreviation: 'NY' },
      injuries: [
        { status: 'Out', athlete: { displayName: 'Satou Sabally', position: { abbreviation: 'F' } }, type: { description: 'Concussion' } },
      ],
    },
  ],
  gameInfo: {
    attendance: 17615,
    officials: [{ displayName: 'Roy Gulbeyan' }, { displayName: 'Ryan Sassano' }],
  },
  winprobability: [{ homeWinPercentage: 0.4 }, { homeWinPercentage: 0.7 }, { homeWinPercentage: 1 }],
})

const stubFetch = (payload, ok = true) => {
  globalThis.fetch = vi.fn(async () => ({ ok, json: async () => payload }))
}

const game = { id: 'g1', home: 'MIN', away: 'NY' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('fetchGameSummary (service)', () => {
  it('parses the box score, dropping OREB/DREB and keeping totals', async () => {
    stubFetch(summary())
    const { box } = await fetchGameSummary('g1')

    const ny = box.sides.find((s) => s.abbr === 'NY')
    expect(ny.columns.map((c) => c.key)).not.toContain('offensiveRebounds')
    expect(ny.columns.map((c) => c.key)).toContain('rebounds')
    expect(ny.starters.map((p) => p.name)).toEqual(['Sabrina Ionescu'])
    expect(ny.bench.map((p) => p.name)).toEqual(['Bench Player'])
    expect(ny.starters[0].stats.points).toBe('22')
    expect(ny.totals.points).toBe('82')
    expect(box.hasStats).toBe(true)
  })

  it('compares team stats and marks the better side (turnovers: fewer wins)', async () => {
    stubFetch(summary())
    const { teamStats } = await fetchGameSummary('g1')
    const byLabel = Object.fromEntries(teamStats.map((r) => [r.label, r]))
    expect(byLabel['FG%'].better).toBe('home') // 52 > 39
    expect(byLabel['REB'].better).toBe('home') // 37 > 35
    expect(byLabel['TO'].better).toBe('away') // 17 < 18 — fewer turnovers is better
  })

  it('parses injuries, attendance/officials, and the win-prob series', async () => {
    stubFetch(summary())
    const { injuries, info, winprob } = await fetchGameSummary('g1')
    expect(injuries[0]).toMatchObject({ abbr: 'NY' })
    expect(injuries[0].players[0]).toMatchObject({ name: 'Satou Sabally', status: 'Out', detail: 'Concussion' })
    expect(info).toEqual({ attendance: 17615, officials: ['Roy Gulbeyan', 'Ryan Sassano'] })
    expect(winprob).toEqual([0.4, 0.7, 1])
  })

  it('returns null sections rather than throwing when data is absent', async () => {
    stubFetch({})
    const s = await fetchGameSummary('g1')
    expect(s).toEqual({ box: null, teamStats: null, injuries: [], info: null, winprob: null })
  })

  it('returns null on a non-ok response or a thrown request', async () => {
    stubFetch({}, false)
    expect(await fetchGameSummary('g1')).toBeNull()
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await fetchGameSummary('g1')).toBeNull()
  })
})

describe('GameSummary sections (components)', () => {
  const readyFrom = async () => {
    stubFetch(summary())
    return { status: 'ready', data: await fetchGameSummary('g1') }
  }

  // The four sections as the modal composes them, so cross-section assertions hold.
  const AllSections = ({ summary: s, hideScores }) => (
    <>
      <PlayerBox summary={s} game={game} hideScores={hideScores} />
      <TeamStatsSection summary={s} game={game} hideScores={hideScores} />
      <InjuryReport summary={s} game={game} />
      <WinProbSection summary={s} game={game} hideScores={hideScores} />
    </>
  )

  it('renders a full box score with headers, players, and totals', async () => {
    render(<PlayerBox summary={await readyFrom()} game={game} hideScores={false} />)
    expect(screen.getByText('Box score')).toBeInTheDocument()
    expect(screen.getByText('Sabrina Ionescu')).toBeInTheDocument()
    expect(screen.getByText('Napheesa Collier')).toBeInTheDocument()
    // Totals rows (one per team).
    expect(screen.getAllByText('Totals').length).toBe(2)
  })

  it('shows team stats, injuries, and the win-prob chart for a completed game', async () => {
    render(<AllSections summary={await readyFrom()} hideScores={false} />)
    expect(screen.getByText('Team stats')).toBeInTheDocument()
    expect(screen.getByText('Injury report')).toBeInTheDocument()
    expect(screen.getByText('Satou Sabally')).toBeInTheDocument()
    expect(screen.getByText('Win probability')).toBeInTheDocument()
  })

  it('labels the win probability "Ended" only when the game is final, else "Now"', async () => {
    const s = await readyFrom() // winprob ends at 100% home (MIN)
    const { rerender } = render(<WinProbSection summary={s} game={{ ...game, score: [96, 83] }} hideScores={false} />)
    expect(screen.getByText('Ended 100% MIN')).toBeInTheDocument()

    // A live game (no final score committed yet) reads as current, not ended.
    rerender(<WinProbSection summary={s} game={{ ...game, live: true }} hideScores={false} />)
    expect(screen.getByText('Now 100% MIN')).toBeInTheDocument()
    expect(screen.queryByText(/^Ended/)).toBeNull()
  })

  it('under spoiler-free mode shows lineups only — no box, team stats, or win prob', async () => {
    render(<AllSections summary={await readyFrom()} hideScores />)
    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
    expect(screen.getByText('Sabrina Ionescu')).toBeInTheDocument()
    expect(screen.queryByText('Box score')).toBeNull()
    expect(screen.queryByText('Team stats')).toBeNull()
    expect(screen.queryByText('Win probability')).toBeNull()
    // Injuries aren't a spoiler, so they still show.
    expect(screen.getByText('Injury report')).toBeInTheDocument()
  })

  it('shows loading and not-posted states', () => {
    const { rerender } = render(
      <PlayerBox summary={{ status: 'loading', data: null }} game={game} hideScores={false} />
    )
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    rerender(<PlayerBox summary={{ status: 'ready', data: { box: null } }} game={game} hideScores={false} />)
    expect(screen.getByText(/Not posted yet/)).toBeInTheDocument()
  })
})
