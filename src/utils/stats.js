// Season-wide derived stats. Everything here is a pure function of the merged game
// list or the committed player table — no fetching, no DOM.

import { PLAYERS } from '../data/leaders.js'
import { countsForStandings, computeStandings } from './standings.js'

export function seasonTotals(games) {
  const played = games.filter(countsForStandings)
  const totalPoints = played.reduce((n, g) => n + g.score[0] + g.score[1], 0)
  const ot = played.filter((g) => g.ot)
  const scheduled = games.filter((g) => g.seasonType === 'regular' && !g.postponed && !g.canceled)

  const withMargin = played.map((g) => ({ ...g, margin: Math.abs(g.score[0] - g.score[1]) }))
  const byMargin = [...withMargin].sort((a, b) => a.margin - b.margin)
  const byTotal = [...played].sort((a, b) => b.score[0] + b.score[1] - (a.score[0] + a.score[1]))

  return {
    played: played.length,
    scheduled: scheduled.length,
    remaining: scheduled.length - played.length,
    totalPoints,
    ppg: played.length ? totalPoints / played.length / 2 : 0,
    combinedPpg: played.length ? totalPoints / played.length : 0,
    // Home-court advantage, measured rather than assumed.
    homeWins: played.filter((g) => g.score[0] > g.score[1]).length,
    homeWinPct: played.length
      ? played.filter((g) => g.score[0] > g.score[1]).length / played.length
      : 0,
    otGames: ot,
    // A one-possession game: three points or fewer.
    nailbiters: withMargin.filter((g) => g.margin <= 3),
    blowouts: withMargin.filter((g) => g.margin >= 20),
    closest: byMargin.slice(0, 5),
    highestScoring: byTotal.slice(0, 5),
  }
}

// Offensive and defensive strength as points per game. Deliberately NOT called
// "efficiency" or "rating" — those are per-100-possessions measures, and the public
// feeds don't expose possession counts, so anything labelled that way would be wrong.
export function teamScoring(games) {
  const table = computeStandings(games)
  return rankScoring(
    Object.values(table)
      .filter((r) => r.gp > 0)
      .map((r) => ({
        abbr: r.abbr,
        team: r.team,
        gp: r.gp,
        ppg: r.ppg,
        oppPpg: r.oppPpg,
        netPpg: r.netPpg,
        pct: r.pct,
      }))
  )
}

// Season scoring for an ARCHIVED season, whose regular-season games aren't committed —
// the standings rows carry points for and against, which is all this needs. Sharing
// rankScoring with the live path means an archived margin chart ranks by the same rule.
export function seasonScoring(standings, teamByAbbr) {
  return rankScoring(
    standings.map((r) => {
      const gp = r.w + r.l
      return {
        abbr: r.abbr,
        team: teamByAbbr[r.abbr],
        gp,
        ppg: r.pf / gp,
        oppPpg: r.pa / gp,
        netPpg: (r.pf - r.pa) / gp,
        pct: r.pct,
      }
    })
  )
}

// Offence, defence and net rank, added to rows that already carry the per-game numbers.
export function rankScoring(rows) {
  const rank = (key, dir = -1) => {
    const sorted = [...rows].sort((a, b) => (a[key] - b[key]) * dir)
    return Object.fromEntries(sorted.map((r, i) => [r.abbr, i + 1]))
  }
  const offRank = rank('ppg')
  const defRank = rank('oppPpg', 1) // fewer points allowed is better
  const netRank = rank('netPpg')

  return rows
    .map((r) => ({ ...r, offRank: offRank[r.abbr], defRank: defRank[r.abbr], netRank: netRank[r.abbr] }))
    .sort((a, b) => b.netPpg - a.netPpg)
}

export const LEADER_CATEGORIES = [
  { key: 'avgPoints', label: 'Points', short: 'PPG' },
  { key: 'avgRebounds', label: 'Rebounds', short: 'RPG' },
  { key: 'avgAssists', label: 'Assists', short: 'APG' },
  { key: 'avgSteals', label: 'Steals', short: 'SPG' },
  { key: 'avgBlocks', label: 'Blocks', short: 'BPG' },
  { key: 'fgPct', label: 'Field goal %', short: 'FG%' },
  { key: 'threePct', label: '3-point %', short: '3P%' },
  { key: 'doubleDouble', label: 'Double-doubles', short: 'DD' },
  { key: 'tripleDouble', label: 'Triple-doubles', short: 'TD' },
]

