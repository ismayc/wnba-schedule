// Derivations over the archived seasons in data/history.js.
//
// Nothing here is committed: every season ships its final standings, its playoff games
// and its own series lengths, and the bracket and the runs below are recomputed from
// those by the same functions the current season uses. That is deliberate — an archived
// bracket that renders through a second, "historical" code path is one that can silently
// disagree with the live one.

import { buildBracket } from './bracket.js'

// Rebuild one archived season. Seeding comes from the committed standings (a historical
// season carries no regular-season games to derive it from) and the series lengths come
// from the season itself — the Finals were best-of-5 through 2024 and best-of-7 after.
export const seasonBracket = (season) =>
  buildBracket(season.games, { seeds: season.standings, lengths: season.lengths })

// Deepest round first: the first round a team appears in, scanning this way, is the
// furthest it reached — and since the champion is handled separately, it's the round they
// went out in.
const EXITS = [
  ['Final', 'Lost the Finals'],
  ['SF', 'Lost the semifinals'],
  ['R1', 'Lost in the first round'],
]

// How far a team went that season. Returns null for one that missed the playoffs.
export function runResult(bracket, abbr) {
  if (!abbr) return null
  if (bracket.champion === abbr) return 'Won the title'

  for (const [round, label] of EXITS) {
    if (bracket.rounds[round].some((s) => s.teams.includes(abbr))) return label
  }
  return null
}

// The Finals line for a season: who won, over whom, in how many games.
export function finalsSummary(season) {
  const final = seasonBracket(season).rounds.Final[0]
  const winner = final.winner
  const loser = final.loser
  return {
    winner,
    loser,
    wins: winner ? [final.wins[winner], final.wins[loser]] : null,
    bestOf: final.bestOf,
  }
}

/**
 * One archived team's row in the shape the team panel expects.
 *
 * The panel is built for the live season, where every figure comes from the game
 * list. A finished season commits its final table as numbers instead, so the
 * same fields are rebuilt from those: per-game scoring from points for/against,
 * the home and road splits from their compact [w, l] pairs.
 *
 * `results` is deliberately empty — the archive holds no per-game regular-season
 * record, so there is no honest "last 10" to draw, and the panel omits that
 * section rather than inventing one. `remaining` is 0 because the season is over.
 */
export function seasonTeamRow(season, abbr) {
  if (!season || !abbr) return null
  const row = season.standings.find((r) => r.abbr === abbr)
  if (!row) return null
  const gp = row.w + row.l
  const pair = ([w, l]) => ({ w, l })
  return {
    ...row,
    gp,
    ppg: gp ? row.pf / gp : 0,
    oppPpg: gp ? row.pa / gp : 0,
    netPpg: row.netPpg,
    home: pair(row.home),
    road: pair(row.road),
    remaining: 0,
    results: [],
    // A finished season has no race left to run, so neither badge applies.
    clinched: false,
    eliminated: false,
  }
}

/** That season's players, ordered for the panel's leading-scorers list. */
export function seasonPlayers(season) {
  return season?.players ? Object.values(season.players) : []
}
