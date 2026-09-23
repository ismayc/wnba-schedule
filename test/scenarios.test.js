import { describe, it, expect } from 'vitest'
import {
  OUT,
  MAX_OPEN_GAMES,
  TIEBREAK_STEPS,
  remainingGames,
  favoritePicks,
  rankScenario,
  enumerateScenarios,
  picksFromMask,
  combinations,
  meanSeed,
  maxMargin,
  rowPercents,
  exactFinishRanges,
  playoffRaceExact,
} from '../src/utils/scenarios.js'
import { computeStandings, rankTable, seedings, playoffRace, PLAYOFF_SPOTS } from '../src/utils/standings.js'
import { TEAMS } from '../src/data/teams.js'

const game = (over) => ({
  id: String(Math.random()),
  seasonType: 'regular',
  tip: '2026-05-10T00:00:00.000Z',
  home: 'MIN',
  away: 'SEA',
  score: [90, 80],
  ...over,
})

const open = (over) => game({ score: null, tip: '2026-09-20T00:00:00.000Z', ...over })

describe('remainingGames', () => {
  it('keeps unplayed and live regular-season games, in tip then id order', () => {
    const games = [
      game({ id: 'final' }),
      open({ id: 'b', tip: '2026-09-21T00:00:00.000Z' }),
      open({ id: 'z' }),
      open({ id: 'a' }),
      game({ id: 'live', live: true, tip: '2026-09-22T00:00:00.000Z' }),
      open({ id: 'pp', postponed: true }),
      open({ id: 'cx', canceled: true }),
      open({ id: 'po', seasonType: 'playoffs' }),
    ]
    expect(remainingGames(games).map((g) => g.id)).toEqual(['a', 'z', 'b', 'live'])
  })
})

describe('favoritePicks', () => {
  it('picks the better record, and the home side on a tie', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [70, 90] })]
    const table = computeStandings(games)
    const picks = favoritePicks(
      [open({ id: 'x', home: 'SEA', away: 'MIN' }), open({ id: 'y', home: 'LA', away: 'PHX' })],
      table
    )
    expect(picks).toEqual({ x: 'away', y: 'home' })
  })
})

describe('rankScenario', () => {
  it('matches the real seeding when nothing is left to pick', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [99, 70] })]
    const { rows, marginDependent } = rankScenario(games, {})
    expect(rows.map((r) => r.abbr)).toEqual(seedings(games).map((r) => r.abbr))
    // The zero-point-differential pile at the bottom falls to the alphabetical stand-in,
    // which no hypothetical margin decides.
    expect(marginDependent).toBe(false)
  })

  it('books a pick as a one-point win and ignores picks for games not open', () => {
    const games = [open({ id: 'g', home: 'MIN', away: 'SEA' }), game({ id: 'done', home: 'LV', away: 'GS' })]
    const { rows } = rankScenario(games, { g: 'away', done: 'away' })
    const sea = rows.find((r) => r.abbr === 'SEA')
    expect([sea.w, sea.l, sea.diff]).toEqual([1, 0, 1])
    // "done" is final, so the stale pick does not flip LV's real win.
    expect(rows.find((r) => r.abbr === 'LV').w).toBe(1)
  })

  it('flags an order that overall point differential settles with a picked game', () => {
    // MIN and LV both 1-0, never met, same (empty) record vs .500 teams: step 4 decides,
    // and LV's +1 is a hypothetical margin.
    const games = [game({ home: 'MIN', away: 'SEA' }), open({ id: 'g', home: 'LV', away: 'GS' })]
    const out = rankScenario(games, { g: 'home' })
    expect(out.marginDependent).toBe(true)
    expect(out.trace.some((t) => t.step === 4)).toBe(true)
  })

  it('does not flag step 4 when every tied team played only real games', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [85, 80] })]
    const out = rankScenario(games, {})
    expect(out.trace.some((t) => t.step === 4)).toBe(true)
    expect(out.marginDependent).toBe(false)
  })

  it('flags head-to-head point differential only when a picked game is inside the group', () => {
    // MIN and LV split two games, so step 1 and step 2 tie; step 3 is their head-to-head
    // differential, which includes the picked rematch.
    const inside = [game({ home: 'MIN', away: 'LV', score: [90, 80] }), open({ id: 'r', home: 'LV', away: 'MIN' })]
    const a = rankScenario(inside, { r: 'home' })
    expect(a.trace.find((t) => t.teams.includes('MIN')).step).toBe(3)
    expect(a.marginDependent).toBe(true)

    // Same split, both real; each side's picked game is against an outsider. Step 3
    // decides MIN/LV off real margins. (The outsiders' own pile still ends on step 4
    // with picked games, which is flagged, so check the step-3 entry on its own.)
    const outside = [
      game({ home: 'MIN', away: 'LV', score: [90, 80] }),
      game({ home: 'LV', away: 'MIN', score: [85, 80] }),
      open({ id: 'x', home: 'MIN', away: 'SEA' }),
      open({ id: 'y', home: 'LV', away: 'GS' }),
    ]
    const b = rankScenario(outside, { x: 'home', y: 'home' })
    const step3 = b.trace.filter((t) => t.step === 3)
    expect(step3.map((t) => [...t.teams].sort())).toEqual([['LV', 'MIN']])
  })
})

