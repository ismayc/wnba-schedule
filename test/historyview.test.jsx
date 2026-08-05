import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HistoryView from '../src/components/HistoryView.jsx'
import { FollowProvider } from '../src/context/follow.jsx'

const TZ = 'America/New_York'

afterEach(cleanup)

// The bracket inside a season renders team names, which read the follow context.
const mount = (props = {}) =>
  render(
    <FollowProvider>
      <HistoryView tz={TZ} {...props} />
    </FollowProvider>
  )

const mode = (name) => within(document.querySelector('.view-tools')).getByRole('button', { name })

describe('HistoryView — one season', () => {
  it('opens on the newest archived season', () => {
    const { container } = mount()
    expect(container.querySelector('.season-pick select')).toHaveValue('2025')
    expect(screen.getByText(/win the title/)).toHaveTextContent(/Las Vegas Aces/)
  })

  it('falls back to the newest season for a year it does not hold', () => {
    // 2021 ran the old single-elimination first rounds, so it is not archived.
    const { container } = mount({ season: 2021 })
    expect(container.querySelector('.season-pick select')).toHaveValue('2025')
  })

  it('shows the chosen season and reports a change back to the app', async () => {
    const onSeason = vi.fn()
    const { container } = mount({ season: 2023, onSeason })
    expect(container.querySelector('.season-pick select')).toHaveValue('2023')

    await userEvent.selectOptions(container.querySelector('.season-pick select'), '2022')
    expect(onSeason).toHaveBeenCalledWith(2022)
  })

  it('draws each season against its own series lengths', () => {
    // 2023: Las Vegas beat New York 3-1 in a best-of-5.
    const { container: y2023 } = mount({ season: 2023 })
    expect(y2023.querySelector('.hy-note')).toHaveTextContent(
      /best of 5 — Aces 3–1 Liberty/
    )
    expect(within(y2023.querySelector('.bx-col-final')).getByText('Best of 5')).toBeInTheDocument()

    cleanup()

    // 2025: Las Vegas swept Phoenix 4-0, which only a best-of-7 allows.
    const { container: y2025 } = mount({ season: 2025 })
    expect(y2025.querySelector('.hy-note')).toHaveTextContent(/best of 7 — Aces 4–0 Mercury/)
    expect(within(y2025.querySelector('.bx-col-final')).getByText('Best of 7')).toBeInTheDocument()
  })

  it('renders the full bracket and that season’s final table', () => {
    const { container } = mount({ season: 2023 })
    // Seven slots: four first-round, two semifinals, the Finals.
    expect(container.querySelectorAll('.bx-series')).toHaveLength(7)
    // 2023 had 12 teams, eight of them in the playoffs.
    expect(container.querySelectorAll('.standings tbody tr')).toHaveLength(12)
    expect(container.querySelectorAll('.standings tbody tr:not(.row-elim)')).toHaveLength(8)
    // Las Vegas topped the table at 34-6.
    const top = container.querySelectorAll('.standings tbody tr')[0]
    expect(top).toHaveTextContent('Aces')
    expect(top).toHaveTextContent('34')
  })

  it('shows the league growing: 13 teams in 2025, 12 in 2022', () => {
    const { container } = mount({ season: 2025 })
    expect(container.querySelectorAll('.standings tbody tr')).toHaveLength(13)
    cleanup()
    const { container: old } = mount({ season: 2022 })
    expect(old.querySelectorAll('.standings tbody tr')).toHaveLength(12)
  })

  it('routes a team click to the team panel and a dot to its box score', async () => {
    const onPick = vi.fn()
    const onOpen = vi.fn()
    const { container } = mount({ season: 2023, onPick, onOpen })

    await userEvent.click(container.querySelector('.standings .hy-team'))
    expect(onPick).toHaveBeenCalled()

    await userEvent.click(container.querySelector('.dots .dot'))
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ seasonType: 'playoffs', id: expect.any(String) })
    )
  })
})

