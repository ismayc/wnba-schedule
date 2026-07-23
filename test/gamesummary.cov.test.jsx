import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { PlayerBox, TeamStatsSection, InjuryReport, WinProbSection } from '../src/components/GameSummary.jsx'

const game = { away: 'NY', home: 'MIN' }
const ready = (data) => ({ status: 'ready', data })

afterEach(() => cleanup())

describe('GameSummary coverage', () => {
  it('renders a box score with DNP, blank and null cells, and a partial totals row', () => {
    const side = {
      abbr: 'AA', // matches neither NY nor MIN → exercises the index fallback
      name: 'Alpha',
      columns: [
        { key: 'minutes', label: 'MIN' },
        { key: 'points', label: 'PTS' },
        { key: 'rebounds', label: 'REB' },
        { key: 'assists', label: 'AST' },
      ],
      starters: [
        { id: 's1', name: 'Star One', pos: 'G', dnp: false, stats: { minutes: '30', points: '20', rebounds: null, assists: '' } },
        // id null → the row key falls back to the player name.
        { id: null, name: 'No Id', pos: 'F', dnp: false, stats: { minutes: '25', points: '10', rebounds: '5', assists: '3' } },
      ],
      bench: [
        { id: 'b1', name: 'Bench One', pos: null, dnp: true, stats: {} },
      ],
      totals: { minutes: '', points: '82', rebounds: null, assists: '' },
    }
    // Only one side present → the home BoxTable receives undefined and renders nothing.
    const box = { sides: [side], hasStats: true }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)

    expect(screen.getByText('Box score')).toBeInTheDocument()
    expect(screen.getByText('DNP')).toBeInTheDocument() // the DNP player's minutes cell
    // Null / empty stat cells fall back to an en-dash.
    expect(container.querySelectorAll('td').length).toBeGreaterThan(0)
    const dash = [...container.querySelectorAll('td')].filter((td) => td.textContent === '–')
    expect(dash.length).toBeGreaterThan(0)
    // Exactly one team's table renders (home side was undefined).
    expect(container.querySelectorAll('.box-team').length).toBe(1)
    // A null total renders blank.
    expect(container.querySelector('tfoot')).toBeInTheDocument()
  })

  it('renders starting lineups with a missing jersey and no position, dropping an absent side', () => {
    const side = {
      abbr: 'NY',
      name: 'New York',
      columns: [],
      starters: [
        { id: null, name: 'No Jersey', jersey: null, pos: null }, // id null → key falls back to name
        { id: 'p2', name: 'Has Both', jersey: '5', pos: 'G' },
      ],
      bench: [{ id: 'p3', name: 'Reserve', jersey: '12', pos: 'F' }],
    }
    const box = { sides: [side], hasStats: false }
    const { container } = render(<PlayerBox summary={ready({ box })} game={game} hideScores={false} />)

    expect(screen.getByText('Starting lineups')).toBeInTheDocument()
    // Missing jersey → en-dash placeholder.
    expect(within(container.querySelector('.lu-list')).getByText('–')).toBeInTheDocument()
    // Only one lineup side rendered (the home side was undefined).
    expect(container.querySelectorAll('.lu-side').length).toBe(1)
    expect(screen.getByText(/Bench \(1\)/)).toBeInTheDocument()
  })

  it('shows an en-dash for a missing team-stat value on either side', () => {
    const teamStats = [
      { label: 'FG%', away: null, home: '52', better: 'home' },
      { label: 'REB', away: '35', home: null, better: 'away' },
    ]
    const { container } = render(<TeamStatsSection summary={ready({ teamStats })} game={game} hideScores={false} />)
    const vals = [...container.querySelectorAll('.ts-val')].map((n) => n.textContent)
    expect(vals).toContain('–')
    expect(container.querySelector('.ts-val.better')).toBeInTheDocument()
  })

  it('orders injury sides away-first and tolerates a missing status and detail', () => {
    const injuries = [
      { abbr: 'MIN', players: [{ name: 'Home Hurt', pos: 'F', status: 'Out', detail: 'Knee' }] },
      { abbr: 'NY', players: [{ name: 'Away Hurt', pos: null, status: null, detail: null }] },
      { abbr: 'ZZZ', players: [{ name: 'Neutral', pos: 'G', status: 'Day-To-Day', detail: 'Ankle' }] },
    ]
    const { container } = render(<InjuryReport summary={ready({ injuries })} game={game} />)
    const heads = [...container.querySelectorAll('.inj-side strong')].map((n) => n.textContent)
    // Away (NY) sorts ahead of home (MIN), and the unknown side trails.
    expect(heads).toEqual(['NY', 'MIN', 'ZZZ'])
    // The away player has no status text and no " · detail" suffix.
    const awayStatus = container.querySelector('.inj-side .inj-status')
    expect(awayStatus.textContent).toBe('')
  })

  it('credits the away team when it is favored at the final probability point', () => {
    const winprob = [0.6, 0.4, 0.3] // ends below 50% home → away (NY) favored at 70%
    render(<WinProbSection summary={ready({ winprob })} game={game} hideScores={false} />)
    expect(screen.getByText('Now 70% NY')).toBeInTheDocument()
  })
})