describe('enumerateScenarios', () => {
  const games = [
    game({ home: 'MIN', away: 'SEA' }),
    open({ id: 'g1', home: 'MIN', away: 'LV' }),
    open({ id: 'g2', home: 'GS', away: 'LV', tip: '2026-09-21T00:00:00.000Z' }),
  ]

  it('plays out every completion and tallies each seed bucket', () => {
    const r = enumerateScenarios(games)
    expect(r.total).toBe(4)
    expect(r.undecided.map((g) => g.id)).toEqual(['g1', 'g2'])
    for (const team of Object.values(r.teams)) {
      const sum = Object.values(team).reduce((n, c) => n + c.count, 0)
      expect(sum).toBe(4)
    }
    // MIN (1-0) is first exactly when it beats LV; then g2 can go either way.
    expect(r.teams.MIN[1].count).toBe(2)
    // Bit 0 is g1 (MIN home): every MIN-first outcome has it set.
    expect(r.teams.MIN[1].masks.every((m) => m & 1)).toBe(true)
    // 15 teams, 8 seeds: the rest pile into OUT.
    expect(r.teams.TOR[OUT].count).toBe(4)
  })

  it('respects picks and narrows the space', () => {
    const r = enumerateScenarios(games, { g1: 'home' })
    expect(r.total).toBe(2)
    expect(r.teams.MIN[1].count).toBe(2)
  })

  it('counts margin-dependent outcomes per bucket', () => {
    const r = enumerateScenarios(games)
    // MIN (+10 real) vs a picked GS or LV win (+1 to +10): either could lead.
    const g = [game({ home: 'MIN', away: 'SEA' }), open({ id: 'g', home: 'LV', away: 'GS' })]
    const m = enumerateScenarios(g)
    expect(m.margin).toBe(10)
    expect([m.teams.MIN[1].count, m.teams.MIN[1].maybe]).toEqual([0, 2])
    expect([m.teams.MIN[2].count, m.teams.MIN[2].maybe]).toEqual([0, 2])
    expect(m.teams.MIN[1].tiebreaks).toEqual({ 4: 2 })
    // Only certain outcomes carry masks; a margin-dependent one is counted apart.
    expect(m.teams.MIN[1].masks).toEqual([])
    expect(r.teams.MIN[1].maybe).toBe(0)
  })

  it('refuses to enumerate past the cap', () => {
    const r = enumerateScenarios(games, {}, { max: 1 })
    expect(r.tooMany).toBe(true)
    expect(r.total).toBe(0)
    expect(r.teams).toEqual({})
    expect(MAX_OPEN_GAMES).toBeGreaterThan(10)
  })
})

