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
