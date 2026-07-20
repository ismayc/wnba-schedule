import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import Lineups from '../src/components/Lineups.jsx'
import { fetchLineup } from '../src/services/lineups.js'

// The ESPN box score's column order, as sampled from a real WNBA summary.
const KEYS = ['minutes', 'points', 'rebounds', 'assists', 'turnovers', 'steals', 'blocks']

const ath = (starter, id, name, jersey, pos, stats, dnp = false) => ({
  starter,
  didNotPlay: dnp,
  athlete: { id, displayName: name, jersey, position: { abbreviation: pos } },
  stats,
})

// A completed game: NY (away) and MIN (home), each with starters + a bench player.
const summary = () => ({
  boxscore: {
    players: [
      {
        team: { abbreviation: 'NY', displayName: 'New York Liberty' },
        statistics: [
          {
            keys: KEYS,
            athletes: [
              ath(true, '1', 'Sabrina Ionescu', '20', 'G', ['34', '22', '5', '7', '2', '1', '0']),
              ath(true, '2', 'Breanna Stewart', '30', 'F', ['33', '18', '9', '4', '3', '0', '1']),
              ath(false, '3', 'Bench Player', '2', 'G', ['10', '4', '1', '2', '0', '0', '0']),
            ],
          },
        ],
      },
      {
        team: { abbreviation: 'MIN', displayName: 'Minnesota Lynx' },
        statistics: [
          {
            keys: KEYS,
            athletes: [
              ath(true, '4', 'Napheesa Collier', '24', 'F', ['35', '25', '8', '3', '1', '2', '1']),
              ath(true, '5', 'Kayla McBride', '21', 'G', ['30', '15', '2', '5', '2', '0', '0']),
            ],
          },
        ],
      },
    ],
  },
})

const stubFetch = (payload, ok = true) => {
  globalThis.fetch = vi.fn(async () => ({ ok, json: async () => payload }))
}

const game = { id: 'g1', home: 'MIN', away: 'NY' }

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('fetchLineup (service)', () => {
  it('parses starters and bench, resolving PTS·REB·AST by column name', async () => {
    stubFetch(summary())
    const { sides } = await fetchLineup('g1')

    const ny = sides.find((s) => s.abbr === 'NY')
    expect(ny.name).toBe('New York Liberty')
    expect(ny.starters.map((p) => p.name)).toEqual(['Sabrina Ionescu', 'Breanna Stewart'])
    expect(ny.bench.map((p) => p.name)).toEqual(['Bench Player'])
    expect(ny.starters[0]).toMatchObject({ jersey: '20', pos: 'G', dnp: false })
    expect(ny.starters[0].line).toEqual({ min: '34', pts: '22', reb: '5', ast: '7' })
  })

  it('returns null on a non-ok response', async () => {
    stubFetch({}, false)
    expect(await fetchLineup('g1')).toBeNull()
  })

  it('returns null when the request throws', async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error('offline')
    })
    expect(await fetchLineup('g1')).toBeNull()
  })

  it('returns null when no starters are posted yet', async () => {
    stubFetch({ boxscore: { players: [] } })
    expect(await fetchLineup('g1')).toBeNull()
  })

  it('leaves a stat null when its column is absent, and tolerates a missing stats block', async () => {
    stubFetch({
      boxscore: {
        players: [
          {
            team: { abbreviation: 'NY', displayName: 'New York Liberty' },
            statistics: [{ keys: ['minutes', 'points'], athletes: [ath(true, '1', 'Solo Starter', '1', 'G', ['20', '10'])] }],
          },
          // A side whose box score hasn't populated — no statistics at all.
          { team: { abbreviation: 'MIN', displayName: 'Minnesota Lynx' } },
        ],
      },
    })
    const { sides } = await fetchLineup('g1')
    expect(sides[0].starters[0].line).toEqual({ min: '20', pts: '10', reb: null, ast: null })
    expect(sides[1].starters).toEqual([])
  })

  it('falls back to a shortName when there is no displayName', async () => {
    stubFetch({
      boxscore: {
        players: [
          {
            team: { abbreviation: 'NY', displayName: 'New York Liberty' },
            statistics: [{ keys: KEYS, athletes: [{ starter: true, athlete: { shortName: 'S. Test' }, stats: ['10', '5', '2', '1'] }] }],
          },
        ],
      },
    })
    const { sides } = await fetchLineup('g1')
    expect(sides[0].starters[0].name).toBe('S. Test')
  })
})

describe('Lineups (component)', () => {
  it('shows loading, then starters with names, positions and a stat line', async () => {
    stubFetch(summary())
    render(<Lineups game={game} hideScores={false} />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(await screen.findByText('Sabrina Ionescu')).toBeInTheDocument()
    expect(screen.getByText('Napheesa Collier')).toBeInTheDocument()
    // PTS·REB·AST for a played game.
    expect(screen.getByText('22·5·7')).toBeInTheDocument()
  })

  it('lists the bench in a collapsible section', async () => {
    stubFetch(summary())
    render(<Lineups game={game} hideScores={false} />)

    expect(await screen.findByText('Bench (1)')).toBeInTheDocument()
    expect(screen.getByText('Bench Player')).toBeInTheDocument()
  })

  it('suppresses the stat line under spoiler-free mode but still shows who started', async () => {
    stubFetch(summary())
    render(<Lineups game={game} hideScores />)

    expect(await screen.findByText('Sabrina Ionescu')).toBeInTheDocument()
    expect(screen.queryByText('22·5·7')).toBeNull()
  })

  it('shows a "not posted yet" message when there is no lineup', async () => {
    stubFetch({ boxscore: { players: [] } })
    render(<Lineups game={game} hideScores={false} />)

    expect(await screen.findByText(/Not posted yet/)).toBeInTheDocument()
  })
})
