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

// Rates keep FOUR decimals; counts and season totals keep none.
//
// The app DISPLAYS two. One decimal manufactured ties that then broke alphabetically, and
// the two decimals behind the display are what let a pair that reads the same still sort
// correctly — the same thing basketball-reference does with its own boards.
const precisionFor = (key) =>
  key === 'points' || key === 'doubleDouble' || key === 'tripleDouble' ? 0 : 4

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
        // Season membership, resolved by the caller from the per-team splits;
        // `teamShortName` is the CURRENT club and is kept only as a last-resort fallback.
        teams: (a.teams || []).map((t) => t.abbreviation).filter(Boolean),
        current: a.teamShortName,
        pos: a.position?.abbreviation || null,
        ...stats,
      }
    })
    .filter((p) => p.gamesPlayed)
    .sort((a, b) => (b.avgPoints ?? 0) - (a.avgPoints ?? 0))
}

// ── The per-athlete season payload ───────────────────────────────────────────
//
// ESPN's byathlete feed is INCOMPLETE for the WNBA: it answered with 128 of 207 rostered
// players in 2026, dropping Sabrina Ionescu (21 games), Kelsey Plum (16), Napheesa Collier
// and Satou Sabally, and in 2025 it dropped Angel Reese — who led the league in rebounding.
// Whatever cut ESPN applies there, a leaderboard computed over that universe omits real
// qualifiers, so anyone missing is filled in from /athletes/{id}/stats instead.
//
// That payload is richer than byathlete, not poorer: `totals` carries integer season totals
// (so an average is computed at FULL precision rather than read back from a rounded one),
// `miscellaneous` carries the double-double and triple-double counts, and its per-team rows
// are the chronological splits. Only PER is absent.
//
// Columns are read by the payload's own `labels`, never by position — the WNBA's label
// order is NOT the NBA's (points sits fourth here, not further along).
const cell = (cat, label, row) => {
  const i = (cat?.labels || []).indexOf(label)
  return i < 0 ? undefined : row?.stats?.[i]
}
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}
// "278-532" → [made, attempted]. ESPN pairs made and attempted in a single column.
const pair = (v) => {
  const [made, att] = String(v ?? '').split('-').map(Number)
  return [Number.isFinite(made) ? made : undefined, Number.isFinite(att) ? att : undefined]
}

export function parseAthleteSeason(data, season, meta) {
  const catOf = (name) => (data.categories || []).find((c) => c.name === name)
  const seasonRow = (cat) =>
    // The combined row for the season carries no teamId (it is labelled "2026 Totals"); for
    // a player who stayed put there is only ever one row, which is the same thing.
    (cat?.statistics || []).find(
      (r) => String(r.season?.year) === String(season) && !r.teamId
    ) ?? (cat?.statistics || []).find((r) => String(r.season?.year) === String(season))

  const avgCat = catOf('averages')
  const totCat = catOf('totals')
  const miscCat = catOf('miscellaneous')
  const avgRow = seasonRow(avgCat)
  const totRow = seasonRow(totCat)
  const miscRow = seasonRow(miscCat)

  const gp = num(cell(avgCat, 'GP', avgRow))
  if (!gp) return null

  // Averages from integer totals ÷ games, so precision comes from the source rather than
  // from ESPN's already-rounded display string.
  const per = (label) => {
    const v = num(cell(totCat, label, totRow))
    return v == null ? null : round(v / gp, precisionFor('avg'))
  }
  const [fgm, fga] = pair(cell(totCat, 'FG', totRow))
  const [tpm, tpa] = pair(cell(totCat, '3PT', totRow))
  const [ftm, fta] = pair(cell(totCat, 'FT', totRow))
  const rate = (made, att) =>
    made == null || !att ? null : round((made / att) * 100, precisionFor('fgPct'))
  const each = (v) => (v == null ? null : round(v / gp, precisionFor('avg')))

  return {
    id: meta.id,
    name: meta.name,
    short: meta.short,
    teams: [],
    current: meta.current,
    pos: meta.pos,
    gamesPlayed: gp,
    avgMinutes: round(num(cell(avgCat, 'MIN', avgRow)), precisionFor('avg')),
    doubleDouble: num(cell(miscCat, 'DD2', miscRow)) ?? null,
    tripleDouble: num(cell(miscCat, 'TD3', miscRow)) ?? null,
    // PER is the one stat this payload does not carry.
    per: null,
    avgRebounds: per('REB'),
    points: num(cell(totCat, 'PTS', totRow)) ?? null,
    avgPoints: per('PTS'),
    avgFgMade: each(fgm),
    avgFgAtt: each(fga),
    fgPct: rate(fgm, fga),
    avgThreeMade: each(tpm),
    avgThreeAtt: each(tpa),
    threePct: rate(tpm, tpa),
    avgFtMade: each(ftm),
    avgFtAtt: each(fta),
    ftPct: rate(ftm, fta),
    avgAssists: per('AST'),
    avgTurnovers: per('TO'),
    avgSteals: per('STL'),
    avgBlocks: per('BLK'),
  }
}

// The chronological per-team splits: which clubs a player suited up for this season, and
// how many games with each. Rows carrying a teamId are the splits; the combined row has
// none. `abbrById` maps ESPN's team id to the abbreviation teams.js uses.
export function parseSeasonTeams(data, season, abbrById) {
  const cat = (data.categories || []).find((c) => c.name === 'averages')
  return (cat?.statistics || [])
    .filter((r) => r.teamId && String(r.season?.year) === String(season))
    .map((r) => ({ abbr: abbrById.get(String(r.teamId)), gp: num(cell(cat, 'GP', r)) }))
    .filter((t) => t.abbr && Number.isFinite(t.gp))
}

// Settle each player's season teams, and pick the club the badge should show: whoever they
// played the most games for. A 12-game Spark who finished on a 4-game Mercury stint belongs
// under LAS, and her season line is mostly LAS's.
export function resolveSeasonTeams(player, split) {
  const single = player.teams.length === 1
  player.teams =
    split?.length
      ? split
      : player.teams.length
        ? player.teams.map((abbr) => ({ abbr, gp: single ? player.gamesPlayed : null }))
        : [{ abbr: player.current, gp: player.gamesPlayed }]
  player.team = player.teams.reduce((best, t) => ((t.gp ?? 0) > (best.gp ?? 0) ? t : best)).abbr
  delete player.current
  return player
}