describe('picksFromMask, combinations, meanSeed', () => {
  const games = [
    game({ home: 'MIN', away: 'SEA' }),
    open({ id: 'g1', home: 'MIN', away: 'LV' }),
    open({ id: 'g2', home: 'GS', away: 'LV', tip: '2026-09-21T00:00:00.000Z' }),
  ]
  const r = enumerateScenarios(games)
  const flat = (cs) => cs.map(({ results, count }) => [results.map(({ game: g, side }) => `${g.id}:${side}`), count])

  it('turns a mask back into picks', () => {
    expect(picksFromMask(r.undecided, 0b01, { keep: 'home' })).toEqual({ keep: 'home', g1: 'home', g2: 'away' })
    expect(picksFromMask(r.undecided, 0b10)).toEqual({ g1: 'away', g2: 'home' })
  })

  it('names exactly the results behind a cell', () => {
    // LV finishes first only by winning both games.
    expect(flat(combinations(r.teams.LV[1].masks, r.undecided))).toEqual([[['g1:away', 'g2:away'], 1]])
    // MIN is first by beating LV, whatever happens in g2.
    expect(flat(combinations(r.teams.MIN[1].masks, r.undecided))).toEqual([[['g1:home'], 2]])
    // LV is second two different ways, and neither result alone decides it.
    expect(flat(combinations(r.teams.LV[2].masks, r.undecided))).toEqual([
      [['g1:home', 'g2:away'], 1],
      [['g1:away', 'g2:home'], 1],
    ])
    expect(combinations([], r.undecided)).toEqual([])
  })

  it('merges pieces that differ only in who wins one game', () => {
    const three = [0, 1, 2].map((i) => open({ id: `m${i}` }))
    // Bit 1 set, the rest free, except the split would first peel off bit 0 or 2.
    const masks = [0b010, 0b011, 0b110, 0b111]
    expect(flat(combinations(masks, three))).toEqual([[['m1:home'], 4]])
  })

  it('is exact and disjoint on every cell of a real-sized board', () => {
    const teams = ['MIN', 'LV', 'GS', 'SEA', 'LA', 'PHX', 'DAL', 'POR']
    const board = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'LV', away: 'GS', score: [80, 85] })]
    for (let i = 0; i < 7; i++)
      board.push(open({ id: `b${i}`, home: teams[i], away: teams[(i * 3 + 1) % 8], tip: `2026-09-2${i}T00:00:00.000Z` }))
    const e = enumerateScenarios(board)
    let cells = 0
    for (const t of Object.values(e.teams))
      for (const c of Object.values(t)) {
        const cs = combinations(c.masks, e.undecided)
        // Expand every piece back into scenarios: each exactly once, and nothing else.
        const got = []
        for (const { results } of cs) {
          const fixed = Object.fromEntries(results.map(({ game: g, side }) => [e.undecided.indexOf(g), side]))
          for (let m = 0; m < e.total; m++)
            if (Object.entries(fixed).every(([i, side]) => !!(m & (1 << i)) === (side === 'home'))) got.push(m)
        }
        expect(got.sort((a, b) => a - b)).toEqual([...c.masks].sort((a, b) => a - b))
        expect(cs.reduce((n, x) => n + x.count, 0)).toBe(c.count)
        if (c.count) cells++
      }
    expect(cells).toBeGreaterThan(20)
  })

  it('averages the seed bucket', () => {
    expect(meanSeed(r.teams.TOR)).toBe(OUT)
    expect(meanSeed(r.teams.MIN)).toBeLessThan(2)
  })

  it('names every tiebreak step', () => {
    expect(Object.keys(TIEBREAK_STEPS)).toEqual(['1', '2', '3', '4', '5'])
    expect(OUT).toBe(PLAYOFF_SPOTS + 1)
  })
})

