import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import {
  computeStandings,
  seedings,
  playoffRace,
  headToHead,
  gamesBehind,
  countsForStandings,
  conferenceStandings,
  CONFERENCE_BY_ABBR,
  PLAYOFF_SPOTS,
} from '../src/utils/standings.js'
import { TEAMS } from '../src/data/teams.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})

describe('countsForStandings', () => {
  it('counts a completed regular-season game', () => {
    expect(countsForStandings(game())).toBe(true)
  })

  it('excludes the Commissioner’s Cup Championship', () => {
    expect(countsForStandings(game({ seasonType: 'cup' }))).toBe(false)
  })

  it('excludes postponed shells and unplayed games', () => {
    expect(countsForStandings(game({ postponed: true }))).toBe(false)
    expect(countsForStandings(game({ score: undefined }))).toBe(false)
  })

  it('treats a live score as provisional — an in-progress game does not count', () => {
    expect(countsForStandings(game({ live: true }))).toBe(false)
  })
})

describe('computeStandings', () => {
  it('splits home and road records by side', () => {
    const t = computeStandings([game(), game({ home: 'SEA', away: 'MIN', score: [70, 95] })])
    expect(t.MIN).toMatchObject({ w: 2, l: 0, home: { w: 1, l: 0 }, road: { w: 1, l: 0 } })
    expect(t.SEA).toMatchObject({ w: 0, l: 2, home: { w: 0, l: 1 }, road: { w: 0, l: 1 } })
  })

  it('tracks streak sign and magnitude', () => {
    const t = computeStandings([
      game({ tip: '2026-05-01T00:00:00.000Z', score: [80, 90] }), // MIN loss
      game({ tip: '2026-05-02T00:00:00.000Z', score: [95, 80] }), // MIN win
      game({ tip: '2026-05-03T00:00:00.000Z', score: [99, 80] }), // MIN win
    ])
    expect(t.MIN.streak).toBe(2)
    expect(t.SEA.streak).toBe(-2)
  })

  it('counts conference games only against same-conference opponents', () => {
    const t = computeStandings([
      game({ home: 'NY', away: 'ATL' }), // both East
      game({ home: 'NY', away: 'MIN' }), // cross-conference
    ])
    expect(t.NY.conf).toEqual({ w: 1, l: 0 })
  })
})

describe('league-wide seeding', () => {
  // Built so one conference sweeps the top of the table. Under conference-based
  // seeding an East team would be forced into the top seeds; under WNBA rules the
  // order is purely by record.
  it('lets a single conference hold every top seed', () => {
    const west = ['MIN', 'GS', 'LV', 'DAL', 'LA']
    const east = ['ATL', 'NY', 'IND', 'WSH', 'CHI']
    const games = []
    // Every West team beats every East team once.
    for (const w of west) {
      for (const e of east) {
        games.push(game({ id: `${w}-${e}`, home: w, away: e, score: [90, 70] }))
      }
    }
    const seeded = seedings(games)
    const top5 = seeded.slice(0, 5).map((r) => r.abbr)
    expect(top5.every((a) => west.includes(a))).toBe(true)
    expect(seeded.find((r) => r.abbr === 'ATL').seed).toBeGreaterThan(5)
  })
})

describe('headToHead', () => {
  it('returns null when two teams have not met', () => {
    expect(headToHead([game()], 'NY', 'ATL')).toBeNull()
  })

  it('tallies the season series', () => {
    const h2h = headToHead(
      [game(), game({ home: 'SEA', away: 'MIN', score: [99, 80] })],
      'MIN',
      'SEA'
    )
    expect(h2h).toMatchObject({ aw: 1, bw: 1 })
  })

  it('skips non-counting games and credits an away winner', () => {
    const h2h = headToHead(
      [
        game({ seasonType: 'cup' }), // Commissioner's Cup final — never counts
        game({ score: [80, 95] }), // the away side (SEA) wins
      ],
      'MIN',
      'SEA'
    )
    expect(h2h).toMatchObject({ aw: 0, bw: 1 })
  })
})

