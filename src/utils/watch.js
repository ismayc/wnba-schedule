import { GAMES } from '../data/schedule.js'

// The streaming services and TV packages a viewer can tell us they have, so the
// schedule can flag which games they can actually watch — and filter to them.
//
// A game's `broadcast` is a flat list of ESPN network names. Streaming exclusives
// (Peacock, Prime Video, Paramount+, Disney+) are matched by their own name. A
// live-TV *bundle* (YouTube TV, Hulu + Live TV, Fubo, Sling, cable) never appears
// in that list — it carries a game whenever the game airs on a national linear
// network the bundle carries, so each bundle is defined by the networks it carries.
// Bundle carriage differs by bundle and, in reality, by market and over time; the
// mappings here are the national defaults and are deliberately approximate.
//
// Regional/local feeds (Prime Video-Seattle, KOMO-TV, Fox 12 Plus) can't be folded
// into a bundle's mapping — carriage is market-dependent, so a single answer would
// be wrong (a Portland YouTube TV gets KPDX; an Atlanta one doesn't). Instead the
// picker offers every local/regional feed the schedule data names, and the viewer
// checks the ones their own provider carries. See LOCAL_CATALOG below.

// National linear networks, by the exact name ESPN emits in `broadcast`.
const ESPN = 'ESPN'
const ABC = 'ABC'
const CBS = 'CBS'
const NBC = 'NBC'
const USA = 'USA Net'
const ION = 'ION'
const CNBC = 'CNBC'
const NBATV = 'NBA TV'

// carries(...names) → a matcher that's true when a game's broadcast list names any
// of them.
const carries = (...names) => {
  const set = new Set(names)
  return (broadcast) => broadcast.some((n) => set.has(n))
}

// Ordered streaming-first, then live-TV bundles. This is also the display order for
// badges and the picker. `kind` only labels the picker ('Streaming' vs 'Live TV').
export const SERVICE_CATALOG = [
  { key: 'prime', label: 'Prime Video', kind: 'stream', match: carries('Prime Video') },
  { key: 'peacock', label: 'Peacock', kind: 'stream', match: carries('Peacock') },
  { key: 'paramount', label: 'Paramount+', kind: 'stream', match: carries('Paramount+', CBS) },
  { key: 'disney', label: 'Disney+ / ESPN+', kind: 'stream', match: carries('Disney+', ESPN) },
  { key: 'nbatv', label: 'NBA TV', kind: 'stream', match: carries(NBATV) },
  { key: 'leaguepass', label: 'WNBA League Pass', kind: 'stream', match: carries('WNBA League Pass') },
  { key: 'youtubetv', label: 'YouTube TV', kind: 'bundle', match: carries(ESPN, ABC, CBS, NBC, USA, ION, CNBC, NBATV) },
  { key: 'hulu', label: 'Hulu + Live TV', kind: 'bundle', match: carries(ESPN, ABC, CBS, NBC, USA, CNBC, NBATV) },
  { key: 'fubo', label: 'Fubo', kind: 'bundle', match: carries(ABC, CBS, NBC, USA, ION, CNBC) },
  { key: 'sling', label: 'Sling TV', kind: 'bundle', match: carries(ESPN, USA, CNBC, NBATV) },
  { key: 'cable', label: 'Cable / Satellite', kind: 'bundle', match: carries(ESPN, ABC, CBS, NBC, USA, ION, CNBC, NBATV) },
]

// Every name the national catalog above already accounts for — a broadcast entry
// outside this set lands in the local-channel picker. NBCSN is here even though no
// service matches it (it's US-national cable, not a local feed); TSN is deliberately
// NOT here, so it stays pickable — that's the only way a Canadian viewer can mark
// Tempo games watchable.
const NATIONAL_NAMES = new Set([
  ESPN,
  ABC,
  CBS,
  NBC,
  USA,
  ION,
  CNBC,
  NBATV,
  'NBCSN',
  'Prime Video',
  'Peacock',
  'Paramount+',
  'Disney+',
  'WNBA League Pass',
])

// The distinct local/regional feeds a season's games name, as picker entries. Each
// feed is attributed to the one team present in EVERY game it airs (a market feed
// carries its team home and away) — `team` is that abbr, or null if no single team
// survives the intersection. Sorted by team then name so the picker reads as a
// per-market list. Pure so tests can feed fixture games; the app-facing
// LOCAL_CATALOG below derives from the committed schedule, so it tracks whatever
// ESPN currently emits.
export function localChannelCatalog(games) {
  const teamsByName = new Map()
  for (const g of games) {
    for (const b of g.broadcast || []) {
      if (NATIONAL_NAMES.has(b)) continue
      const prev = teamsByName.get(b)
      const pair = [g.home, g.away]
      teamsByName.set(b, new Set(prev ? pair.filter((t) => prev.has(t)) : pair))
    }
  }
  return [...teamsByName.entries()]
    .map(([name, teams]) => ({
      key: `local:${name}`,
      label: name,
      kind: 'local',
      team: teams.size === 1 ? [...teams][0] : null,
      match: carries(name),
    }))
    .sort(
      (a, b) =>
        (a.team || '\uffff').localeCompare(b.team || '\uffff') ||
        a.label.localeCompare(b.label)
    )
}

export const LOCAL_CATALOG = localChannelCatalog(GAMES)

const FULL_CATALOG = [...SERVICE_CATALOG, ...LOCAL_CATALOG]

export const SERVICE_BY_KEY = Object.fromEntries(SERVICE_CATALOG.map((s) => [s.key, s]))

// Broadcast entries not already shown as a personalized 📺 badge, so a game on
// "Peacock" (with Peacock selected) renders one "📺 Peacock" badge rather than the
// redundant "Peacock · 📺 Peacock". Bundle badges (e.g. YouTube TV) don't match a
// broadcast name, so their underlying network (ESPN, NBC, …) is left in place.
export function broadcastNotBadged(broadcast, watched) {
  if (!broadcast?.length) return []
  const shown = new Set((watched || []).map((s) => s.label))
  return broadcast.filter((b) => !shown.has(b))
}

// The viewer's selected services (by key) that carry this game, in catalog order.
// Returns [] when nothing is selected or the broadcast is unknown — so a viewer who
// hasn't chosen services sees no personalized badge (the raw network list in the
// card meta still shows where the game is on).
export function watchableServices(broadcast, selectedKeys) {
  if (!broadcast?.length || !selectedKeys?.length) return []
  const selected = new Set(selectedKeys)
  return FULL_CATALOG.filter((s) => selected.has(s.key) && s.match(broadcast))
}