describe('rowPercents', () => {
  const team = (counts, maybes = {}) =>
    Object.fromEntries(
      Array.from({ length: OUT }, (_, i) => i + 1).map((s) => [s, { count: counts[s] ?? 0, maybe: maybes[s] ?? 0 }])
    )
  const sum = (p) => Object.values(p).reduce((a, b) => a + b, 0)

  it('adds up to exactly 100 where rounding each cell would not', () => {
    // 512 + 3072 + 512 of 4096: 12.5 + 75 + 12.5 rounds to 13 + 75 + 13 = 101.
    const p = rowPercents(team({ 3: 512, 4: 3072, 5: 512 }), 4096)
    expect(sum(p)).toBe(100)
    // An exact tie on the remainder goes to the better seed.
    expect(p).toEqual({ 3: 13, 4: 75, 5: 12 })
    // Thirds would round to 33 + 33 + 33 = 99.
    expect(sum(rowPercents(team({ 1: 1, 2: 1, 3: 1 }), 3))).toBe(100)
  })

  it('gives a leftover point to the bigger count before the better seed', () => {
    // 2/7 = 28.57 and 5/7 = 71.43: floors 28 + 71, one point short, 28's remainder wins.
    expect(rowPercents(team({ 1: 2, 2: 5 }), 7)).toEqual({ 1: 29, 2: 71 })
  })

  it('leaves margin-dependent outcomes out, so such a row can sum below 100', () => {
    const p = rowPercents(team({ 1: 2 }, { 1: 1, 2: 1 }), 4)
    expect(p).toEqual({ 1: 50 })
  })

  it('matches every row of the grid on a random board', () => {
    const games = [
      game({ home: 'MIN', away: 'SEA' }),
      open({ id: 'a', home: 'MIN', away: 'LV' }),
      open({ id: 'b', home: 'GS', away: 'LV', tip: '2026-09-21T00:00:00.000Z' }),
      open({ id: 'c', home: 'LA', away: 'PHX', tip: '2026-09-22T00:00:00.000Z' }),
    ]
    const r = enumerateScenarios(games)
    // Rows whose seeds all hold at any margin sum to 100 exactly.
    const certain = Object.values(r.teams).filter((t) => Object.values(t).every((c) => !c.maybe))
    expect(certain.length).toBeGreaterThan(5)
    for (const t of certain) expect(sum(rowPercents(t, r.total))).toBe(100)
  })
})

describe('maxMargin', () => {
  it('is the biggest real winning margin, and at least 1', () => {
    expect(maxMargin([game({ score: [100, 52] }), game({ score: [80, 90] }), open({})])).toBe(48)
    expect(maxMargin([open({})])).toBe(1)
  })
})

