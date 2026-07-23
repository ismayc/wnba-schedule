import { describe, it, expect } from 'vitest'
import { GAMES } from '../src/data/schedule.js'
import { ALL_ABBRS } from '../src/data/teams.js'

// The committed schedule is the single source of truth for *who* plays whom — the
// live overlay only ever paints score/clock/status onto a game matched by id, and
// never rewrites the matchup (see espn.test.js). So a regenerated schedule that
// flips or duplicates a matchup would silently show the wrong game with a real live
// score attached. These are the guards that would catch that.

const known = new Set(ALL_ABBRS)

describe('committed schedule integrity', () => {
  it('has games', () => {
    expect(GAMES.length).toBeGreaterThan(0)
  })

  it('gives every game a unique id', () => {
    const ids = GAMES.map((g) => g.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never lists a team against itself', () => {
    for (const g of GAMES) expect(g.home).not.toBe(g.away)
  })

  it('stamps every game with a parseable tip time', () => {
    for (const g of GAMES) expect(Number.isNaN(Date.parse(g.tip))).toBe(false)
  })

  it('uses only known team abbreviations for real games', () => {
    // The All-Star Game fields custom squads (Team Coop / Team Spoon) that are not
    // franchises, so it carries homeName/awayName instead — everything else must
    // resolve to a real team.
    for (const g of GAMES) {
      if (g.seasonType === 'allstar') {
        expect(g.homeName, `${g.id} homeName`).toBeTruthy()
        expect(g.awayName, `${g.id} awayName`).toBeTruthy()
        continue
      }
      expect(known.has(g.home), `${g.id} home=${g.home}`).toBe(true)
      expect(known.has(g.away), `${g.id} away=${g.away}`).toBe(true)
    }
  })
})

describe("Sun's July 22 game — regression for the reported mismatch", () => {
  // A viewer saw "Sun v Fever" and expected "Sun v Mercury"; ESPN's live scoreboard
  // (and this committed row) confirm the Fever game is the real one. The Mercury
  // (PHX) played earlier that day. Pin it so a data refresh can't quietly flip it.
  const game = GAMES.find((g) => g.id === '401857090')

  it('is the Sun (CON) at the Fever (IND)', () => {
    expect(game).toBeDefined()
    expect(game.home).toBe('IND')
    expect(game.away).toBe('CON')
    expect(game.tip).toBe('2026-07-23T00:00:00.000Z')
  })

  it('is not a Sun–Mercury matchup', () => {
    const teams = [game.home, game.away]
    expect(teams).toContain('CON')
    expect(teams).not.toContain('PHX')
  })
})
