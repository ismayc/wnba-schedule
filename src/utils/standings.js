// Standings, seeding, and playoff-race math — all pure functions over the merged
// game list, so they can be unit-tested with synthetic arrays and no DOM.

import { TEAMS, TEAM_BY_ABBR } from '../data/teams.js'
import { scenarioClinched } from './raceScenarios.js'

export const CONFERENCES = { E: 'Eastern Conference', W: 'Western Conference' }

// The WNBA has no divisions, and since 2016 the playoff field is the top 8 by record
// LEAGUE-WIDE — conference is presentational only. That is the single most important
// structural difference from a group-stage tournament.
export const PLAYOFF_SPOTS = 8

// Conference assignment isn't in ESPN's team feed, so it lives here. Verified against
// the standings endpoint's E/W grouping.
export const CONFERENCE_BY_ABBR = {
  ATL: 'E', CHI: 'E', CON: 'E', IND: 'E', NY: 'E', TOR: 'E', WSH: 'E',
  DAL: 'W', GS: 'W', LA: 'W', LV: 'W', MIN: 'W', PHX: 'W', POR: 'W', SEA: 'W',
}

// A game only counts toward the standings if it is a completed regular-season game.
// The Commissioner's Cup Championship and postponed shells are explicitly excluded —
// this is what makes derived records match the official ones exactly. A live game's
// score is provisional (the overlay sets `live`), so it does not count until final.
export const countsForStandings = (g) =>
  g.seasonType === 'regular' && !!g.score && !g.live && !g.postponed && !g.canceled

const blankRecord = (abbr) => ({
  abbr,
  team: TEAM_BY_ABBR[abbr],
  w: 0,
  l: 0,
  pf: 0,
  pa: 0,
  home: { w: 0, l: 0 },
  road: { w: 0, l: 0 },
  conf: { w: 0, l: 0 },
  last10: [],
  streak: 0,
  results: [],
})

export function computeStandings(games) {
  const table = Object.fromEntries(TEAMS.map((t) => [t.abbr, blankRecord(t.abbr)]))

  const played = games.filter(countsForStandings).sort((a, b) => a.tip.localeCompare(b.tip))

  for (const g of played) {
    const [hs, as] = g.score
    const homeWon = hs > as
    const rows = [
      [table[g.home], homeWon, hs, as, 'home', g.away],
      [table[g.away], !homeWon, as, hs, 'road', g.home],
    ]
    for (const [row, won, pf, pa, side, opp] of rows) {
      if (!row) continue
      row[won ? 'w' : 'l']++
      row.pf += pf
      row.pa += pa
      row[side][won ? 'w' : 'l']++
      if (CONFERENCE_BY_ABBR[opp] === CONFERENCE_BY_ABBR[row.abbr]) row.conf[won ? 'w' : 'l']++
      row.results.push({ id: g.id, won, opp, side, pf, pa, tip: g.tip })
    }
  }

  for (const row of Object.values(table)) {
    row.gp = row.w + row.l
    row.pct = row.gp ? row.w / row.gp : 0
    row.diff = row.pf - row.pa
    row.ppg = row.gp ? row.pf / row.gp : 0
    row.oppPpg = row.gp ? row.pa / row.gp : 0
    row.netPpg = row.ppg - row.oppPpg
    row.last10 = row.results.slice(-10).map((r) => r.won)
    // Positive = win streak, negative = loss streak.
    row.streak = row.results.reduceRight((acc, r, i, arr) => {
      if (acc !== null) return acc
      const dir = r.won
      let n = 0
      for (let j = arr.length - 1; j >= 0 && arr[j].won === dir; j--) n++
      return dir ? n : -n
    }, null) ?? 0
  }

  return table
}

// Head-to-head win% between two teams, or null when they haven't met.
export function headToHead(games, a, b) {
  let aw = 0
  let bw = 0
  for (const g of games) {
    if (!countsForStandings(g)) continue
    const pair = [g.home, g.away]
    if (!pair.includes(a) || !pair.includes(b)) continue
    const winner = g.score[0] > g.score[1] ? g.home : g.away
    if (winner === a) aw++
    else bw++
  }
  if (!aw && !bw) return null
  return { aw, bw, pct: aw / (aw + bw) }
}

// The official WNBA tiebreak chain — the full published procedure, verbatim order from
// the wnba.com/standings footnote (2026 season page, verified 2026-08-08):
//   1. Better record in head-to-head games
//   2. Better winning percentage against all teams .500 or better at season's end
//      (we apply it to the table as it stands — identical once the season is over)
//   3. Better point differential head-to-head
//   4. Better point differential against all opponents
// No step references conference or division (seeding is league-wide), and the league
// publishes NOTHING past step 4 — the alphabetical last resort in resolveTiedGroup is
// our own deterministic stand-in, not a league rule.

