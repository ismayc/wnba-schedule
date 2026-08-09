// Late-season clinch scenarios — bounded exact enumeration over the remaining
// schedule. The win-bound ranges in standings.js treat rivals independently, so they
// can miss a clinch the SCHEDULE itself guarantees: two chasers who still play each
// other cannot both win out — one of them must eat a loss. This engine enumerates the
// remaining games among the chasers that could still matter and asks, outcome by
// outcome, whether enough rivals can actually finish ahead.
//
// Scope and honesty:
// - CLINCH side only. The ✕ / elimination flags stay purely arithmetic in
//   standings.js so they never rest on an assumption.
// - Ties at the team's floor are resolved by the official step 1 — head-to-head among
//   the tied group — which is fully known inside a scenario (every game among the
//   tied teams is either played or enumerated, and the team's own remaining games are
//   losses by construction). If step 1 leaves a rival level with the team, the deeper
//   steps depend on league-wide records outside the enumeration, so that rival is
//   charged AGAINST the team. Conservative, never wrong.
// - The engine only runs when the coupled schedule is small enough to enumerate
//   (budget gate) — exactly the late-season window where it is useful. Over budget it
//   returns null and the caller keeps the arithmetic verdict.

// A live score is provisional, so an in-progress game is still "remaining" here.
const isRemaining = (g) =>
  g.seasonType === 'regular' && !g.postponed && !g.canceled && (!g.score || !!g.live)

const isPlayed = (g) =>
  g.seasonType === 'regular' && !g.postponed && !g.canceled && !!g.score && !g.live

// 2^18 coupled-game outcomes ≈ a quarter-million leaf evaluations — unnoticeable in
// the browser, and wide enough to cover roughly the last two weeks of chasers' games.
export const MAX_COUPLED_GAMES = 18

/**
 * Is `teamAbbr` guaranteed to finish inside the top `cut`, checked by enumerating the
 * remaining coupled schedule? Returns:
 *   true  — clinched: no enumerated outcome puts `cut` rivals at or above the team
 *   false — some outcome still catches the team
 *   null  — the coupled schedule is too large to enumerate (caller keeps its verdict)
 *
 * `rows` must carry { abbr, w, gp }; `totals` is scheduledGames(games).
 */
export function scenarioClinched(teamAbbr, rows, totals, games, cut, opts = {}) {
  const maxCoupled = opts.maxCoupled ?? MAX_COUPLED_GAMES
  const team = rows.find((r) => r.abbr === teamAbbr)
  const floor = team.w // the team loses out — the adversary controls its games too
  const remaining = games.filter(isRemaining)

  // Rivals already past the floor are ahead in every scenario (wins never come off).
  // Chasers are the rest that could still reach the floor with every remaining win;
  // anyone else can never catch the team's worst case and is irrelevant.
  let ahead0 = 0
  const chasers = new Set()
  for (const r of rows) {
    if (r.abbr === teamAbbr) continue
    if (r.w > floor) ahead0++
    else if (r.w + ((totals[r.abbr] ?? 0) - r.gp) >= floor) chasers.add(r.abbr)
  }
  if (ahead0 >= cut) return false // already caught, no enumeration needed

  // Contested games: both sides are chasers, so a win for one is a loss for the
  // other — the coupling the independent bounds cannot see. Every other remaining
  // game is handed to the chaser (adversary's choice), including games vs the team.
  const coupled = remaining.filter((g) => chasers.has(g.home) && chasers.has(g.away))
  if (coupled.length > maxCoupled) return null

  // Adversary-optimal base wins: every chaser wins all of its uncoupled games.
  const wins = new Map()
  for (const abbr of chasers) {
    const r = rows.find((x) => x.abbr === abbr)
    const uncoupled = remaining.filter(
      (g) =>
        (g.home === abbr || g.away === abbr) &&
        !(chasers.has(g.home) && chasers.has(g.away))
    ).length
    wins.set(abbr, r.w + uncoupled)
  }

  // Head-to-head ledgers inside {team ∪ chasers}, for step-1 tie resolution:
  // played wins per pair, plus the team's remaining games (losses for the team).
  const groupSet = new Set([teamAbbr, ...chasers])
  const pairW = new Map() // "A|B" sorted → { [abbr]: wins }
  const pairGp = new Map() // "A|B" sorted → games (played + team's remaining)
  const bump = (a, b, winner) => {
    const key = [a, b].sort().join('|')
    pairGp.set(key, (pairGp.get(key) ?? 0) + 1)
    const e = pairW.get(key) ?? {}
    e[winner] = (e[winner] ?? 0) + 1
    pairW.set(key, e)
  }
  for (const g of games) {
    if (!groupSet.has(g.home) || !groupSet.has(g.away)) continue
    if (isPlayed(g)) bump(g.home, g.away, g.score[0] > g.score[1] ? g.home : g.away)
    else if (isRemaining(g) && (g.home === teamAbbr || g.away === teamAbbr)) {
      // The team loses out: its side of the pair game is a loss, the rival's a win.
      bump(g.home, g.away, g.home === teamAbbr ? g.away : g.home)
    }
  }

  // Step-1 head-to-head among a tied group, exact for this scenario: the coupled
  // outcomes on the stack supply the group games the ledgers do not carry.
  const outcome = []
  const groupRecord = (abbr, group) => {
    let w = 0
    let gp = 0
    for (const other of group) {
      if (other === abbr) continue
      const key = [abbr, other].sort().join('|')
      gp += pairGp.get(key) ?? 0
      w += pairW.get(key)?.[abbr] ?? 0
    }
    coupled.forEach((g, i) => {
      const opp = g.home === abbr ? g.away : g.away === abbr ? g.home : null
      if (!opp || !group.includes(opp)) return
      gp++
      if ((outcome[i] ? g.home : g.away) === abbr) w++
    })
    return gp ? w / gp : null
  }

  const caughtAtLeaf = () => {
    let ahead = ahead0
    const tied = []
    for (const abbr of chasers) {
      const w = wins.get(abbr)
      if (w > floor) ahead++
      else if (w === floor) tied.push(abbr)
    }
    if (ahead >= cut) return true
    if (!tied.length || ahead + tied.length < cut) return false
    const group = [teamAbbr, ...tied]
    const teamPct = groupRecord(teamAbbr, group)
    for (const abbr of tied) {
      const rivalPct = groupRecord(abbr, group)
      // A tied rival counts ahead unless step 1 puts the team strictly above it.
      if (teamPct === null || rivalPct === null || rivalPct >= teamPct) ahead++
    }
    return ahead >= cut
  }

  const catches = (depth) => {
    if (depth === coupled.length) return caughtAtLeaf()
    const g = coupled[depth]
    for (const homeWins of [true, false]) {
      outcome[depth] = homeWins
      const winner = homeWins ? g.home : g.away
      wins.set(winner, wins.get(winner) + 1)
      const caught = catches(depth + 1)
      wins.set(winner, wins.get(winner) - 1)
      if (caught) return true
    }
    return false
  }

  return !catches(0)
}