// A leaderboard needs a volume floor, or it ranks flukes — a centre going 1-for-1 from
// three would top the percentage list on a single make.
//
// These are the WNBA's own qualification minimums, as published by basketball-reference
// (basketball-reference.com/about/wnba_rate_stat_req.html). They are NOT the NBA's: the
// per-game categories take a games floor OR a season total, whichever the player reaches,
// and the percentages qualify on makes.
//
//   points/rebounds/assists/steals/blocks per game   20 games, or the category total
//   field goal %                                     85 made
//   3-point %                                        20 made
//
// The totals are stated for a full 44-game season, so each minimum is scaled by how much of
// the season has been played — otherwise every board sits empty through May and June. The
// games leg is scaled too, which is what keeps a 3-game hot streak off an early board.
const FULL_SEASON = 44
const MIN_GAMES = 20
const RATE_STATS = {
  avgPoints: 400,
  avgRebounds: 200,
  avgAssists: 100,
  avgSteals: 35,
  avgBlocks: 35,
}
const MADE_MINIMUMS = {
  fgPct: { made: 'avgFgMade', min: 85 },
  threePct: { made: 'avgThreeMade', min: 20 },
}

// Counting stats (not per-game averages): only players who actually recorded one belong on
// the board — otherwise the tie logic pads it with everyone stuck on zero.
const COUNT_STATS = new Set(['doubleDouble', 'tripleDouble'])

// Ties share a rank and consume the slots below them (1, 2, 2, 4) — the standard
// leaderboard convention, and the reason this isn't just index + 1.
export function leaderboard(key, { limit = 10, players = PLAYERS } = {}) {
  let eligible = players.filter((p) => p[key] != null)
  if (COUNT_STATS.has(key)) eligible = eligible.filter((p) => p[key] > 0)
  // How much of a season this is: the busiest player's games against a full 44. A finished
  // season gives 1, so the thresholds are exactly the WNBA's published ones. Capped at 1 so
  // a rescheduled 45th game can't push the bar past the real rule.
  const maxGP = eligible.reduce((m, p) => Math.max(m, p.gamesPlayed ?? 0), 0)
  const share = Math.min(1, maxGP / FULL_SEASON)
  const total = RATE_STATS[key]
  // `p[key]` is already known non-null here — eligible filtered on it — so only the games
  // count needs a fallback. Either leg qualifies, which is the WNBA's rule.
  if (total)
    eligible = eligible.filter(
      (p) =>
        (p.gamesPlayed ?? 0) >= MIN_GAMES * share ||
        p[key] * (p.gamesPlayed ?? 0) >= total * share
    )
  const q = MADE_MINIMUMS[key]
  if (q)
    eligible = eligible.filter((p) => (p[q.made] ?? 0) * (p.gamesPlayed ?? 0) >= q.min * share)
  const sorted = [...eligible].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name))

  const ranked = []
  let rank = 0
  let prev = null
  sorted.forEach((p, i) => {
    if (p[key] !== prev) {
      rank = i + 1
      prev = p[key]
    }
    ranked.push({ ...p, rank, value: p[key] })
  })

  // Keep everyone tied at the cutoff rather than truncating mid-tie.
  const cut = ranked[limit - 1]
  return cut ? ranked.filter((p) => p.rank <= cut.rank) : ranked
}

// Hover text for one of a player's season teams. `gp` is absent only when ESPN's per-team
// splits couldn't be resolved at fetch time, in which case the count is genuinely unknown
// and claiming one would be worse than omitting it.
export const teamLabel = (t) => (t.gp == null ? t.abbr : `${t.abbr} · ${t.gp} games`)

export const playersByTeam = (abbr, players = PLAYERS) =>
  players.filter((p) => p.team === abbr).sort((a, b) => (b.avgPoints ?? 0) - (a.avgPoints ?? 0))