// Step 2's metric: win% against opponents currently at .500 or better. A team with no
// such games sits at 0 — no qualifying wins is genuinely the weakest showing.
const vsWinningPct = (row, table) => {
  const rel = row.results.filter((r) => (table[r.opp]?.pct ?? 0) >= 0.5)
  return rel.length ? rel.filter((r) => r.won).length / rel.length : 0
}

// Steps 1 and 3 against a tied GROUP: record and point differential in games among its
// members only. gp 0 means the step can't judge this team (it never met the others).
const vsGroup = (row, groupSet) => {
  let w = 0
  let gp = 0
  let diff = 0
  for (const r of row.results) {
    if (!groupSet.has(r.opp)) continue
    gp++
    if (r.won) w++
    diff += r.pf - r.pa
  }
  return { gp, pct: gp ? w / gp : null, diff }
}

// Order a group of teams tied on winning percentage, per the official multi-team rule
// (verbatim): "If more than two teams tied, then as many teams will be eliminated at
// each step. As soon as one or more teams are eliminated at any step, the process must
// begin again from step one." Splitting into blocks and recursing on each restarts the
// chain from step 1 for every block that is still tied — exactly that rule. A step
// whose metric can't judge every team (someone never met the group) is skipped whole
// rather than half-applied.
export function resolveTiedGroup(rows, games, table) {
  if (rows.length <= 1) return rows
  const groupSet = new Set(rows.map((r) => r.abbr))
  const group = rows.map((row) => ({ row, vs: vsGroup(row, groupSet) }))

  const steps = [
    // 1. Head-to-head record among the tied teams.
    group.some((g) => g.vs.pct === null) ? null : (g) => g.vs.pct,
    // 2. Win% vs .500-or-better teams.
    (g) => vsWinningPct(g.row, table),
    // 3. Head-to-head point differential among the tied teams.
    group.some((g) => g.vs.gp === 0) ? null : (g) => g.vs.diff,
    // 4. Overall point differential.
    (g) => g.row.diff,
  ]

  for (const metric of steps) {
    if (!metric) continue
    const values = group.map((g) => metric(g))
    if (new Set(values).size < 2) continue // no one separates — next step
    // Someone separates: order the blocks, then restart from step 1 inside each.
    const byValue = new Map()
    group.forEach((g, i) => {
      const list = byValue.get(values[i]) ?? []
      list.push(g.row)
      byValue.set(values[i], list)
    })
    return [...byValue.entries()]
      .sort((x, y) => y[0] - x[0])
      .flatMap(([, block]) => resolveTiedGroup(block, games, table))
  }

  // Beyond the published chain — deterministic stand-in (the league specifies nothing).
  return [...rows].sort((a, b) => a.abbr.localeCompare(b.abbr))
}

// Pairwise view of the same chain, kept for spot checks and tests: for two teams the
// group resolver and this comparator agree by construction.
export function compareTeams(a, b, games, table) {
  if (b.pct !== a.pct) return b.pct - a.pct
  const ordered = resolveTiedGroup([a, b], games, table)
  return ordered[0].abbr === a.abbr ? -1 : 1
}

// Games behind the leader: the standard (leadΔwins + leadΔlosses) / 2.
export const gamesBehind = (leader, row) =>
  ((leader.w - row.w) + (row.l - leader.l)) / 2

export function seedings(games) {
  const table = computeStandings(games)
  // Group exact winning-percentage ties, then run each group through the official
  // chain — the multi-team procedure is NOT a pairwise sort (its restart rule can
  // order three teams differently than three pairwise comparisons would).
  const byPct = new Map()
  for (const row of Object.values(table)) {
    const list = byPct.get(row.pct) ?? []
    list.push(row)
    byPct.set(row.pct, list)
  }
  const rows = [...byPct.entries()]
    .sort((a, b) => b[0] - a[0])
    .flatMap(([, group]) => resolveTiedGroup(group, games, table))
  const leader = rows[0]
  return rows.map((row, i) => ({
    ...row,
    seed: i + 1,
    gb: gamesBehind(leader, row),
    inPlayoffs: i < PLAYOFF_SPOTS,
  }))
}

export function conferenceStandings(games) {
  const seeded = seedings(games)
  const byConf = { E: [], W: [] }
  for (const row of seeded) byConf[CONFERENCE_BY_ABBR[row.abbr]]?.push(row)
  for (const conf of Object.keys(byConf)) {
    const leader = byConf[conf][0]
    byConf[conf] = byConf[conf].map((row, i) => ({
      ...row,
      confRank: i + 1,
      /* v8 ignore next -- `: 0` is unreachable: both conferences always contain teams, so `leader` is always defined */
      confGb: leader ? gamesBehind(leader, row) : 0,
    }))
  }
  return byConf
}

