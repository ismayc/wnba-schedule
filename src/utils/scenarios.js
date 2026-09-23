// Seeding scenarios: pick winners for the games left on the regular-season schedule,
// and enumerate every combination of the rest, to show which final seeds each team can
// still reach and exactly which results each one needs.
//
// Everything is ranked by the same official chain as the Regular Season table
// (rankTable in standings.js). Steps 1 and 2 (head-to-head record, record vs .500-or-
// better teams) depend only on who wins, so a picked season settles them exactly.
// Steps 3 and 4 are point differential, and a picked game has no score. A picked game
// is therefore booked as a one-point win to produce ONE order, and every split that
// steps 3 or 4 made is then re-checked against the whole range of margins a picked
// game could realistically finish by: 1 point up to the season's biggest blowout so
// far. Where that range could reorder the tied teams, each of them is given every seed
// the tied block spans, as "possible, depending on margins", instead of one seed
// presented as settled.

import { computeStandings, countsForStandings, rankTable, PLAYOFF_SPOTS } from './standings.js'

// Seed buckets reported per team: 1..PLAYOFF_SPOTS, then one "out" bucket.
export const OUT = PLAYOFF_SPOTS + 1

// Enumeration cap: 2^12 = 4,096 complete seasons, each ranked and margin-checked in
// about a quarter of a second. Past that the view asks for more picks instead of
// freezing the tab.
export const MAX_OPEN_GAMES = 12

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

// The widest margin a picked game is allowed to finish by: the biggest winning margin
// in the real results so far (at least 1).
export const maxMargin = (games) =>
  games
    .filter(countsForStandings)
    .reduce((m, g) => Math.max(m, Math.abs(g.score[0] - g.score[1])), 1)

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

// The range a team's step-3 or step-4 differential could take over every margin a
// picked game could finish by: real games count as played, each picked win adds 1..M
// and each picked loss takes away 1..M. `group` limits it to games among the tied
// teams (step 3); `gp` is how many such games there are, since step 3 is skipped when
// a tied team never met the others.
function diffRange(row, group, margin) {
  let real = 0
  let won = 0
  let lost = 0
  let gp = 0
  for (const r of row.results) {
    if (group && !group.has(r.opp)) continue
    gp++
    if (!r.hypothetical) real += r.pf - r.pa
    else if (r.won) won++
    else lost++
  }
  return { lo: real + won - lost * margin, hi: real + won * margin - lost, picked: won + lost, gp }
}

// Does `b` finish ahead of `a` at EVERY margin? Steps 3 then 4, lexicographically:
// step 4 only matters where step 3 is skipped or is level whatever the margins.
function aheadAtAnyMargin(b, a, s3ok) {
  if (s3ok) {
    if (b.s3.lo > a.s3.hi) return true
    const levelAlways = b.s3.lo === b.s3.hi && a.s3.lo === a.s3.hi && a.s3.lo === b.s3.lo
    if (!levelAlways) return false
  }
  return b.s4.lo > a.s4.hi
}

// Final seed position range (1-based) for every team in one ranked scenario.
//
// Steps 1 and 2 and the win-loss records depend only on who wins, so every tied group
// the chain reaches step 3 with is the same at any margin. Each such group leaves one
// trace entry with step 3, 4 or 5 (whichever split it, or the alphabetical stand-in),
// and occupies a fixed block of positions. Inside that block, a team's place is only
// certain relative to rivals it beats (or trails) at every margin; against the rest it
// could land either side. So a team can land anywhere from (block start + rivals ahead
// at every margin) to (block start + rivals not behind at every margin). Everything
// below that group can move with the margins, so the outermost such group decides.
// Marks each margin-decided trace entry with `margin: true`.
function positionRanges(rows, trace, table, margin) {
  const index = Object.fromEntries(rows.map((r, i) => [r.abbr, i]))
  const ranges = Object.fromEntries(rows.map((r, i) => [r.abbr, [i + 1, i + 1]]))
  const settled = new Set()
  for (const entry of trace) {
    if (entry.step < 3 || entry.teams.some((t) => settled.has(t))) continue
    for (const t of entry.teams) settled.add(t)
    const group = new Set(entry.teams)
    const span = entry.teams.map((t) => ({
      t,
      s3: diffRange(table[t], group, margin),
      s4: diffRange(table[t], null, margin),
    }))
    const s3ok = span.every((x) => x.s3.gp > 0)
    const start = Math.min(...entry.teams.map((t) => index[t])) + 1
    // Two teams no picked game touches keep their order relative to each other.
    const fixedPair = (a, b) => !a.s4.picked && !b.s4.picked
    const ahead = (b, a) =>
      fixedPair(a, b) ? index[b.t] < index[a.t] : aheadAtAnyMargin(b, a, s3ok)
    const next = span.map((a) => {
      const others = span.filter((b) => b !== a)
      return [
        start + others.filter((b) => ahead(b, a)).length,
        start + others.filter((b) => !ahead(a, b)).length,
      ]
    })
    // Only a picked margin can move anything: with none in play the order stands.
    const picked = span.some((x) => x.s4.picked)
    if (!picked || next.every(([lo, hi]) => lo === hi)) continue
    entry.margin = true
    span.forEach((a, i) => (ranges[a.t] = next[i]))
  }
  return ranges
}

const resultOf = (g, side) => (side === 'home' ? [g.id, g.home, g.away] : [g.id, g.away, g.home])

function rankBooked(base, booked, margin) {
  const table = bookResults(base, booked)
  const trace = []
  const rows = rankTable(table, trace)
  const ranges = positionRanges(rows, trace, table, margin)
  return { rows, trace, ranges }
}

