// Starting lineups, fetched per game rather than committed.
//
// A lineup does not exist until ESPN sets it (around tip-off), so it can't be a
// build-time snapshot — a nightly refresh would commit empty lineups and still be wrong
// an hour before every game. Fetching when a game is opened costs one request and works
// retroactively for any past game, keeping the committed data to things that don't change.
//
// Keyless and CORS-open, like the live overlay. A miss is not an error worth shouting
// about — the detail simply says the lineup isn't up yet.
//
// Unlike soccer (a starting XI grouped into formation lines), basketball exposes starters
// as a `starter` flag on the box score — five per team, each with a stat line once tipped.

const SUMMARY = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary'

// The three numbers a basketball fan reads first, plus minutes. The box score's `keys`
// array is stable but not contractual, so we resolve each by name rather than hardcoding
// a column index — a reordered feed then drops a stat instead of showing the wrong one.
const STAT_KEYS = { min: 'minutes', pts: 'points', reb: 'rebounds', ast: 'assists' }

function readAthlete(entry, keyIndex) {
  const a = entry.athlete ?? {}
  const val = (k) => {
    const i = keyIndex[k]
    return i == null ? null : entry.stats?.[i] ?? null
  }
  return {
    id: a.id ?? null,
    name: a.displayName ?? a.shortName ?? 'Unknown',
    jersey: a.jersey ?? null,
    pos: a.position?.abbreviation ?? null,
    dnp: entry.didNotPlay === true,
    line: { min: val('min'), pts: val('pts'), reb: val('reb'), ast: val('ast') },
  }
}

function readSide(block) {
  const box = block.statistics?.[0]
  const keys = box?.keys ?? []
  const keyIndex = {}
  for (const [k, name] of Object.entries(STAT_KEYS)) {
    const i = keys.indexOf(name)
    keyIndex[k] = i === -1 ? null : i
  }

  const athletes = (box?.athletes ?? []).map((e) => ({
    starter: e.starter === true,
    player: readAthlete(e, keyIndex),
  }))

  return {
    abbr: block.team?.abbreviation ?? null,
    name: block.team?.displayName ?? block.team?.shortDisplayName ?? null,
    starters: athletes.filter((x) => x.starter).map((x) => x.player),
    bench: athletes.filter((x) => !x.starter).map((x) => x.player),
  }
}

// Returns { sides: [{ abbr, name, starters, bench }, ...] }, or null when no lineup has
// been posted yet — the normal state for a game more than a little before tip-off.
export async function fetchLineup(eventId, { signal } = {}) {
  let data
  try {
    const res = await fetch(`${SUMMARY}?event=${eventId}`, { signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    data = await res.json()
  } catch {
    return null
  }

  const sides = (data.boxscore?.players ?? []).map(readSide)
  if (!sides.some((s) => s.starters.length)) return null

  return { sides }
}
