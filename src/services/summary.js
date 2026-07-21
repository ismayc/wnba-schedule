// Everything the game-detail modal shows that isn't in the committed snapshot: the
// player box score, team-stat comparison, injury report, attendance/officials, and the
// win-probability curve. All of it comes from ONE ESPN summary request per game open —
// keyless and CORS-open, like the live overlay — so the modal fans a single fetch out
// into five sections instead of five requests.
//
// None of this can be committed at build time: a box score doesn't exist until tip-off,
// and injuries/win-probability change up to and through the game. Fetching on open costs
// one request and works retroactively for any past game.

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary'

// ── Player box score ──────────────────────────────────────────────────
// REB already sums OREB+DREB, so drop those two to keep the wide table narrower.
const HIDDEN_PLAYER_COLS = new Set(['offensiveRebounds', 'defensiveRebounds'])

function parsePlayer(entry, columns) {
  const a = entry.athlete ?? {}
  const stats = {}
  for (const c of columns) stats[c.key] = entry.stats?.[c.index] ?? null
  return {
    id: a.id ?? null,
    name: a.displayName ?? a.shortName ?? 'Unknown',
    jersey: a.jersey ?? null,
    pos: a.position?.abbreviation ?? null,
    dnp: entry.didNotPlay === true,
    stats,
  }
}

function parseSide(block) {
  const box = block.statistics?.[0]
  const keys = box?.keys ?? []
  // `keys` are stable identifiers; resolve each column's header by index rather than
  // hardcoding a position, so a reordered feed drops a stat instead of mislabeling one.
  const labels = box?.labels ?? box?.names ?? []
  const columns = keys
    .map((key, index) => ({ key, index, label: labels[index] ?? key }))
    .filter((c) => !HIDDEN_PLAYER_COLS.has(c.key))

  const athletes = (box?.athletes ?? []).map((e) => ({
    starter: e.starter === true,
    player: parsePlayer(e, columns),
  }))

  const totalsRaw = box?.totals ?? null
  const totals = totalsRaw
    ? Object.fromEntries(columns.map((c) => [c.key, totalsRaw[c.index] ?? '']))
    : null

  // Whether a real stat line exists yet (pre-tip, athletes may be listed with empties).
  const hasStats = athletes.some((x) => x.player.stats.points != null && x.player.stats.points !== '')

  return {
    abbr: block.team?.abbreviation ?? null,
    name: block.team?.displayName ?? block.team?.shortDisplayName ?? null,
    columns: columns.map(({ key, label }) => ({ key, label })),
    starters: athletes.filter((x) => x.starter).map((x) => x.player),
    bench: athletes.filter((x) => !x.starter).map((x) => x.player),
    totals,
    hasStats,
  }
}

function parseBox(data) {
  const sides = (data.boxscore?.players ?? []).map(parseSide)
  // No starters posted → treat as "not up yet", the normal pre-tip state.
  if (!sides.some((s) => s.starters.length)) return null
  return { sides, hasStats: sides.some((s) => s.hasStats) }
}

// ── Team-stat comparison ──────────────────────────────────────────────
// A curated subset of ESPN's 25 team stats, in reading order. `num` marks a plain
// number we can bold the better side of; `lowerBetter` flips that (turnovers).
const TEAM_STATS = [
  { name: 'fieldGoalsMade-fieldGoalsAttempted', label: 'FG' },
  { name: 'fieldGoalPct', label: 'FG%', num: true },
  { name: 'threePointFieldGoalsMade-threePointFieldGoalsAttempted', label: '3PT' },
  { name: 'threePointFieldGoalPct', label: '3P%', num: true },
  { name: 'freeThrowsMade-freeThrowsAttempted', label: 'FT' },
  { name: 'totalRebounds', label: 'REB', num: true },
  { name: 'assists', label: 'AST', num: true },
  { name: 'steals', label: 'STL', num: true },
  { name: 'blocks', label: 'BLK', num: true },
  { name: 'totalTurnovers', label: 'TO', num: true, lowerBetter: true },
  { name: 'pointsInPaint', label: 'Paint', num: true },
  { name: 'fastBreakPoints', label: 'Fast break', num: true },
]

function parseTeamStats(data) {
  const teams = data.boxscore?.teams ?? []
  const byHA = {}
  for (const t of teams) if (t.homeAway) byHA[t.homeAway] = t
  const { home, away } = byHA
  if (!home || !away) return null

  const get = (t, name) => (t.statistics ?? []).find((s) => s.name === name)?.displayValue ?? null

  const rows = TEAM_STATS.map((st) => {
    const a = get(away, st.name)
    const h = get(home, st.name)
    let better = null // 'away' | 'home' | null — which side to bold
    if (st.num && a != null && h != null) {
      const av = parseFloat(a)
      const hv = parseFloat(h)
      if (Number.isFinite(av) && Number.isFinite(hv) && av !== hv) {
        const higher = av > hv ? 'away' : 'home'
        better = st.lowerBetter ? (higher === 'away' ? 'home' : 'away') : higher
      }
    }
    return { label: st.label, away: a, home: h, better }
  }).filter((r) => r.away != null || r.home != null)

  return rows.length ? rows : null
}

// ── Injuries ──────────────────────────────────────────────────────────
function parseInjuries(data) {
  return (data.injuries ?? [])
    .map((blk) => ({
      abbr: blk.team?.abbreviation ?? null,
      players: (blk.injuries ?? []).map((i) => ({
        name: i.athlete?.displayName ?? i.athlete?.shortName ?? 'Unknown',
        pos: i.athlete?.position?.abbreviation ?? null,
        status: i.status ?? null,
        detail: i.type?.description ?? i.details?.type ?? null,
      })),
    }))
    .filter((b) => b.players.length)
}

// ── Game info ─────────────────────────────────────────────────────────
function parseInfo(data) {
  const gi = data.gameInfo ?? {}
  const attendance = typeof gi.attendance === 'number' && gi.attendance > 0 ? gi.attendance : null
  const officials = (gi.officials ?? []).map((o) => o.displayName ?? o.fullName).filter(Boolean)
  if (attendance == null && !officials.length) return null
  return { attendance, officials }
}

// ── Win probability ───────────────────────────────────────────────────
// The home team's win probability (0–1) at each play. Returned as a plain series so the
// chart doesn't need to know about plays.
function parseWinProb(data) {
  const series = (data.winprobability ?? [])
    .map((p) => (typeof p.homeWinPercentage === 'number' ? p.homeWinPercentage : null))
    .filter((x) => x != null)
  return series.length > 1 ? series : null
}

// Returns { box, teamStats, injuries, info, winprob } — each null/empty when absent —
// or null only when the request itself fails (offline / feed hiccup), so the modal can
// fall back to the committed snapshot without shouting about it.
export async function fetchGameSummary(eventId, { signal } = {}) {
  let data
  try {
    const res = await fetch(`${SUMMARY}?event=${eventId}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch {
    return null
  }

  return {
    box: parseBox(data),
    teamStats: parseTeamStats(data),
    injuries: parseInjuries(data),
    info: parseInfo(data),
    winprob: parseWinProb(data),
  }
}