// Rank one fully decided season: the real results plus `picks` for every open game.
// Returns the ordered rows (picked games as one-point wins), how each tie was broken
// (entries a margin could flip carry `margin: true`), each team's possible seed range,
// and whether any order hinges on a picked margin.
export function rankScenario(games, picks) {
  const base = computeStandings(games.filter(countsForStandings))
  const booked = remainingGames(games)
    .filter((g) => picks[g.id])
    .map((g) => resultOf(g, picks[g.id]))
  const margin = maxMargin(games)
  const out = rankBooked(base, booked, margin)
  return { ...out, margin, marginDependent: out.trace.some((t) => t.margin) }
}

const bucket = (pos) => Math.min(pos, OUT)

/**
 * Enumerate every completion of the season consistent with `picks`.
 *
 * Returns { open, undecided, total, tooMany, margin, teams } where `teams[abbr]` holds,
 * per seed bucket (1..PLAYOFF_SPOTS and OUT):
 *   count      — scenarios that land the team in that bucket whatever the margins
 *   maybe      — scenarios where it lands there only for some margins
 *   homeWins   — per undecided game, how many of the count + maybe scenarios the home
 *                team won (what the bucket requires)
 *   tiebreaks  — { step: n }: how many of those scenarios a tiebreak step helped decide
 *                the team's place
 *   example    — a scenario (bitmask over `undecided`) that lands the team there,
 *                preferring one that does so whatever the margins
 * With more than `max` undecided games nothing is enumerated and `tooMany` is set.
 */
export function enumerateScenarios(games, picks = {}, { max = MAX_OPEN_GAMES } = {}) {
  const open = remainingGames(games)
  const undecided = open.filter((g) => !picks[g.id])
  const margin = maxMargin(games)
  const result = { open, undecided, total: 0, margin, tooMany: undecided.length > max, teams: {} }
  if (result.tooMany) return result

  const base = computeStandings(games.filter(countsForStandings))
  const fixed = open.filter((g) => picks[g.id]).map((g) => resultOf(g, picks[g.id]))
  for (const abbr of Object.keys(base)) {
    result.teams[abbr] = {}
    for (let s = 1; s <= OUT; s++) {
      result.teams[abbr][s] = {
        count: 0,
        maybe: 0,
        homeWins: undecided.map(() => 0),
        tiebreaks: {},
        example: null,
        sure: false,
      }
    }
  }

  const n = undecided.length
  result.total = 2 ** n
  for (let mask = 0; mask < result.total; mask++) {
    const booked = [...fixed]
    undecided.forEach((g, i) => booked.push(resultOf(g, mask & (1 << i) ? 'home' : 'away')))
    const { trace, ranges } = rankBooked(base, booked, margin)
    for (const [abbr, [lo, hi]] of Object.entries(ranges)) {
      const steps = new Set(trace.filter((t) => t.teams.includes(abbr)).map((t) => t.step))
      const sure = bucket(lo) === bucket(hi)
      for (let s = bucket(lo); s <= bucket(hi); s++) {
        const cell = result.teams[abbr][s]
        if (sure) cell.count++
        else cell.maybe++
        for (const step of steps) cell.tiebreaks[step] = (cell.tiebreaks[step] ?? 0) + 1
        if (cell.example === null || (sure && !cell.sure)) {
          cell.example = mask
          cell.sure = sure
        }
        for (let j = 0; j < n; j++) if (mask & (1 << j)) cell.homeWins[j]++
      }
    }
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
  const possible = cell.count + cell.maybe
  if (!possible) return []
  const out = []
  undecided.forEach((game, i) => {
    if (cell.homeWins[i] === possible) out.push({ game, side: 'home' })
    else if (cell.homeWins[i] === 0) out.push({ game, side: 'away' })
  })
  return out
}

// A team's mean seed bucket across the enumerated scenarios (OUT counted as OUT, and a
// margin-dependent outcome counted at every seed it could reach), used to order the
// matrix from favorite to longshot.
export function meanSeed(team) {
  let sum = 0
  let total = 0
  for (let s = 1; s <= OUT; s++) {
    const n = team[s].count + team[s].maybe
    sum += s * n
    total += n
  }
  return sum / total
}

// Whole-number percentages for one team's row that add up exactly. Rounding each cell on
// its own can leave a row at 99% or 101% (13 + 75 + 13 = 101). This uses the
// largest-remainder method instead: every cell gets its floor, and the points still
// missing go to the cells with the biggest fractional parts (the bigger count, then the
// better seed, breaks a tie). The row sums to 100 unless some outcomes land only
// depending on margins, whose seeds are uncertain and are left out of the percentages.
// Returns { [seed]: percent } for the buckets with a certain count.
export function rowPercents(team, total) {
  const cells = []
  let certain = 0
  for (let s = 1; s <= OUT; s++) {
    const { count } = team[s]
    if (!count) continue
    certain += count
    const exact = (100 * count) / total
    cells.push({ s, count, pct: Math.floor(exact), rest: exact - Math.floor(exact) })
  }
  let missing = Math.round((100 * certain) / total) - cells.reduce((n, c) => n + c.pct, 0)
  const byRest = [...cells].sort((a, b) => b.rest - a.rest || b.count - a.count || a.s - b.s)
  for (const c of byRest) {
    if (missing <= 0) break
    c.pct++
    missing--
  }
  return Object.fromEntries(cells.map((c) => [c.s, c.pct]))
}