describe('seed ranges under every margin', () => {
  it('spans the tied block when a picked margin can reorder it (step 4)', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), open({ id: 'g', home: 'LV', away: 'GS' })]
    const sc = rankScenario(games, { g: 'home' })
    expect(sc.margin).toBe(10)
    expect(sc.ranges.MIN).toEqual([1, 2])
    expect(sc.ranges.LV).toEqual([1, 2])
    expect(sc.trace.find((t) => t.teams.includes('MIN')).margin).toBe(true)
    // Teams no picked game touches keep their exact place.
    expect(sc.ranges.ATL).toEqual([3, 3])
  })

  it('keeps an order that no margin can overturn (step 3 is decisive)', () => {
    // MIN and LV split four meetings 2-2, MIN +19 in the real ones; the picked LV win
    // takes back at most 10, so MIN stays ahead at any margin.
    const games = [
      game({ home: 'MIN', away: 'LV', score: [90, 80] }),
      game({ home: 'LV', away: 'MIN', score: [80, 90] }),
      game({ home: 'LV', away: 'MIN', score: [81, 80] }),
      open({ id: 'p', home: 'LV', away: 'MIN' }),
    ]
    const sc = rankScenario(games, { p: 'home' })
    expect(sc.trace.find((t) => t.teams.includes('MIN')).step).toBe(3)
    expect(sc.ranges.MIN).toEqual([1, 1])
    expect(sc.ranges.LV).toEqual([2, 2])
    expect(sc.marginDependent).toBe(false)
  })

  it('falls through a head-to-head that is level at any margin to overall differential', () => {
    // MIN and LV split two real games by the same score; each also has a picked win
    // over an outsider, so step 4 is open.
    const games = [
      game({ home: 'MIN', away: 'LV', score: [90, 80] }),
      game({ home: 'LV', away: 'MIN', score: [90, 80] }),
      open({ id: 'a', home: 'MIN', away: 'SEA' }),
      open({ id: 'b', home: 'LV', away: 'GS' }),
    ]
    const sc = rankScenario(games, { a: 'home', b: 'home' })
    expect(sc.ranges.MIN).toEqual([1, 2])
    expect(sc.ranges.LV).toEqual([1, 2])
    expect(sc.marginDependent).toBe(true)
  })

  it('never reports a seed outside the range, whatever the margins (brute force)', () => {
    // Four teams, one-to-five-point games, three of them picked: found by search as a
    // board where picked margins genuinely reorder the tied teams.
    const base = [
      game({ id: 'r0', home: 'GS', away: 'LV', score: [80, 81] }),
      game({ id: 'r1', home: 'GS', away: 'SEA', score: [80, 81] }),
      game({ id: 'r2', home: 'GS', away: 'SEA', score: [81, 80] }),
      game({ id: 'r3', home: 'MIN', away: 'GS', score: [85, 80] }),
    ]
    const picked = [
      open({ id: 'p1', home: 'GS', away: 'MIN' }),
      open({ id: 'p2', home: 'MIN', away: 'GS', tip: '2026-09-21T00:00:00.000Z' }),
      open({ id: 'p3', home: 'LV', away: 'MIN', tip: '2026-09-22T00:00:00.000Z' }),
    ]
    const games = [...base, ...picked]
    const M = maxMargin(games)
    let checked = 0
    let reordered = 0
    let wide = 0
    for (let mask = 0; mask < 8; mask++) {
      const picks = picksFromMask(picked, mask)
      const sc = rankScenario(games, picks)
      const orders = new Set()
      if (sc.marginDependent) wide++
      // Every margin from 1 to M for every picked game.
      for (let a = 1; a <= M; a++)
        for (let b = 1; b <= M; b++)
          for (let c = 1; c <= M; c++) {
            const ms = { p1: a, p2: b, p3: c }
            const scored = games.map((g) =>
              ms[g.id] ? { ...g, score: picks[g.id] === 'home' ? [100 + ms[g.id], 100] : [100, 100 + ms[g.id]] } : g
            )
            const seeded = seedings(scored)
            orders.add(seeded.map((r) => r.abbr).join())
            seeded.forEach((row, i) => {
              const [lo, hi] = sc.ranges[row.abbr]
              expect(i + 1).toBeGreaterThanOrEqual(lo)
              expect(i + 1).toBeLessThanOrEqual(hi)
              checked++
            })
          }
      // One-point margins reproduce the engine's own order exactly.
      const one = games.map((g) =>
        picks[g.id] ? { ...g, score: picks[g.id] === 'home' ? [101, 100] : [100, 101] } : g
      )
      expect(seedings(one).map((r) => r.abbr)).toEqual(sc.rows.map((r) => r.abbr))
      if (orders.size > 1) {
        reordered++
        // Margins reordered this season, so the engine must have said so.
        expect(sc.marginDependent).toBe(true)
      }
    }
    expect(checked).toBe(8 * M ** 3 * 15)
    // The board really exercises the margin path.
    expect(reordered).toBeGreaterThan(0)
    expect(wide).toBeGreaterThanOrEqual(reordered)
  })
})

