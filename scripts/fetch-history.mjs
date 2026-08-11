#!/usr/bin/env node
// Builds src/data/history.js — one entry per completed season in the current playoff
// format.
//
//   node scripts/fetch-history.mjs [--from 2022] [--to <SEASON>]
//
// WHY 2022 IS THE FLOOR: that is when the playoffs became series all the way down — a
// best-of-3 First Round, then best-of-5 Semifinals and Finals. Through 2021 the first two
// rounds were SINGLE elimination games with double byes for the top two seeds (the feed
// shows it plainly: 2021 headlines read "First Round" and "Second Round" with no game
// numbers), which is a different bracket shape and would need a second model. Starting at
// 2022 means every archived season uses the tree this app already draws.
//
// SERIES LENGTHS ARE PER SEASON, AND INFERRED, NOT HARDCODED. The Finals ran best-of-5
// through 2024 and best-of-7 from 2025. Rather than carry a table that will be wrong the
// next time the league changes it, each season's lengths are derived from its own
// results: the winner of a best-of-N needs exactly ceil(N/2) wins, so
// N = 2 × (winner's wins) − 1. A 4-0 Finals sweep can only be a best-of-7; a 3-1 can only
// be a best-of-5.
//
// WHAT IS COMMITTED: each season keeps its final standings, its playoff games, its season
// totals and its leader boards — the ~200 regular-season games are summarised into the
// standings rather than committed. The bracket is rebuilt at RUNTIME by the same
// buildBracket() the current season uses, so an archived bracket and a live one are the
// same code path. Box scores aren't committed either: the game-detail modal fetches them
// from ESPN by event id, and every archived game has one.

import { writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { fetchTeams, fetchSchedule, fetchLeaders } from './fetch-schedule.mjs'
import { SEASON } from '../src/data/teams.js'
import { seedings, countsForStandings } from '../src/utils/standings.js'
import { buildSeries, buildBracket } from '../src/utils/bracket.js'
import { leaderboard, LEADER_CATEGORIES } from '../src/utils/stats.js'
import { PLAYOFF_ROUNDS } from '../src/data/schedule.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = process.argv.slice(2)
const flag = (name, fallback) => Number(args[args.indexOf(name) + 1]) || fallback
const FROM = flag('--from', 2022)
// Up to and including the season the app is on. A season still being played has no
// champion and is dropped below, so this can run any day of the year and the current
// season joins the archive by itself the week the Finals end.
const TO = flag('--to', SEASON)

const ROUNDS = Object.keys(PLAYOFF_ROUNDS) // R1, SF, Final
const LEADERS_PER_CAT = 10
const NOTABLE = 5

// `teams` is the season membership (chronological, with games each) that fetchLeaders now
// resolves from the per-team splits — what lets an archived board badge its rows at all,
// since `team` alone was ESPN's CURRENT club and so anachronistic.
const PLAYER_FIELDS = [
  'id', 'name', 'team', 'teams', 'pos',
  ...new Set(LEADER_CATEGORIES.map((c) => c.key)),
]
const pick = (p) => Object.fromEntries(PLAYER_FIELDS.map((f) => [f, p[f]]))

const round1 = (v) => (typeof v === 'number' ? Number(v.toFixed(1)) : null)
const round3 = (v) => (typeof v === 'number' ? Number(v.toFixed(3)) : null)

// The winner of a best-of-N takes exactly ceil(N/2) games, so N = 2·wins − 1. Read off
// each round's decided series; a round with no completed series falls back to the longest
// series actually played, which can only under-report a still-running round.
function inferSeriesLengths(games) {
  // Deliberately built with a length table of 1 so `complete` doesn't gate the read:
  // this runs BEFORE the lengths are known, so it must not assume them.
  const series = buildSeries(games, Object.fromEntries(ROUNDS.map((r) => [r, 1])))
  const lengths = {}
  for (const round of ROUNDS) {
    const inRound = series.filter((s) => s.round === round)
    const mostWins = Math.max(0, ...inRound.map((s) => Math.max(...Object.values(s.wins))))
    if (mostWins) lengths[round] = 2 * mostWins - 1
  }
  return lengths
}

// The committed standings row: what the history table shows, and what buildBracket needs
// to seed the field. `results` (a per-game array) and the resolved `team` object are
// dropped — the first only feeds the fields already here, the second is looked up from
// teams.js at render time.
const compactRow = (r) => ({
  abbr: r.abbr,
  seed: r.seed,
  inPlayoffs: r.inPlayoffs || undefined,
  w: r.w,
  l: r.l,
  pct: round3(r.pct),
  gb: r.gb,
  home: [r.home.w, r.home.l],
  road: [r.road.w, r.road.l],
  l10: [r.last10.filter(Boolean).length, r.last10.filter((x) => !x).length],
  streak: r.streak,
  pf: r.pf,
  pa: r.pa,
  diff: r.diff,
  netPpg: round1(r.netPpg),
})

// Playoff games only; broadcast listings are dropped (a 2022 TV window is noise), and no
// line scores are fetched for them — the detail modal pulls the box score from ESPN.
const compactGame = ({ broadcast, line, stars, ...g }) => g

const notableGame = (g) => ({ id: g.id, tip: g.tip, home: g.home, away: g.away, score: g.score, ot: g.ot })

function seasonTotals(games) {
  const played = games.filter(countsForStandings)
  const margin = (g) => Math.abs(g.score[0] - g.score[1])
  const total = (g) => g.score[0] + g.score[1]
  const points = played.reduce((n, g) => n + total(g), 0)

  return {
    played: played.length,
    points,
    combinedPpg: round1(points / played.length),
    homeWins: played.filter((g) => g.score[0] > g.score[1]).length,
    ot: played.filter((g) => g.ot).length,
    nailbiters: played.filter((g) => margin(g) <= 3).length,
    blowouts: played.filter((g) => margin(g) >= 20).length,
    closest: [...played].sort((a, b) => margin(a) - margin(b)).slice(0, NOTABLE).map(notableGame),
    highest: [...played].sort((a, b) => total(b) - total(a)).slice(0, NOTABLE).map(notableGame),
  }
}

function summarise(year, games, leaderRows) {
  const lengths = inferSeriesLengths(games)
  // seedings() tables all of TODAY's franchises, so a season before an expansion team
  // existed gets phantom 0-0 rows for it (Golden State joined in 2025, Portland and
  // Toronto in 2026). They sort last, so the real seeds are unaffected — but they must
  // not appear in an archived table.
  const seeded = seedings(games).filter((r) => r.w + r.l > 0)
  const bracket = buildBracket(games, { lengths })
  const post = games.filter((g) => g.seasonType === 'playoffs').map(compactGame)

  const leaders = {}
  const players = {}
  for (const cat of LEADER_CATEGORIES) {
    const board = leaderboard(cat.key, { limit: LEADERS_PER_CAT, players: leaderRows })
    for (const p of board) players[p.id] ??= pick(p)
    leaders[cat.key] = board.map((p) => ({ id: p.id, rank: p.rank, value: p.value }))
  }

  return {
    year,
    label: String(year),
    champion: bracket.champion ?? null,
    runnerUp: bracket.rounds.Final[0].loser,
    lengths,
    standings: seeded.map(compactRow),
    games: post,
    totals: seasonTotals(games),
    players,
    leaders,
  }
}

const serialiseSeason = (s) =>
  [
    `  {`,
    `    year: ${s.year},`,
    `    label: ${JSON.stringify(s.label)},`,
    `    champion: ${JSON.stringify(s.champion)},`,
    `    runnerUp: ${JSON.stringify(s.runnerUp)},`,
    `    // Inferred from this season's own results, not assumed.`,
    `    lengths: ${JSON.stringify(s.lengths)},`,
    `    standings: [`,
    ...s.standings.map((r) => `      ${JSON.stringify(r)},`),
    `    ],`,
    `    games: [`,
    ...s.games.map((g) => `      ${JSON.stringify(g)},`),
    `    ],`,
    `    totals: {`,
    ...Object.entries(s.totals).map(([k, v]) =>
      Array.isArray(v)
        ? `      ${k}: [\n` + v.map((g) => `        ${JSON.stringify(g)},`).join('\n') + `\n      ],`
        : `      ${k}: ${JSON.stringify(v)},`
    ),
    `    },`,
    `    players: {`,
    ...Object.entries(s.players).map(([id, p]) => `      ${JSON.stringify(id)}: ${JSON.stringify(p)},`),
    `    },`,
    `    leaders: {`,
    ...LEADER_CATEGORIES.map(
      (cat) => `      ${JSON.stringify(cat.key)}: ${JSON.stringify(s.leaders[cat.key])},`
    ),
    `    },`,
    `  },`,
  ].join('\n')

async function main() {
  if (FROM < 2022) throw new Error('the all-series playoff format starts in 2022')
  if (TO < FROM) throw new Error(`--to ${TO} is before --from ${FROM}`)

  console.log('Fetching teams…')
  const teams = await fetchTeams()

  const seasons = []
  for (let year = TO; year >= FROM; year--) {
    console.log(`Season ${year}…`)
    const games = await fetchSchedule(teams, year)
    const leaderRows = await fetchLeaders(year)
    const s = summarise(year, games, leaderRows)

    if (!s.champion) {
      console.log(`  skipped — no champion yet (${games.length} games)`)
      continue
    }
    console.log(
      `  ${games.length} games → ${s.games.length} playoff rows, champion ${s.champion} ` +
        `over ${s.runnerUp}, series ${JSON.stringify(s.lengths)}`
    )
    seasons.push(s)
  }

  const out =
    `// GENERATED by scripts/fetch-history.mjs — do not edit by hand.\n` +
    `// Source: https://site.api.espn.com/apis/site/v2/sports/basketball/wnba\n\n` +
    `// Completed seasons since the playoffs became series all the way down (2022). Each\n` +
    `// season carries its final standings, its playoff games, its own SERIES LENGTHS (the\n` +
    `// Finals grew from best-of-5 to best-of-7 in 2025), its totals, and its leaders. The\n` +
    `// ~200 regular-season games are summarised into the standings rather than committed,\n` +
    `// and the bracket is rebuilt from these games at runtime by the same buildBracket()\n` +
    `// the current season uses.\n` +
    `export const HISTORY = [\n` +
    seasons.map(serialiseSeason).join('\n') +
    `\n]\n\n` +
    `export const HISTORY_BY_YEAR = Object.fromEntries(HISTORY.map((s) => [s.year, s]))\n\n` +
    `// Newest first — the order the season picker offers them in.\n` +
    `export const HISTORY_YEARS = HISTORY.map((s) => s.year)\n`

  await writeFile(join(ROOT, 'src/data/history.js'), out)
  console.log(`\nWrote src/data/history.js — ${seasons.length} seasons.`)
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`\nfetch-history failed:\n${err.message}`)
    process.exit(1)
  })
}
