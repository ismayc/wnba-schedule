import { describe, it, expect } from 'vitest'
import { playoffsFromScoreboard, splitTeamFeed } from '../scripts/fetch-schedule.mjs'

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

// The team-schedule feed shape (type on `seasonType`, not `season.type`), trimmed from
// New York's feed on 2026-09-30: the first-round game it had played, and the semifinal
// slots ESPN listed the moment it advanced, opponent "TBD" with id -1 or -2.
const feedEvent = (id, name, home, away, over = {}) => ({
  id,
  date: '2026-10-04T04:00Z',
  name,
  seasonType: { id: '3', type: 3 },
  competitions: [
    {
      timeValid: false,
      status: { type: { name: 'STATUS_SCHEDULED', completed: false } },
      notes: [{ headline: 'Semifinals - Game 1' }],
      competitors: [home, away],
      ...over,
    },
  ],
})
const TBD_HOME = team('-1', 'TBD', 'home')
const TBD_AWAY = team('-2', 'TBD', 'away')

describe('splitTeamFeed', () => {
  it('keeps a TBD slot out of the games and records it as pending', () => {
    const played = feedEvent('401918014', 'New York Liberty at Minnesota Lynx', team('8', 'MIN', 'home'), team('9', 'NY', 'away'), {
      timeValid: true,
      notes: [{ headline: 'First Round - Game 1' }],
    })
    const slot = feedEvent('401918295', 'New York Liberty at Dream/Mystics', TBD_HOME, team('9', 'NY', 'away'))
    // Each game shows up in both teams' feeds; the split dedupes by id.
    const { games, pending } = splitTeamFeed([played, slot, played, slot], KNOWN)

    expect(games.map((g) => [g.id, g.home, g.away])).toEqual([['401918014', 'MIN', 'NY']])
    expect(pending).toEqual([
      {
        slot: '401918295',
        tip: '2026-10-04T04:00:00.000Z',
        timeTbd: true,
        seasonType: 'playoffs',
        home: null,
        away: 'NY',
        opponent: 'Dream/Mystics',
        round: 'SF',
        game: 1,
        note: 'Semifinals - Game 1',
      },
    ])
  })

  it('reads the undecided side from whichever end of the name it is on', () => {
    const slot = feedEvent('401918299', 'Dream/Mystics at New York Liberty', team('9', 'NY', 'home'), TBD_AWAY, {
      timeValid: true,
    })
    const [p] = splitTeamFeed([slot], KNOWN).pending
    expect([p.home, p.away, p.opponent, p.timeTbd]).toEqual(['NY', null, 'Dream/Mystics', undefined])
  })

  it('falls back to TBD when the name does not say, and drops what is not a playoff slot', () => {
    const unnamed = feedEvent('a', undefined, TBD_HOME, team('9', 'NY', 'away'))
    const regular = { ...feedEvent('b', 'x at y', TBD_HOME, team('9', 'NY', 'away')), seasonType: { id: '2' } }
    const bothTbd = feedEvent('c', 'TBD at TBD', TBD_HOME, TBD_AWAY)
    const { games, pending } = splitTeamFeed([unnamed, regular, bothTbd], KNOWN)
    expect(games).toEqual([])
    expect(pending.map((p) => [p.slot, p.opponent])).toEqual([['a', 'TBD']])
  })
})