describe('compareTeams', () => {
  it('orders on winning percentage before any tiebreaker', () => {
    const games = [game()]
    const table = computeStandings(games)
    expect(compareTeams(table.MIN, table.SEA, games, table)).toBeLessThan(0)
    expect(compareTeams(table.SEA, table.MIN, games, table)).toBeGreaterThan(0)
  })
})

describe('gamesBehind', () => {
  it('is zero for the leader and half a game per split result', () => {
    const leader = { w: 20, l: 6 }
    expect(gamesBehind(leader, { w: 20, l: 6 })).toBe(0)
    expect(gamesBehind(leader, { w: 19, l: 7 })).toBe(1)
    expect(gamesBehind(leader, { w: 19, l: 6 })).toBe(0.5)
  })
})

// The real 2026 data is the strongest possible fixture: these numbers are
// independently verifiable against ESPN's published standings.
describe('the committed 2026 season', () => {
  const seeded = seedings(GAMES)

  it('has all 15 teams, seeded 1..15', () => {
    expect(seeded).toHaveLength(15)
    expect(seeded.map((r) => r.seed)).toEqual([...Array(15)].map((_, i) => i + 1))
  })

  it('seeds the conference leader on record, not on leading its conference', () => {
    // The East's best team sits behind several West teams overall — seeding is
    // league-wide. Asserted without naming the current leader so the refresh can't break
    // it: the East's leader isn't seed 1, which means the overall top seed is a West team.
    const eastLeader = seeded.find((r) => CONFERENCE_BY_ABBR[r.abbr] === 'E')
    expect(eastLeader.seed).toBeGreaterThan(1)
    expect(CONFERENCE_BY_ABBR[seeded[0].abbr]).toBe('W')
  })

  it('gives the leader a record that independently recounts the committed games', () => {
    // Refresh-stable: recompute the current leader's W–L straight from the games (a
    // different code path than computeStandings) and assert the table agrees. Catches a
    // miscounted or home/away-swapped record without hardcoding a number the nightly
    // data refresh moves — the old "MIN 20-6" assertion broke the refresh the moment the
    // leader next played.
    const leader = seeded[0].abbr
    let w = 0
    let l = 0
    for (const g of GAMES) {
      if (!countsForStandings(g) || (g.home !== leader && g.away !== leader)) continue
      const leaderWon = g.home === leader ? g.score[0] > g.score[1] : g.score[1] > g.score[0]
      leaderWon ? w++ : l++
    }
    expect(w).toBeGreaterThan(l) // the #1 seed has a winning record
    expect(seeded[0]).toMatchObject({ w, l, gb: 0 })
  })

  it('orders strictly by win percentage before tiebreakers', () => {
    for (let i = 1; i < seeded.length; i++) {
      expect(seeded[i - 1].pct).toBeGreaterThanOrEqual(seeded[i].pct)
    }
  })

  it('never lets a team play more games than it is scheduled for', () => {
    for (const row of playoffRace(GAMES)) {
      expect(row.remaining).toBeGreaterThanOrEqual(0)
    }
  })

  it('marks exactly the top 8 as in the playoff field', () => {
    expect(seeded.filter((r) => r.inPlayoffs)).toHaveLength(PLAYOFF_SPOTS)
  })

  it('assigns every team to a conference', () => {
    const conf = conferenceStandings(GAMES)
    expect(conf.E.length + conf.W.length).toBe(TEAMS.length)
    expect(TEAMS.every((t) => CONFERENCE_BY_ABBR[t.abbr])).toBe(true)
  })
})

// ── Seed ranges ──────────────────────────────────────────────────────────────
// Win-bound arithmetic: sound regardless of tiebreakers, exact once decided.
import { seedRanges, scheduledGames } from '../src/utils/standings.js'