// ── Playoff race ─────────────────────────────────────────────────────────────
// Total regular-season games each team plays, from the schedule itself rather than a
// hard-coded 44 — expansion years and makeup games move this number.
export function scheduledGames(games) {
  const total = {}
  for (const g of games) {
    if (g.seasonType !== 'regular' || g.postponed || g.canceled) continue
    total[g.home] = (total[g.home] || 0) + 1
    total[g.away] = (total[g.away] || 0) + 1
  }
  return total
}

// Magic number to clinch a spot ahead of a chaser: the wins-plus-chaser-losses needed
// to make catching up arithmetically impossible. Null once already clinched.
export function magicNumber(row, chaser, totals) {
  const chaserRemaining = (totals[chaser.abbr] ?? 0) - chaser.gp
  const n = chaserRemaining - (row.w - chaser.w) + 1
  return n <= 0 ? null : n
}

// Season series ledger for every pair that has met or will meet: wins each way plus
// how many of their scheduled meetings are still unplayed. Keyed "A|B" with the abbrs
// sorted, so either team can look the pair up.
function seriesLedger(games) {
  const ledger = new Map()
  const at = (a, b) => {
    const key = [a, b].sort().join('|')
    let e = ledger.get(key)
    if (!e) ledger.set(key, (e = { wins: {}, remaining: 0 }))
    return e
  }
  for (const g of games) {
    if (g.seasonType !== 'regular' || g.postponed || g.canceled) continue
    const e = at(g.home, g.away)
    if (!g.score || g.live) e.remaining++
    else {
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      e.wins[winner] = (e.wins[winner] ?? 0) + 1
    }
  }
  return ledger
}

// The window of final seeds still arithmetically open to each team, from win bounds:
// a rival can still finish ahead of you only if its ceiling (win out) reaches your
// floor (lose out). Ties are charged AGAINST the team for the worst bound and FOR it
// for the best bound — with ONE refinement: a rival who can only TIE the floor (never
// strictly pass it) stops counting once the season series between the pair is complete
// and won, because head-to-head is step 1 of the official chain and a banked series
// settles a two-team tie immutably. (A multi-way tie at the same win count could in
// principle reorder a group by ITS head-to-heads — the exotic case this refinement
// accepts; closing it would take a full scenario engine.) bestRank stays purely
// arithmetic, so elimination is never declared off a tiebreaker assumption.
// bestRank === worstRank therefore means the seed is truly locked.
export function seedRanges(rows, totals, games) {
  const ledger = seriesLedger(games)
  const bounds = rows.map((row) => ({
    abbr: row.abbr,
    floor: row.w,
    ceiling: row.w + ((totals[row.abbr] ?? 0) - row.gp),
  }))
  const out = {}
  for (const b of bounds) {
    let ahead = 0 // rivals guaranteed to finish strictly ahead
    let couldPass = 0 // rivals that could still finish ahead of (or tied with) us
    for (const r of bounds) {
      if (r.abbr === b.abbr) continue
      if (r.floor > b.ceiling) ahead++
      if (r.ceiling > b.floor) couldPass++
      else if (r.ceiling === b.floor) {
        // Tie-only threat: discounted when the pair's series is finished and ours.
        const e = ledger.get([b.abbr, r.abbr].sort().join('|'))
        const banked = e && e.remaining === 0 && (e.wins[b.abbr] ?? 0) > (e.wins[r.abbr] ?? 0)
        if (!banked) couldPass++
      }
    }
    out[b.abbr] = { bestRank: 1 + ahead, worstRank: 1 + couldPass }
  }
  return out
}

export function playoffRace(games) {
  const seeded = seedings(games)
  const totals = scheduledGames(games)
  const cut = seeded[PLAYOFF_SPOTS - 1]
  const firstOut = seeded[PLAYOFF_SPOTS]
  const ranges = seedRanges(seeded, totals, games)

  return seeded.map((row) => {
    const remaining = (totals[row.abbr] ?? 0) - row.gp
    const { bestRank, worstRank } = ranges[row.abbr]
    // Clinched when no outcome leaves the team below the cut: first the win-bound
    // ranges (with banked head-to-head ties discounted), then — once the coupled
    // late-season schedule is small enough to enumerate — the exact scenario check,
    // which also sees that two chasers who still play each other can't both win out.
    // Elimination stays purely arithmetic; see raceScenarios.js for the contract.
    const eliminated = bestRank > PLAYOFF_SPOTS
    const clinched =
      worstRank <= PLAYOFF_SPOTS ||
      (!eliminated &&
        scenarioClinched(row.abbr, seeded, totals, games, PLAYOFF_SPOTS) === true)
    return {
      ...row,
      remaining,
      bestRank,
      worstRank,
      clinched,
      eliminated,
      /* v8 ignore next -- `: 0` is unreachable: the 15-team league always yields an 8th seed, so `cut` is always defined */
      gbCut: cut ? gamesBehind(cut, row) : 0,
      magic: row.inPlayoffs && firstOut && !clinched ? magicNumber(row, firstOut, totals) : null,
    }
  })
}
