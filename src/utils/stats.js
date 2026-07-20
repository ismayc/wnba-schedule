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
  const rows = Object.values(table)
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
]

// Ties share a rank and consume the slots below them (1, 2, 2, 4) — the standard
// leaderboard convention, and the reason this isn't just index + 1.
export function leaderboard(key, { limit = 10, players = PLAYERS } = {}) {
  const eligible = players.filter((p) => p[key] != null)
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

export const playersByTeam = (abbr, players = PLAYERS) =>
  players.filter((p) => p.team === abbr).sort((a, b) => (b.avgPoints ?? 0) - (a.avgPoints ?? 0))