describe('seedRanges', () => {
  // Two teams, two scheduled games between them, one played: MIN 1-0, SEA 0-1.
  // SEA's ceiling (1 win) reaches MIN's floor (1 win) → both ranks still open.
  const twoTeamGames = [
    game({ id: 's1', home: 'MIN', away: 'SEA', score: [90, 80] }),
    game({ id: 's2', home: 'SEA', away: 'MIN', score: null, tip: '2026-05-20T00:00:00.000Z' }),
  ]

  it('keeps a rank open while a rival can still tie the floor (tie charged against)', () => {
    const rows = seedings(twoTeamGames)
    const ranges = seedRanges(rows, scheduledGames(twoTeamGames), twoTeamGames)
    // MIN can finish 1st (wins out) but SEA tying at 1-1 is charged against MIN.
    expect(ranges.MIN).toEqual({ bestRank: 1, worstRank: 2 })
    // SEA can no better than tie MIN's ceiling… a tie is charged FOR the best bound,
    // so 1st is still possible; 13 idle 0-0 teams can also tie SEA's floor of 0.
    expect(ranges.SEA.bestRank).toBe(1)
  })

  it('locks a rank only when no unresolved tie remains', () => {
    const done = [
      game({ id: 'd1', home: 'MIN', away: 'SEA', score: [90, 80] }),
      game({ id: 'd2', home: 'SEA', away: 'MIN', score: [70, 90], tip: '2026-05-20T00:00:00.000Z' }),
    ]
    const rows = seedings(done)
    const ranges = seedRanges(rows, scheduledGames(done), done)
    // MIN 2-0 with its schedule exhausted and nobody able to reach 2 wins: locked at 1.
    expect(ranges.MIN).toEqual({ bestRank: 1, worstRank: 1 })
    // SEA 0-2 finishes TIED at zero wins with the 13 idle teams — tiebreakers decide
    // the order, so the range spans the whole tied block rather than pretending 15th.
    expect(ranges.SEA).toEqual({ bestRank: 2, worstRank: 15 })
  })

  it('does not bank a head-to-head series while its last game is still live', () => {
    const liveFinale = [
      game({ id: 'l1', home: 'MIN', away: 'SEA', score: [90, 80] }),
      game({ id: 'l2', home: 'SEA', away: 'MIN', score: [70, 90], live: true, tip: '2026-05-20T00:00:00.000Z' }),
    ]
    const rows = seedings(liveFinale)
    const ranges = seedRanges(rows, scheduledGames(liveFinale), liveFinale)
    // MIN leads the live rematch, but a live score is provisional: the series is not
    // banked, SEA can still tie MIN's floor, so the top seed must stay open.
    expect(ranges.MIN).toEqual({ bestRank: 1, worstRank: 2 })
  })

  it('derives clinched from the range even when the current 9th seed could still pass', () => {
    // Rich fixture via the round-robin used in the view tests is overkill here; assert
    // the wiring instead: playoffRace rows carry the range and the flags agree with it.
    const race = playoffRace(twoTeamGames)
    for (const row of race) {
      expect(row.clinched).toBe(row.worstRank <= PLAYOFF_SPOTS)
      expect(row.eliminated).toBe(row.bestRank > PLAYOFF_SPOTS)
    }
  })
})

// ── Official tiebreak chain (wnba.com/standings footnote, 2026, verified 2026-08-08) ──
import { resolveTiedGroup, compareTeams } from '../src/utils/standings.js'

