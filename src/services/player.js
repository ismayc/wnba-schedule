// Per-player extras for the leaderboard pop-out: bio and a recent game log, fetched on
// open (keyless, CORS-open — the same pattern as the game-detail summary). The season
// stat line the modal shows first is already committed in PLAYERS, so this only enriches;
// a failure degrades to stats-only rather than blocking.

const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba'
// birthPlace (city/state/country) is not on the site overview — only on the core
// athlete record — so the pop-out's country line takes a second keyless request.
const CORE = 'https://sports.core.api.espn.com/v2/sports/basketball/leagues/wnba/athletes'

// Deterministic headshot URL — no request needed. The <img> hides itself on a 404.
export const headshotUrl = (id) =>
  `https://a.espncdn.com/i/headshots/wnba/players/full/${id}.png`

function parseBio(data, core) {
  const a = data?.athlete
  const bp = core?.birthPlace || a?.birthPlace || null
  if (!a && !bp) return null
  return {
    jersey: a?.jersey || null,
    pos: a?.position?.abbreviation || null,
    height: a?.displayHeight || null,
    weight: a?.displayWeight || null,
    age: typeof a?.age === 'number' ? a.age : null,
    college: a?.college?.name || null,
    country: bp?.country || null,
    team: a?.team?.displayName || null,
    experience: typeof a?.experience?.years === 'number' ? a.experience.years : null,
  }
}

// The game-log columns are positional; resolve them by the feed's own `labels` rather
// than a hardcoded index (same lesson as the leaderboards).
const LOG_STATS = ['MIN', 'PTS', 'REB', 'AST']

function parseGames(data, limit = 6) {
  const labels = data?.labels || []
  const col = Object.fromEntries(labels.map((l, i) => [l, i]))
  const events = data?.events || {}

  return (data?.seasonTypes || [])
    .flatMap((st) => (st.categories || []).flatMap((c) => c.events || []))
    .map((e) => {
      const meta = events[e.eventId] || {}
      const stat = (k) => (col[k] != null ? e.stats?.[col[k]] ?? null : null)
      return {
        id: e.eventId,
        date: meta.gameDate || null,
        opp: meta.opponent?.abbreviation || null,
        atVs: meta.atVs || 'vs',
        result: meta.gameResult || null,
        stats: Object.fromEntries(LOG_STATS.map((k) => [k, stat(k)])),
      }
    })
    .filter((g) => g.date)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
}

// Returns { bio, games } — each null/empty when unavailable — or null if both requests
// fail (offline), so the modal keeps its committed season stats.
export async function fetchPlayer(id, { signal } = {}) {
  let overview = null
  let gamelog = null
  let core = null
  try {
    ;[overview, gamelog, core] = await Promise.all([
      fetch(`${WEB}/athletes/${id}`, { signal }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${WEB}/athletes/${id}/gamelog`, { signal }).then((r) => (r.ok ? r.json() : null)),
      fetch(`${CORE}/${id}`, { signal }).then((r) => (r.ok ? r.json() : null)),
    ])
  } catch {
    return null
  }
  return { bio: parseBio(overview, core), games: parseGames(gamelog) }
}
