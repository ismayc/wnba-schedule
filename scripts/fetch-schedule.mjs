#!/usr/bin/env node
// Regenerates src/data/teams.js + src/data/schedule.js from ESPN's public feeds,
// and mirrors each team's logo into public/logos/ so the app ships zero external
// image requests (offline + PWA friendly).
//
// Node built-ins only — no npm ci needed, so CI can run this on a bare checkout.
//
//   node scripts/fetch-schedule.mjs [--season 2026] [--no-logos]

import { writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseLeaders } from './leaders.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/wnba'
const WEB = 'https://site.web.api.espn.com/apis/common/v3/sports/basketball/wnba'

const args = process.argv.slice(2)
const SEASON = Number(args[args.indexOf('--season') + 1]) || new Date().getFullYear()
const WITH_LOGOS = !args.includes('--no-logos')

// ESPN seasonType ids. 1=preseason (skipped), 2=regular, 3=postseason, 4=all-star.
const SEASON_TYPE = { 2: 'regular', 3: 'playoffs', 4: 'allstar' }

// The Commissioner's Cup Championship is an extra game that does NOT count toward
// regular-season standings. Group-stage Cup games are ordinary regular-season games
// that happen to also count for the Cup, so only the final is reclassified.
const CUP_FINAL = /commissioner'?s cup championship/i

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (err) {
      if (i === tries - 1) throw new Error(`${url}\n  ${err.message}`)
      await new Promise((r) => setTimeout(r, 500 * (i + 1)))
    }
  }
}