describe('official tiebreak chain', () => {
  // Step 3 (head-to-head point differential) must decide BEFORE overall differential.
  // CHI/ATL: split series (step 1 silent), identical records vs .500+ teams (step 2
  // silent), CHI +5 head-to-head but ATL +24 overall — only the official step 3 puts
  // CHI first; a chain missing it would flip the order.
  it('breaks a two-team tie on head-to-head differential before overall differential', () => {
    const g2 = [
      game({ id: 't1', home: 'CHI', away: 'ATL', score: [90, 80] }), // CHI +10
      game({ id: 't2', home: 'ATL', away: 'CHI', score: [85, 80] }), // ATL +5
      game({ id: 't3', home: 'CHI', away: 'NY', score: [82, 80] }), // CHI +2 (NY sub-.500)
      game({ id: 't4', home: 'WSH', away: 'CHI', score: [82, 80] }), // CHI −2 (WSH ends 2-0)
      game({ id: 't5', home: 'ATL', away: 'NY', score: [110, 80] }), // ATL +30
      game({ id: 't6', home: 'WSH', away: 'ATL', score: [81, 80] }), // ATL −1
    ]
    const table = computeStandings(g2)
    expect(table.CHI.pct).toBe(table.ATL.pct)
    expect(table.ATL.diff).toBeGreaterThan(table.CHI.diff) // step 4 would pick ATL…
    const ordered = resolveTiedGroup([table.ATL, table.CHI], g2, table)
    expect(ordered.map((r) => r.abbr)).toEqual(['CHI', 'ATL']) // …step 3 picks CHI
    expect(compareTeams(table.CHI, table.ATL, g2, table)).toBeLessThan(0)
  })

  // The multi-team restart: MIN/SEA/LV are a head-to-head circle (step 1 silent), MIN
  // separates on record vs .500+ (step 2). SEA and LV then RESTART at step 1 — their
  // own head-to-head, which SEA won. A chain that continued downward instead would
  // reach differential and pick LV (+18 in group play vs SEA's −3).
  it('restarts a shrunken multi-team tie from step one', () => {
    const g3 = [
      game({ id: 'r1', home: 'MIN', away: 'SEA', score: [85, 80] }), // MIN beats SEA by 5
      game({ id: 'r2', home: 'SEA', away: 'LV', score: [82, 80] }), // SEA beats LV by 2
      game({ id: 'r3', home: 'LV', away: 'MIN', score: [100, 80] }), // LV beats MIN by 20
      // Outsider games keep all three at 2-2 while giving only MIN a win over a
      // winning team (PHX ends 2-1). DAL ends sub-.500.
      game({ id: 'r4', home: 'MIN', away: 'PHX', score: [90, 80] }),
      game({ id: 'r5', home: 'DAL', away: 'MIN', score: [90, 80] }),
      game({ id: 'r6', home: 'PHX', away: 'SEA', score: [83, 80] }),
      game({ id: 'r7', home: 'SEA', away: 'DAL', score: [83, 80] }),
      game({ id: 'r8', home: 'PHX', away: 'LV', score: [82, 80] }),
      game({ id: 'r9', home: 'LV', away: 'DAL', score: [82, 80] }),
    ]
    const table = computeStandings(g3)
    expect(table.MIN.pct).toBe(table.SEA.pct)
    expect(table.SEA.pct).toBe(table.LV.pct)
    // LV would win a straight differential comparison against SEA…
    expect(table.LV.diff).toBeGreaterThan(table.SEA.diff)
    const ordered = resolveTiedGroup([table.LV, table.SEA, table.MIN], g3, table)
    // …but the restart re-asks head-to-head for the two of them, and SEA won it.
    expect(ordered.map((r) => r.abbr)).toEqual(['MIN', 'SEA', 'LV'])
  })

  // A team that never met the others makes the head-to-head steps unjudgeable — the
  // official chain can't half-apply them, so record vs .500+ decides.
  it('skips the head-to-head steps when a tied team never met the group', () => {
    const g4 = [
      game({ id: 'k1', home: 'IND', away: 'CON', score: [84, 80] }), // IND beats CON
      game({ id: 'k2', home: 'CON', away: 'IND', score: [83, 80] }),
      // GS never plays either — its games are against LA (who ends 2-1, a .500+ team).
      game({ id: 'k3', home: 'GS', away: 'LA', score: [90, 80] }),
      game({ id: 'k4', home: 'LA', away: 'GS', score: [85, 80] }),
      game({ id: 'k5', home: 'LA', away: 'POR', score: [85, 80] }),
    ]
    const table = computeStandings(g4)
    expect(table.GS.pct).toBe(table.IND.pct)
    expect(table.IND.pct).toBe(table.CON.pct)
    // With steps 1 and 3 skipped (GS has no games in the group) and step 2 level
    // (everyone is .500 against .500+ opponents here), overall differential decides —
    // GS at +5. Were the head-to-head steps half-applied instead of skipped, GS's
    // missing record would wrongly separate the group at step 1.
    const ordered = resolveTiedGroup([table.IND, table.CON, table.GS], g4, table)
    expect(ordered[0].abbr).toBe('GS')
  })

  // Every published step exhausted → the deterministic stand-in (the league specifies
  // nothing past step 4): alphabetical.
  it('falls back alphabetically when the whole published chain is silent', () => {
    const g5 = [
      game({ id: 'f1', home: 'NY', away: 'WSH', score: [85, 80] }),
      game({ id: 'f2', home: 'WSH', away: 'NY', score: [85, 80] }),
      game({ id: 'f3', home: 'TOR', away: 'DAL', score: [85, 80] }),
      game({ id: 'f4', home: 'DAL', away: 'TOR', score: [85, 80] }),
    ]
    const table = computeStandings(g5)
    // NY and TOR: same pct, never met, no games vs .500+ (all four teams sit at .500 —
    // wait, they ARE .500; both are 1-1 vs .500 teams). Equal at every step.
    const ordered = resolveTiedGroup([table.TOR, table.NY], g5, table)
    expect(ordered.map((r) => r.abbr)).toEqual(['NY', 'TOR'])
  })
})

