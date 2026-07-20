// Playoff bracket.
//
// The structural difference from a knockout tournament: every slot is a best-of
// SERIES, not a single game. A slot is therefore derived by grouping games by round
// and opponent pair, then counting wins.
//
// The WNBA bracket is fixed by seed, not re-seeded between rounds:
//   R1:  1v8   4v5   2v7   3v6
//   SF:  winner(1v8) vs winner(4v5)   |   winner(2v7) vs winner(3v6)
//   F:   the two semifinal winners
// Confirmed against the 2025 postseason, where MIN (1) met PHX (4) and LV (2) met
// IND (3) in the semifinals.

import { seedings } from './standings.js'
import { SERIES_LENGTH, PLAYOFF_ROUNDS } from '../data/schedule.js'

export const ROUND_ORDER = ['R1', 'SF', 'Final']
export { PLAYOFF_ROUNDS, SERIES_LENGTH }

// Seed pairings for the first round, in bracket order (top half then bottom half).
export const R1_PAIRS = [
  [1, 8],
  [4, 5],
  [2, 7],
  [3, 6],
]

const winsNeeded = (round) => Math.ceil((SERIES_LENGTH[round] ?? 3) / 2)

const pairKey = (a, b) => [a, b].sort().join('|')

// Group playoff games into series. A series is keyed by round + opponent pair, so it
// survives home/away alternating between games.
export function buildSeries(games) {
  const byKey = new Map()

  for (const g of games) {
    if (g.seasonType !== 'playoffs' || !g.round) continue
    const key = `${g.round}:${pairKey(g.home, g.away)}`
    if (!byKey.has(key)) {
      byKey.set(key, { key, round: g.round, teams: [g.home, g.away].sort(), games: [] })
    }
    byKey.get(key).games.push(g)
  }

  return [...byKey.values()].map((s) => {
    s.games.sort((a, b) => (a.game ?? 0) - (b.game ?? 0) || a.tip.localeCompare(b.tip))

    const wins = Object.fromEntries(s.teams.map((t) => [t, 0]))
    for (const g of s.games) {
      if (!g.score || g.postponed || g.canceled) continue
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      if (winner in wins) wins[winner]++
    }

    const need = winsNeeded(s.round)
    const winner = s.teams.find((t) => wins[t] >= need) || null
    // Higher seed hosts game 1, so game 1's home team identifies the favoured side.
    const host = s.games.find((g) => g.game === 1)?.home ?? s.games[0]?.home ?? s.teams[0]

    return {
      ...s,
      wins,
      need,
      bestOf: SERIES_LENGTH[s.round] ?? 3,
      winner,
      loser: winner ? s.teams.find((t) => t !== winner) : null,
      // Ordered [higher seed, lower seed] for display.
      order: [host, s.teams.find((t) => t !== host)].filter(Boolean),
      complete: !!winner,
      live: s.games.some((g) => g.live),
    }
  })
}

const findSeries = (list, round, a, b) =>
  a && b ? list.find((s) => s.round === round && s.key === `${round}:${pairKey(a, b)}`) : undefined

