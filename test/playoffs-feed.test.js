import { describe, it, expect } from 'vitest'
import { playoffsFromScoreboard } from '../scripts/fetch-schedule.mjs'

// The team-schedule feed (seasontype=3) stays empty for days after ESPN posts the
// bracket, so playoff games come from the scoreboard too. Shapes below are trimmed from
// the real 2026-09-25 scoreboard: the season type lives on `season.type`, the
// competition `type` is a round code, and unscheduled slots carry "TBD" teams with
// negative ids.
const team = (id, abbreviation, homeAway) => ({ homeAway, team: { id, abbreviation } })
const event = (over = {}) => ({
  id: '401918014',
  date: '2026-09-27T18:00Z',
  season: { year: 2026, type: 3, slug: 'post-season' },
  competitions: [
    {
      type: { id: '14', abbreviation: 'RD16' },
      status: { type: { name: 'STATUS_SCHEDULED', completed: false } },
      venue: { fullName: 'Target Center', address: { city: 'Minneapolis', state: 'MN' } },
      broadcasts: [{ names: ['ABC'] }],
      notes: [{ headline: 'First Round - Game 1' }],
      competitors: [team('8', 'MIN', 'home'), team('9', 'NY', 'away')],
    },
  ],
  ...over,
})
const KNOWN = new Set(['MIN', 'NY', 'LV', 'IND'])

describe('playoffsFromScoreboard', () => {
  it('reads a first-round game from the scoreboard shape', () => {
    expect(playoffsFromScoreboard([event()], KNOWN)).toEqual([
      expect.objectContaining({
        id: '401918014',
        tip: '2026-09-27T18:00:00.000Z',
        seasonType: 'playoffs',
        home: 'MIN',
        away: 'NY',
        venue: 'Target Center',
        broadcast: ['ABC'],
        round: 'R1',
        game: 1,
      }),
    ])
  })

  it('skips slots whose teams are still TBD, and anything not postseason', () => {
    const tbd = event({ id: 'tbd' })
    tbd.competitions[0].competitors = [team('-1', 'TBD', 'home'), team('-2', 'TBD', 'away')]
    const regular = event({ id: 'reg', season: { year: 2026, type: 2 } })
    const stranger = event({ id: 'x' })
    stranger.competitions[0].competitors = [team('8', 'MIN', 'home'), team('99', 'ZZZ', 'away')]
    expect(playoffsFromScoreboard([tbd, regular, stranger, event()], KNOWN).map((g) => g.id)).toEqual([
      '401918014',
    ])
  })
})