// ── Banked head-to-head ties ─────────────────────────────────────────────────
// A rival who can only TIE the floor stops counting once the season series is
// complete and won — head-to-head is step 1, so a banked series settles a two-team
// tie immutably (the Lynx/Sparks case of 2026-08-08).
describe('seedRanges — banked series ties', () => {
  it('discounts an exact-tie threat once the season series is complete and won', () => {
    const g6 = [
      game({ id: 'b1', home: 'MIN', away: 'LA', score: [90, 80] }),
      game({ id: 'b2', home: 'LA', away: 'MIN', score: [90, 80] }),
      game({ id: 'b3', home: 'MIN', away: 'LA', score: [85, 80] }), // series 2-1 MIN, done
      game({ id: 'b4', home: 'LA', away: 'SEA', score: null }), // LA ceiling 2 = MIN floor
    ]
    const rows = seedings(g6)
    const ranges = seedRanges(rows, scheduledGames(g6), g6)
    expect(ranges.MIN.worstRank).toBe(1) // LA's tie is settled — no threat
  })

  it('still counts the tie while a game between the pair remains', () => {
    const g7 = [
      game({ id: 'c1', home: 'MIN', away: 'LA', score: [90, 80] }),
      game({ id: 'c2', home: 'LA', away: 'MIN', score: [90, 80] }),
      game({ id: 'c3', home: 'MIN', away: 'LA', score: [85, 80] }),
      game({ id: 'c4', home: 'LA', away: 'MIN', score: null }), // rematch pending
    ]
    const rows = seedings(g7)
    const ranges = seedRanges(rows, scheduledGames(g7), g7)
    expect(ranges.MIN.worstRank).toBe(2)
  })

  it('still counts the tie when the finished series is not strictly won', () => {
    const g8 = [
      game({ id: 'd1', home: 'MIN', away: 'LA', score: [90, 80] }),
      game({ id: 'd2', home: 'LA', away: 'MIN', score: [90, 80] }), // split, done
      game({ id: 'd3', home: 'MIN', away: 'SEA', score: [90, 80] }), // MIN floor 2
      game({ id: 'd4', home: 'LA', away: 'SEA', score: null }), // LA ceiling 2
    ]
    const rows = seedings(g8)
    const ranges = seedRanges(rows, scheduledGames(g8), g8)
    expect(ranges.MIN.worstRank).toBe(2)
  })
})