// Build the seven bracket slots. Where real playoff games exist they drive the slot;
// where they don't, the slot is PROJECTED from current regular-season seeding — which
// is what makes this view useful in July rather than only in September.
export function buildBracket(games) {
  const series = buildSeries(games)
  const seeded = seedings(games)
  const bySeed = Object.fromEntries(seeded.map((r) => [r.seed, r]))

  const projected = series.length === 0

  // A slot resolves to a real series when its two teams are known and have played;
  // otherwise it's an empty shell carrying the labels of whatever feeds it.
  const slot = (round, a, b, meta = {}) => {
    const real = findSeries(series, round, a, b)
    if (real) return { ...real, ...meta, projected: false }
    return {
      key: `${round}:${a || '?'}|${b || '?'}`,
      round,
      teams: [a, b].filter(Boolean),
      order: [a, b],
      games: [],
      wins: Object.fromEntries([a, b].filter(Boolean).map((t) => [t, 0])),
      need: winsNeeded(round),
      bestOf: SERIES_LENGTH[round] ?? 3,
      winner: null,
      loser: null,
      complete: false,
      live: false,
      projected: true,
      ...meta,
    }
  }

  // Normally the first round is located by seed: slot 0 is the 1v8 series, and so on.
  // But seeding comes from regular-season records, so a game list containing only
  // playoff games (a fixture, or a mid-postseason feed) can't resolve it. When the
  // seed lookup fails to find series that demonstrably exist, fall back to the real
  // series in chronological order rather than reporting an empty bracket.
  const bySeedSlots = R1_PAIRS.map(([hi, lo], i) =>
    slot('R1', bySeed[hi]?.abbr, bySeed[lo]?.abbr, {
      seeds: [hi, lo],
      index: i,
      feeders: [`${hi} seed`, `${lo} seed`],
    })
  )

  const actualR1 = series
    .filter((s) => s.round === 'R1')
    .sort((a, b) => (a.games[0]?.tip || '').localeCompare(b.games[0]?.tip || ''))
  const actualSF = series.filter((s) => s.round === 'SF')

  const seedLookupWorked = bySeedSlots.filter((s) => !s.projected).length === actualR1.length

  // Without seeding, bracket POSITION still has to come from somewhere — and it isn't
  // chronology (in 2025 the 4v5 series ran third, not second). The semifinals reveal
  // it: each one names the two first-round winners that feed it, which is exactly the
  // adjacency the bracket encodes.
  const orderFromSemis = () => {
    const feeding = (sf) => actualR1.filter((r) => r.winner && sf.teams.includes(r.winner))
    const ordered = actualSF.flatMap(feeding)
    return ordered.length === actualR1.length ? ordered : null
  }

  const r1 = seedLookupWorked
    ? bySeedSlots
    : (orderFromSemis() ?? actualR1).map((s, i) => ({
        ...s,
        index: i,
        seeds: bySeedSlots[i]?.seeds,
      }))

  // Semifinal feeders name the round-1 matchups they come from, so an unresolved
  // slot still reads as "Winner 1/8" rather than blank.
  const feeder = (s) => (s?.seeds ? `Winner ${s.seeds[0]}/${s.seeds[1]}` : 'Winner')

  const sf = [
    slot('SF', r1[0].winner, r1[1].winner, {
      index: 0,
      feeders: [feeder(r1[0]), feeder(r1[1])],
      from: [r1[0], r1[1]],
    }),
    slot('SF', r1[2].winner, r1[3].winner, {
      index: 1,
      feeders: [feeder(r1[2]), feeder(r1[3])],
      from: [r1[2], r1[3]],
    }),
  ]

  const final = slot('Final', sf[0].winner, sf[1].winner, {
    index: 0,
    feeders: ['Semifinal winner', 'Semifinal winner'],
    from: [sf[0], sf[1]],
  })

  return {
    projected,
    rounds: { R1: r1, SF: sf, Final: [final] },
    champion: final.winner,
    seeded: seeded.slice(0, 8),
  }
}

// Flat list in draw order, for the radial layout.
export const bracketSlots = (bracket) =>
  ROUND_ORDER.flatMap((r) => bracket.rounds[r].map((s) => ({ ...s, round: r })))

// ── Radial geometry ──────────────────────────────────────────────────────────
// Kept here rather than in the component so it can be tested without a DOM.
//
// The eight seeds sit on the outer ring and winners advance inward, so distance
// from the centre reads directly as "how far they got". Each match sits at the
// angular midpoint of its two children:
//
//   R1 matches → 90° (top), 0° (right), 270° (bottom), 180° (left)
//   Semifinals → 45° (upper right), 225° (lower left)
//
// which puts the two finalists on opposite sides of the centre.

export const CENTER = 50
export const RING = { leaf: 41, R1: 29, SF: 17 }

// Seed order around the ring, matching the fixed bracket: 1v8, 4v5 | 2v7, 3v6.
export const LEAF_SEEDS = [1, 8, 4, 5, 2, 7, 3, 6]

export const polar = (deg, r) => {
  const rad = (deg * Math.PI) / 180
  return { x: CENTER + r * Math.cos(rad), y: CENTER - r * Math.sin(rad) }
}

// Circular midpoint — a plain average breaks across the 180°/-180° seam.
export function midAngle(a, b) {
  const diff = ((b - a + 540) % 360) - 180
  return (a + diff / 2 + 360) % 360
}

const leafAngle = (i) => (112.5 - i * 45 + 360) % 360

export function layout() {
  const leaves = LEAF_SEEDS.map((seed, i) => ({ seed, angle: leafAngle(i), r: RING.leaf }))
  const r1 = [0, 1, 2, 3].map((i) => ({
    angle: midAngle(leaves[i * 2].angle, leaves[i * 2 + 1].angle),
    r: RING.R1,
    children: [leaves[i * 2], leaves[i * 2 + 1]],
  }))
  const sf = [0, 1].map((i) => ({
    angle: midAngle(r1[i * 2].angle, r1[i * 2 + 1].angle),
    r: RING.SF,
    children: [r1[i * 2], r1[i * 2 + 1]],
  }))
  return { leaves, r1, sf }
}