async function fetchTeams() {
  const d = await getJson(`${SITE}/teams`)
  return d.sports[0].leagues[0].teams
    .map(({ team: t }) => ({
      id: t.id,
      abbr: t.abbreviation,
      slug: t.abbreviation.toLowerCase(),
      name: t.name, // "Lynx"
      location: t.location, // "Minnesota"
      displayName: t.displayName, // "Minnesota Lynx"
      color: `#${t.color}`,
      altColor: `#${t.alternateColor}`,
      logo: (t.logos || []).find((l) => l.rel.includes('default'))?.href || null,
      logoDark: (t.logos || []).find((l) => l.rel.includes('dark'))?.href || null,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
}

// Playoff series metadata lives in an unstructured headline: "First Round - Game 1",
// "WNBA Finals - Game 3". Parse it into { round, game } so the bracket can group games
// into series without guessing from dates.
const ROUND_PATTERNS = [
  [/first\s*round/i, 'R1'],
  [/semifinal/i, 'SF'],
  [/final/i, 'Final'],
]

function parseSeriesNote(notes) {
  const headline = (notes || []).map((n) => n.headline).find(Boolean)
  if (!headline) return {}
  const round = ROUND_PATTERNS.find(([re]) => re.test(headline))?.[1]
  const game = Number(headline.match(/game\s*(\d+)/i)?.[1]) || undefined
  return { round, game, note: headline }
}

// The team-schedule feed and the scoreboard feed disagree on broadcast shape:
// schedule uses `media.shortName`, scoreboard uses `names[]`. Accept both.
function broadcastNames(c) {
  const names = (c.broadcasts || []).flatMap((b) => b.names || (b.media ? [b.media.shortName] : []))
  return [...new Set(names.filter(Boolean))]
}

function normalizeEvent(ev) {
  const c = ev.competitions?.[0]
  if (!c) return null

  let seasonType = SEASON_TYPE[ev.seasonType?.id ?? c.type?.id]
  if (!seasonType) return null // drops preseason

  const home = c.competitors.find((t) => t.homeAway === 'home')
  const away = c.competitors.find((t) => t.homeAway === 'away')
  if (!home || !away) return null

  const series = parseSeriesNote(c.notes)
  if (CUP_FINAL.test(series.note || '')) seasonType = 'cup'

  const st = c.status?.type || {}
  const score = st.completed
    ? [Number(home.score?.value ?? home.score), Number(away.score?.value ?? away.score)]
    : undefined
  // Regulation is 4 quarters; anything beyond is overtime.
  const otPeriods = c.status?.period > 4 ? c.status.period - 4 : undefined

  const venue = c.venue || {}
  const broadcast = broadcastNames(c)

  return {
    id: ev.id,
    // ESPN emits UTC ("2026-07-19T17:00Z"). Kept as an absolute instant so it can be
    // rendered into any IANA zone — same contract as world-cup-viewer's `ko`.
    tip: new Date(ev.date).toISOString(),
    seasonType,
    home: home.team.abbreviation,
    away: away.team.abbreviation,
    venue: venue.fullName || null,
    city: venue.address?.city || null,
    state: venue.address?.state || null,
    neutral: c.neutralSite || undefined,
    broadcast: broadcast.length ? broadcast : undefined,
    // Committed results make the app render a complete season with zero requests;
    // the live overlay only has to cover today's games.
    score,
    ot: otPeriods,
    // Postponed games keep their original slot AND get a separate makeup event, so
    // both are in the feed. Flagging lets standings skip the dead one.
    postponed: st.name === 'STATUS_POSTPONED' || undefined,
    canceled: st.name === 'STATUS_CANCELED' || undefined,
    ...series,
  }
}

async function fetchSchedule(teams) {
  const byId = new Map()
  // 15 team-schedule calls cover the whole season; each game appears twice (once per
  // team), so dedupe by event id.
  const results = await Promise.all(
    teams.map(async (t) => {
      const seen = []
      for (const type of [2, 3]) {
        const d = await getJson(
          `${SITE}/teams/${t.abbr}/schedule?season=${SEASON}&seasontype=${type}`
        )
        seen.push(...(d.events || []))
      }
      return seen
    })
  )
  for (const ev of results.flat()) {
    const game = normalizeEvent(ev)
    if (game) byId.set(game.id, game)
  }
  return [...byId.values()].sort((a, b) => a.tip.localeCompare(b.tip) || a.id.localeCompare(b.id))
}

// Basketball has no analogue to enumerating goals — a game has ~65 scoring plays and
// the season has ~20,000, so per-basket events are neither fetchable nor useful. The
// meaningful unit is the QUARTER: a line score says how a game actually went in a way
// a single final score cannot ("won by 8" vs "led by 20 and held on").
//
// Line scores and per-game leaders live only on the scoreboard endpoint, not the
// team-schedule endpoint the rest of this script uses. The scoreboard accepts a date
// RANGE, so a month per request covers the season in ~6 calls.
const yyyymm = (iso) => iso.slice(0, 7)
const monthRange = (ym) => {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}${String(m).padStart(2, '0')}01-${y}${String(m).padStart(2, '0')}${last}`
}

// The three categories ESPN reports per game. "rating" is a composite summary line and
// duplicates the others, so it's dropped.
const LEADER_CATS = ['points', 'rebounds', 'assists']

async function enrichWithBoxScores(games) {
  const months = [...new Set(games.map((g) => yyyymm(g.tip)))].sort()
  const byId = new Map()

  for (const ym of months) {
    const d = await getJson(
      `${SITE}/scoreboard?dates=${monthRange(ym)}&limit=400`
    )
    for (const ev of d.events || []) {
      const c = ev.competitions?.[0]
      if (!c) continue
      const side = (ha) => c.competitors.find((t) => t.homeAway === ha)
      const home = side('home')
      const away = side('away')
      if (!home || !away) continue

      const line = (t) => (t.linescores || []).map((l) => Number(l.value))
      const hl = line(home)
      const al = line(away)

      const stars = (c.competitors || [])
        .flatMap((t) =>
          (t.leaders || [])
            .filter((l) => LEADER_CATS.includes(l.name))
            .map((l) => {
              const top = l.leaders?.[0]
              if (!top) return null
              return {
                cat: l.name,
                v: top.displayValue,
                who: top.athlete?.shortName || top.athlete?.displayName,
                team: t.team.abbreviation,
              }
            })
        )
        .filter(Boolean)

      byId.set(ev.id, {
        line: hl.length || al.length ? { home: hl, away: al } : undefined,
        stars: stars.length ? stars : undefined,
      })
    }
  }

  let n = 0
  for (const g of games) {
    const extra = byId.get(g.id)
    if (!extra) continue
    if (extra.line) {
      g.line = extra.line
      n++
    }
    if (extra.stars) g.stars = extra.stars
  }
  return n
}

// Season stat lines for every qualified player, in a single request. The core-API
// /leaders endpoint returns athletes as $ref links (≈75 extra fetches to resolve
// names); this one inlines name, team, and position, so the app ships leaderboards
// with zero runtime requests. Parsing (mapping each value by the feed's published
// column name rather than by array position) lives in ./leaders.mjs so it can be tested.
async function fetchLeaders() {
  const d = await getJson(
    `${WEB}/statistics/byathlete?region=us&lang=en&season=${SEASON}&seasontype=2&limit=300`
  )
  return parseLeaders(d)
}

// Logos never render larger than ~64px, so pull them through ESPN's image combiner at
// 160px instead of mirroring the 500px originals — ~8KB each rather than ~43KB.
const LOGO_PX = 160
const resized = (url) =>
  `https://a.espncdn.com/combiner/i?img=${encodeURIComponent(new URL(url).pathname)}&w=${LOGO_PX}&h=${LOGO_PX}`

async function mirrorLogos(teams) {
  await mkdir(join(ROOT, 'public/logos'), { recursive: true })
  let n = 0
  let bytes = 0
  await Promise.all(
    teams.flatMap((t) =>
      [
        [t.logo, `${t.slug}.png`],
        [t.logoDark, `${t.slug}-dark.png`],
      ].map(async ([url, file]) => {
        if (!url) return
        const res = await fetch(resized(url))
        if (!res.ok) throw new Error(`logo ${file}: HTTP ${res.status}`)
        const buf = Buffer.from(await res.arrayBuffer())
        await writeFile(join(ROOT, 'public/logos', file), buf)
        n++
        bytes += buf.length
      })
    )
  )
  return { n, kb: Math.round(bytes / 1024) }
}

const banner = (src) =>
  `// GENERATED by scripts/fetch-schedule.mjs — do not edit by hand.\n` +
  `// Source: ${src}\n\n`

async function main() {
  console.log(`Fetching ${SEASON} WNBA teams…`)
  const teams = await fetchTeams()
  console.log(`  ${teams.length} teams`)

  console.log('Fetching schedules…')
  const games = await fetchSchedule(teams)
  const counts = games.reduce((a, g) => ({ ...a, [g.seasonType]: (a[g.seasonType] || 0) + 1 }), {})
  console.log(`  ${games.length} games`, counts)

  // Must run before the schedule is written — it enriches `games` in place.
  console.log('Fetching line scores…')
  console.log(`  ${await enrichWithBoxScores(games)} games with quarter breakdowns`)

  // Logos are keyed by slug and resolved at render time from /logos/, so the committed
  // data carries no absolute ESPN URLs.
  const teamData = teams.map(({ logo, logoDark, ...t }) => t)

  await writeFile(
    join(ROOT, 'src/data/teams.js'),
    banner(`${SITE}/teams`) +
      `export const SEASON = ${SEASON}\n\n` +
      `export const TEAMS = ${JSON.stringify(teamData, null, 2)}\n\n` +
      `export const TEAM_BY_ABBR = Object.fromEntries(TEAMS.map((t) => [t.abbr, t]))\n\n` +
      `export const ALL_ABBRS = TEAMS.map((t) => t.abbr)\n`
  )

  await writeFile(
    join(ROOT, 'src/data/schedule.js'),
    banner(`${SITE}/teams/{abbr}/schedule?season=${SEASON}`) +
      `export const GAMES = [\n` +
      games.map((g) => `  ${JSON.stringify(g)},`).join('\n') +
      `\n]\n\n` +
      `export const SEASON_TYPES = ['regular', 'allstar', 'playoffs']\n\n` +
      `export const PLAYOFF_ROUNDS = { R1: 'First Round', SF: 'Semifinals', Final: 'WNBA Finals' }\n\n` +
      `// Best-of length per round, for series progress rendering.\n` +
      `export const SERIES_LENGTH = { R1: 3, SF: 5, Final: 7 }\n`
  )

  console.log('Fetching player stats…')
  const leaders = await fetchLeaders()
  console.log(`  ${leaders.length} qualified players`)

  await writeFile(
    join(ROOT, 'src/data/leaders.js'),
    banner(`${WEB}/statistics/byathlete?season=${SEASON}&seasontype=2`) +
      `// Season averages for every qualified player. Regenerated with the schedule,\n` +
      `// so leaderboards are a build-time concern rather than a runtime fetch.\n` +
      `export const PLAYERS = [\n` +
      leaders.map((p) => `  ${JSON.stringify(p)},`).join('\n') +
      `\n]\n`
  )

  if (WITH_LOGOS) {
    console.log('Mirroring logos…')
    const { n, kb } = await mirrorLogos(teams)
    console.log(`  ${n} files, ${kb} KB → public/logos/`)
  }

  console.log('Done.')
}

main().catch((err) => {
  console.error(`\nfetch-schedule failed:\n${err.message}`)
  process.exit(1)
})