describe('HistoryView — stats for one season', () => {
  const stats = async (season = 2023, props = {}) => {
    const utils = mount({ season, ...props })
    await userEvent.click(mode('Stats'))
    return utils
  }

  it('keeps the season picker, so stats follow the chosen year', async () => {
    const { container } = await stats(2022)
    expect(container.querySelector('.season-pick select')).toHaveValue('2022')
    // 2022 was a 36-game season for 12 teams: 216 games.
    expect(container.querySelector('.tile-value')).toHaveTextContent('216')
  })

  it('shows the season totals it can no longer derive from games', async () => {
    const { container } = await stats()
    const tiles = [...container.querySelectorAll('.tile')].map((t) => t.textContent)
    expect(tiles[0]).toMatch(/240Games playedregular season/)
    expect(tiles[3]).toMatch(/Home win rate/)
    expect(tiles[5]).toMatch(/One-possession finisheswithin 3/)
  })

  it('drills into the closest and highest-scoring games, each opening its box score', async () => {
    const onOpen = vi.fn()
    const { container } = await stats(2023, { onOpen })

    await userEvent.click(container.querySelectorAll('.tile-btn')[0])
    const closest = [...container.querySelectorAll('.drill-note')].map((n) => n.textContent)
    expect(closest).toHaveLength(5)
    for (const n of closest) expect(Number(n.replace('by ', ''))).toBeLessThanOrEqual(3)

    await userEvent.click(container.querySelector('button.drill-row'))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }))

    await userEvent.click(container.querySelectorAll('.tile-btn')[0])
    expect(container.querySelector('.drill')).toBeNull()
    await userEvent.click(container.querySelectorAll('.tile-btn')[1])
    const totals = [...container.querySelectorAll('.drill-note')].map((n) =>
      Number(n.textContent.replace(' total', ''))
    )
    expect(totals).toEqual([...totals].sort((a, b) => b - a))
  })

  it('renders a leaderboard for every category, ties and all', async () => {
    const { container } = await stats()
    expect(container.querySelectorAll('.cats .cat').length).toBeGreaterThanOrEqual(8)
    // 2023 scoring leader: Jewell Loyd at 24.7 a game.
    const first = container.querySelector('.leaders tr')
    expect(first).toHaveTextContent('Jewell Loyd')
    expect(first).toHaveTextContent('24.7')

    // A percentage category formats as a percentage.
    await userEvent.click([...container.querySelectorAll('.cat')].find((b) => b.textContent === 'FG%'))
    expect(container.querySelector('.leaders .lead-value').textContent).toMatch(/%$/)
  })

  it('opens a leader’s pop-out with that season’s stat line', async () => {
    const onPickPlayer = vi.fn()
    const { container } = await stats(2023, { onPickPlayer })
    await userEvent.click(container.querySelector('.lead-player'))
    expect(onPickPlayer).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Jewell Loyd', avgPoints: 24.7 })
    )
  })

  it('shows no team badge on an archived board, and says why', async () => {
    // ESPN reports a player's CURRENT club even for an old season, and only for players
    // who later moved: 2023's scoring leader Jewell Loyd was a Storm that year but reads
    // as an Ace in the feed, while Breanna Stewart's Liberty badge is correct. A board
    // that mixes the two silently is worse than one that shows neither.
    const { container } = await stats(2023)
    expect(container.querySelectorAll('.leaders .lead-team')).toHaveLength(0)
    expect(container.querySelector('.leaders')).toBeTruthy()
    expect(screen.getByText(/no team badge/)).toBeInTheDocument()
  })

  it('ranks the scoring margin from points for and against', async () => {
    const { container } = await stats()
    expect(container.querySelectorAll('.margin-row')).toHaveLength(12)
    // 2023 Las Vegas: much the best point differential in the league.
    expect(container.querySelector('.margin-row')).toHaveTextContent('Aces')
    const last = [...container.querySelectorAll('.margin-row')].at(-1)
    expect(last.querySelector('.margin-bar.neg')).toBeTruthy()
  })

  it('routes a margin-chart team click to the team panel', async () => {
    const onPick = vi.fn()
    const { container } = await stats(2023, { onPick })
    await userEvent.click(container.querySelector('.margin-team'))
    // The season travels with the team: the panel it opens has to describe THAT
    // season, not whichever one the live board happens to be on.
    expect(onPick).toHaveBeenCalledWith('LV', 2023)
  })
})

describe('HistoryView — champions', () => {
  it('lists every champion with its seed and the format it won under', async () => {
    const { container } = mount()
    await userEvent.click(mode('Champions'))

    const rows = [...container.querySelectorAll('.hy-table tbody tr')].map((r) =>
      [...r.cells].map((c) => c.textContent.trim())
    )
    expect(rows).toHaveLength(4)
    expect(rows[0]).toEqual(['2025', 'Aces', '2', 'Mercury', '4–0', '7', 'Lynx 34-10'])
    expect(rows[3]).toEqual(['2022', 'Aces', '1', 'Sun', '3–1', '5', 'Aces 26-10'])
  })

  it('says how many champions were the top seed rather than guessing', async () => {
    const { container } = mount()
    await userEvent.click(mode('Champions'))
    expect(container.querySelector('.fine')).toHaveTextContent(/\d+ of 4 champions/)
  })

  it('jumps back to a season, and opens a champion’s team panel', async () => {
    const onSeason = vi.fn()
    const onPick = vi.fn()
    const { container } = mount({ onSeason, onPick })
    await userEvent.click(mode('Champions'))

    await userEvent.click(container.querySelector('.hy-year'))
    expect(onSeason).toHaveBeenCalledWith(2025)

    await userEvent.click(container.querySelector('.hy-table .hy-team'))
    expect(onPick).toHaveBeenCalledWith('LV', 2025)
  })
})

describe('HistoryView — mode switching', () => {
  it('marks the active mode, swaps the panel, and hides the picker on all-seasons modes', async () => {
    mount()
    expect(mode('By season')).toHaveAttribute('aria-pressed', 'true')
    expect(document.querySelector('.season-pick')).toBeTruthy()

    await userEvent.click(mode('Champions'))
    expect(mode('Champions')).toHaveAttribute('aria-pressed', 'true')
    expect(mode('By season')).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelector('.season-pick')).toBeNull()
  })
})
