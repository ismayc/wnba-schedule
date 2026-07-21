// Season stat lines for every qualified player, parsed from ESPN's byathlete feed.
//
// The feed gives each athlete a flat `values` array per category with NO inline labels.
// The column order is published once, at the top level, in `data.categories[].names`.
// We resolve every value by that NAME, never by a hardcoded array position — so a
// reordered or extended feed can't silently shift a stat one column over. A renamed or
// removed stat yields null instead of the wrong number.
//
// Node built-ins only (no imports at all), so the data workflow runs on a bare checkout.

// Our output key → the ESPN `names` entry it comes from. Output keys are what the app
// consumes (avgPoints, avgRebounds, …); ESPN's names are the feed's own identifiers.
export const LEADER_STATS = {
  general: {
    gamesPlayed: 'gamesPlayed',
    avgMinutes: 'avgMinutes',
    doubleDouble: 'doubleDouble',
    tripleDouble: 'tripleDouble',
    per: 'PER',
    avgRebounds: 'avgRebounds',
  },
  offensive: {
    points: 'points',
    avgPoints: 'avgPoints',
    avgFgMade: 'avgFieldGoalsMade',
    avgFgAtt: 'avgFieldGoalsAttempted',
    fgPct: 'fieldGoalPct',
    avgThreeMade: 'avgThreePointFieldGoalsMade',
    avgThreeAtt: 'avgThreePointFieldGoalsAttempted',
    threePct: 'threePointFieldGoalPct',
    avgFtMade: 'avgFreeThrowsMade',
    avgFtAtt: 'avgFreeThrowsAttempted',
    ftPct: 'freeThrowPct',
    avgAssists: 'avgAssists',
    avgTurnovers: 'avgTurnovers',
  },
  defensive: {
    avgSteals: 'avgSteals',
    avgBlocks: 'avgBlocks',
  },
}

const round = (v, p = 1) =>
  typeof v === 'number' && Number.isFinite(v) ? Number(v.toFixed(p)) : null

// Percentages arrive as 0-100 floats with float noise (40.00000059…); points is a whole
// total. Everything else is a one-decimal average.
const precisionFor = (key) => (key.endsWith('Pct') ? 1 : key === 'points' ? 0 : 1)

// Turn the byathlete response into the committed PLAYERS array.
export function parseLeaders(data) {
  // The feed's authoritative column order, per category: name → index.
  const indexByName = {}
  for (const cat of data.categories || []) {
    indexByName[cat.name] = new Map((cat.names || []).map((n, i) => [n, i]))
  }

  return (data.athletes || [])
    .map(({ athlete: a, categories }) => {
      const stats = {}
      for (const cat of categories || []) {
        const wanted = LEADER_STATS[cat.name]
        const idx = indexByName[cat.name]
        if (!wanted || !idx) continue
        for (const [outKey, espnName] of Object.entries(wanted)) {
          const i = idx.get(espnName)
          // Unknown/renamed stat → null, never a value from the wrong column.
          stats[outKey] = i == null ? null : round(cat.values?.[i], precisionFor(outKey))
        }
      }
      return {
        id: a.id,
        name: a.displayName,
        short: a.shortName,
        team: a.teamShortName,
        pos: a.position?.abbreviation || null,
        ...stats,
      }
    })
    .filter((p) => p.team && p.gamesPlayed)
    .sort((a, b) => (b.avgPoints ?? 0) - (a.avgPoints ?? 0))
}