describe('rankTable', () => {
  it('orders a table exactly as seedings does, and traces the ties it breaks', () => {
    const games = [game({ home: 'MIN', away: 'SEA' }), game({ home: 'SEA', away: 'MIN', score: [85, 80] })]
    const trace = []
    const rows = rankTable(computeStandings(games), trace)
    expect(rows.map((r) => r.abbr)).toEqual(seedings(games).map((r) => r.abbr))
    expect(trace.map((t) => t.step)).toContain(3)
    expect(trace.map((t) => t.step)).toContain(5)
  })
})

describe('playoffRaceExact', () => {
  // A full single round-robin with two games left open, from a seeded generator: a
  // board where the tiebreak-blind win bounds miss a clinch, an elimination and a
  // narrower window that the exact enumeration finds.
  const board = () => {
    let seed = 9
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const abbrs = TEAMS.map((t) => t.abbr)
    const games = []
    let id = 0
    for (let i = 0; i < 15; i++)
      for (let j = i + 1; j < 15; j++) {
        const isOpen = rand() < 0.03
        const m = 1 + Math.floor(rand() * 9)
        const homeWins = rand() < 0.5 + (j - i) / 40
        games.push({
          id: `g${id++}`,
          seasonType: 'regular',
          tip: isOpen ? '2026-09-20T00:00:00.000Z' : '2026-05-01T00:00:00.000Z',
          home: abbrs[i],
          away: abbrs[j],
          score: isOpen ? null : homeWins ? [80 + m, 80] : [80, 80 + m],
        })
      }
    return games
  }
  const games = board()
  const open = remainingGames(games)
  const arith = playoffRace(games)
  const exact = playoffRaceExact(games)

  it('corrects the win bounds, both ways, where tiebreakers decide', () => {
    expect(open).toHaveLength(2)
    const by = (rows, abbr) => rows.find((r) => r.abbr === abbr)
    // Four teams finish 11-3. The win bounds let LV finish as high as 1 and promise it
    // no worse than 3; the group's head-to-head puts it 4th in every outcome.
    expect([by(arith, 'LV').bestRank, by(arith, 'LV').worstRank]).toEqual([1, 3])
    expect([by(exact, 'LV').bestRank, by(exact, 'LV').worstRank]).toEqual([4, 4])
    // A three-way tie at 6-8 drops WSH to 10th, below the 9th the bounds promised.
    expect(by(arith, 'WSH').worstRank).toBe(9)
    expect([by(exact, 'WSH').bestRank, by(exact, 'WSH').worstRank]).toEqual([10, 10])
    const newlyClinched = exact.filter((r, i) => r.clinched && !arith[i].clinched)
    expect(newlyClinched.length).toBeGreaterThan(0)
    // A clinched team has no magic number left to show.
    for (const r of newlyClinched) expect(r.magic).toBeNull()
    expect(exact.some((r, i) => r.eliminated && !arith[i].eliminated)).toBe(true)
  })

  it('never rules out a finish that some result and margins produce (brute force)', () => {
    const ranges = Object.fromEntries(exact.map((r) => [r.abbr, [r.bestRank, r.worstRank]]))
    for (let mask = 0; mask < 4; mask++) {
      for (const [a, b] of [[1, 1], [1, 60], [60, 1], [30, 30], [500, 2]]) {
        const ms = [a, b]
        const scored = games.map((g) => {
          const i = open.findIndex((o) => o.id === g.id)
          if (i < 0) return g
          const m = ms[i]
          return { ...g, score: mask & (1 << i) ? [100 + m, 100] : [100, 100 + m] }
        })
        seedings(scored).forEach((row, pos) => {
          expect(pos + 1).toBeGreaterThanOrEqual(ranges[row.abbr][0])
          expect(pos + 1).toBeLessThanOrEqual(ranges[row.abbr][1])
        })
      }
    }
  })

  it('falls back to the win bounds when too many games are open', () => {
    expect(exactFinishRanges(games, { max: 1 })).toBeNull()
    const many = games.map((g) => ({ ...g, score: null }))
    expect(playoffRaceExact(many)).toEqual(playoffRace(many))
  })
})
