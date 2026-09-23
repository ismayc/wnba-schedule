// Seeding scenarios: pick winners for the games left on the regular-season schedule,
// and enumerate every combination of the rest, to show which final seeds each team can
// still reach and exactly which results each one needs.
//
// Everything is ranked by the same official chain as the Regular Season table
// (rankTable in standings.js), so a fully picked scenario is exactly the seeding the
// league would publish, with one caveat: a picked game has no score. Steps 3 and 4 of
// the chain are point differential, so a hypothetical result is booked as a one-point
// win, and any order that a hypothetical margin decides is flagged as
// margin-dependent rather than presented as settled.

import { computeStandings, countsForStandings, rankTable, PLAYOFF_SPOTS } from './standings.js'

// Seed buckets reported per team: 1..PLAYOFF_SPOTS, then one "out" bucket.
export const OUT = PLAYOFF_SPOTS + 1

// Enumeration cap: 2^13 = 8,192 complete seasons, ranked in about a third of a second.
// Past that the view asks for more picks instead of freezing the tab.
export const MAX_OPEN_GAMES = 13

export const TIEBREAK_STEPS = {
  1: 'head-to-head record',
  2: 'record vs .500-or-better teams',
  3: 'head-to-head point differential',
  4: 'overall point differential',
  5: 'alphabetical order (no league rule applies)',
}

// Games still to be decided. A live score is provisional, so an in-progress game is
// open here exactly as it is in the standings.
export const remainingGames = (games) =>
  games
    .filter((g) => g.seasonType === 'regular' && !g.postponed && !g.canceled && (!g.score || g.live))
    .sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))

// Picks for the favorite in every open game: the better current record, the home team
// on a tie. `table` is computeStandings over the real results.
export function favoritePicks(open, table) {
  const picks = {}
  for (const g of open) picks[g.id] = table[g.away].pct > table[g.home].pct ? 'away' : 'home'
  return picks
}

// A copy of `table` with extra results booked. `results` is a list of
// [gameId, winnerAbbr, loserAbbr] tuples; only the rows they touch are copied.
function bookResults(table, results) {
  const out = { ...table }
  const touched = new Set()
  const add = (abbr, entry) => {
    if (!touched.has(abbr)) {
      touched.add(abbr)
      out[abbr] = { ...out[abbr], results: [...out[abbr].results] }
    }
    out[abbr].results.push(entry)
  }
  for (const [id, winner, loser] of results) {
    add(winner, { id, won: true, opp: loser, pf: 1, pa: 0, hypothetical: true })
    add(loser, { id, won: false, opp: winner, pf: 0, pa: 1, hypothetical: true })
  }
  for (const abbr of touched) {
    const row = out[abbr]
    row.w = row.results.filter((r) => r.won).length
    row.l = row.results.length - row.w
    row.gp = row.results.length
    row.pct = row.w / row.gp
    row.pf = row.results.reduce((n, r) => n + r.pf, 0)
    row.pa = row.results.reduce((n, r) => n + r.pa, 0)
    row.diff = row.pf - row.pa
  }
  return out
}

// Did a hypothetical margin decide any split in this trace? Step 3 looks only at games
// among the tied group; step 4 at every game the group played.
function marginDependent(trace, table) {
  return trace.some(({ step, teams }) => {
    if (step === 4) return teams.some((t) => table[t].results.some((r) => r.hypothetical))
    if (step !== 3) return false
    const group = new Set(teams)
    return teams.some((t) => table[t].results.some((r) => r.hypothetical && group.has(r.opp)))
  })
}

const resultOf = (g, side) => (side === 'home' ? [g.id, g.home, g.away] : [g.id, g.away, g.home])

// Rank one fully decided season: the real results plus `picks` for every open game.
// Returns the ordered rows, how each tie was broken, and the margin flag.
export function rankScenario(games, picks) {
  const base = computeStandings(games.filter(countsForStandings))
  const booked = remainingGames(games)
    .filter((g) => picks[g.id])
    .map((g) => resultOf(g, picks[g.id]))
  const table = bookResults(base, booked)
  const trace = []
  const rows = rankTable(table, trace)
  return { rows, trace, marginDependent: marginDependent(trace, table) }
}

/**
 * Enumerate every completion of the season consistent with `picks`.
 *
 * Returns { open, undecided, total, tooMany, teams } where `teams[abbr]` holds, per
 * seed bucket (1..PLAYOFF_SPOTS and OUT):
 *   count     — scenarios that land the team in that bucket
 *   margin    — how many of those hinge on a hypothetical margin
 *   homeWins  — per undecided game, how many of those scenarios the home team won
 *   example   — the first such scenario, as a bitmask over `undecided`
 * With more than `max` undecided games nothing is enumerated and `tooMany` is set.
 */
export function enumerateScenarios(games, picks = {}, { max = MAX_OPEN_GAMES } = {}) {
  const open = remainingGames(games)
  const undecided = open.filter((g) => !picks[g.id])
  const result = { open, undecided, total: 0, tooMany: undecided.length > max, teams: {} }
  if (result.tooMany) return result

  const base = computeStandings(games.filter(countsForStandings))
  const fixed = open.filter((g) => picks[g.id]).map((g) => resultOf(g, picks[g.id]))
  for (const abbr of Object.keys(base)) {
    result.teams[abbr] = {}
    for (let s = 1; s <= OUT; s++) {
      result.teams[abbr][s] = { count: 0, margin: 0, homeWins: undecided.map(() => 0), example: null }
    }
  }

  const n = undecided.length
  result.total = 2 ** n
  for (let mask = 0; mask < result.total; mask++) {
    const booked = [...fixed]
    undecided.forEach((g, i) => booked.push(resultOf(g, mask & (1 << i) ? 'home' : 'away')))
    const table = bookResults(base, booked)
    const trace = []
    const rows = rankTable(table, trace)
    const hinges = marginDependent(trace, table)
    rows.forEach((row, i) => {
      const cell = result.teams[row.abbr][Math.min(i + 1, OUT)]
      cell.count++
      if (hinges) cell.margin++
      if (cell.example === null) cell.example = mask
      for (let j = 0; j < n; j++) if (mask & (1 << j)) cell.homeWins[j]++
    })
  }
  return result
}

// The picks that reproduce scenario `mask` over the undecided games, merged onto the
// picks already made.
export function picksFromMask(undecided, mask, picks = {}) {
  const out = { ...picks }
  undecided.forEach((g, i) => (out[g.id] = mask & (1 << i) ? 'home' : 'away'))
  return out
}

// What a seed bucket demands: the undecided games whose result is the same in every
// scenario that lands the team there. Returns [{ game, side }] in schedule order.
export function requirements(cell, undecided) {
  if (!cell.count) return []
  const out = []
  undecided.forEach((game, i) => {
    if (cell.homeWins[i] === cell.count) out.push({ game, side: 'home' })
    else if (cell.homeWins[i] === 0) out.push({ game, side: 'away' })
  })
  return out
}

// A team's mean seed bucket across the enumerated scenarios (OUT counted as OUT), used
// to order the matrix from favorite to longshot.
export function meanSeed(team) {
  let sum = 0
  let total = 0
  for (let s = 1; s <= OUT; s++) {
    sum += s * team[s].count
    total += team[s].count
  }
  return sum / total
}
