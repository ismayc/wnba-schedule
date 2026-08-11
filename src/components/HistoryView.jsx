import { useMemo, useState } from 'react'
import { HISTORY, HISTORY_BY_YEAR, HISTORY_YEARS } from '../data/history.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { finalsSummary } from '../utils/history.js'
import { seasonScoring } from '../utils/stats.js'
import { BracketBody } from './Bracket.jsx'
import { Tile, GameList, Leaders, MarginChart } from './StatsView.jsx'
import TeamLogo from './TeamLogo.jsx'

/**
 * Completed seasons, back to 2022.
 *
 * The floor is where the playoffs became series all the way down: a best-of-3 first
 * round, then best-of-5 semifinals and Finals. Through 2021 the first two rounds were
 * single-elimination games with double byes for the top two seeds — a different bracket
 * shape entirely, and one this app doesn't draw.
 *
 * Series lengths are per season and travel WITH the season, because the Finals grew from
 * best-of-5 to best-of-7 in 2025. Rendering a 2023 bracket against 2025's rules would
 * show a 3-1 Finals win as an unfinished series.
 *
 * Each season commits its final standings, its playoff games, its totals and its leader
 * boards. The bracket is rebuilt from those games at runtime by the same buildBracket()
 * the live season uses, so an archived bracket cannot drift from the live one.
 */

const MODES = [
  { key: 'season', label: 'By season' },
  { key: 'stats', label: 'Stats' },
  { key: 'champions', label: 'Champions' },
]

// The two modes that show ONE season, and so want the season picker above them.
const SEASON_SCOPED = new Set(['season', 'stats'])

const teamName = (abbr) => TEAM_BY_ABBR[abbr].name

const pct = (n) => n.toFixed(3).replace(/^0/, '')
const gbText = (n) => (n === 0 ? '—' : String(n))
const signed = (n) => (n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1))
const record = ([w, l]) => `${w}-${l}`

function TeamChip({ abbr, size = 22, onPick, year }) {
  return (
    <button className="hy-team" onClick={() => onPick?.(abbr, year)}>
      <TeamLogo abbr={abbr} size={size} />
      <span>{teamName(abbr)}</span>
    </button>
  )
}

/* ── One season's final table ──────────────────────────────────────────── */

// The WNBA seeds league-wide rather than by conference, so a season is ONE table — and
// the row count changes with the league: 12 teams through 2024, 13 once Golden State
// joined in 2025.
function StandingsTable({ season, onPick, year }) {
  return (
    <div className="card">
      <h3 className="card-title">
        {season.label} final standings
        <span className="dim"> · {season.standings.length} teams</span>
      </h3>
      <div className="table-scroll">
        <table className="standings">
          <thead>
            <tr>
              <th className="col-rank">#</th>
              <th className="col-team">Team</th>
              <th className="num">W</th>
              <th className="num">L</th>
              <th className="num">PCT</th>
              <th className="num">GB</th>
              <th className="num hide-sm">Home</th>
              <th className="num hide-sm">Road</th>
              <th className="num hide-sm">Net</th>
            </tr>
          </thead>
          <tbody>
            {season.standings.map((r) => (
              <tr key={r.abbr} className={r.inPlayoffs ? '' : 'row-elim'}>
                <td className="col-rank">
                  <span className="rank">{r.seed}</span>
                </td>
                <td className="col-team">
                  <TeamChip abbr={r.abbr} size={26} onPick={onPick} year={year} />
                </td>
                <td className="num">{r.w}</td>
                <td className="num">{r.l}</td>
                <td className="num">{pct(r.pct)}</td>
                <td className="num dim">{gbText(r.gb)}</td>
                <td className="num hide-sm">{record(r.home)}</td>
                <td className="num hide-sm">{record(r.road)}</td>
                <td className={`num hide-sm ${r.netPpg > 0 ? 'pos' : 'neg'}`}>
                  {signed(r.netPpg)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ── One season ────────────────────────────────────────────────────────── */

// One archived season: the bracket (which carries its own champion banner) and the final
// table it was seeded from.
function Season({ season, tz, onPick, onOpen }) {
  // The bracket reports a team by abbreviation alone; stamp this season onto it
  // so the panel it opens describes the right year.
  const pick = (abbr) => onPick?.(abbr, season.year)
  const finals = useMemo(() => finalsSummary(season), [season])

  return (
    <>
      <p className="sub hy-note">
        Finals: <strong>best of {season.lengths.Final}</strong> — {teamName(finals.winner)}{' '}
        {finals.wins[0]}–{finals.wins[1]} {teamName(finals.loser)}. First round best of{' '}
        {season.lengths.R1}, semifinals best of {season.lengths.SF}.
      </p>

      <BracketBody
        games={season.games}
        seeds={season.standings}
        lengths={season.lengths}
        tz={tz}
        onPick={pick}
        onOpen={onOpen}
      />

      <StandingsTable season={season} onPick={onPick} year={season.year} />
    </>
  )
}

/* ── One season's statistics ───────────────────────────────────────────── */

// The live Stats view's cards, driven by an archived season instead of a game list: the
// totals it derived from ~200 games are committed as numbers, the leaderboards were built
// by the same leaderboard() at fetch time, and the margin chart re-derives from points
// for/against in the standings.
//
// The live view's playoff-race card has no historical meaning — magic numbers for a
// season that ended years ago — so a finished season shows its notable games instead.
function SeasonStats({ season, tz, onPickTeam, onPickPlayer, onOpen }) {
  // Leaderboards and the margin chart report a team by abbreviation alone; stamp
  // this season onto it so the panel they open describes the right year.
  const pickTeam = (abbr) => onPickTeam?.(abbr, season.year)
  const t = season.totals
  const [open, setOpen] = useState(null)
  const toggle = (k) => setOpen((v) => (v === k ? null : k))

  const rows = useMemo(() => seasonScoring(season.standings, TEAM_BY_ABBR), [season])
  // Rejoin each board row to that season's player table, so a row reaching the leaders
  // card or the player pop-out carries the same full stat line a live row does.
  const getRows = useMemo(
    () => (cat) =>
      season.leaders[cat.key].map((r) => ({ ...season.players[r.id], rank: r.rank, value: r.value })),
    [season]
  )

  const margin = (g) => Math.abs(g.score[0] - g.score[1])

  return (
    <>
      <div className="card">
        <h3 className="card-title">{season.label} in numbers</h3>
        <div className="tiles">
          <Tile label="Games played" value={t.played} sub="regular season" />
          <Tile label="Points scored" value={t.points.toLocaleString()} />
          <Tile label="Points per game" value={t.combinedPpg.toFixed(1)} sub="both teams" />
          <Tile
            label="Home win rate"
            value={`${Math.round((t.homeWins / t.played) * 100)}%`}
            sub={`${t.homeWins} of ${t.played}`}
          />
          <Tile label="Overtime games" value={t.ot} />
          <Tile label="One-possession finishes" value={t.nailbiters} sub="within 3" />
          <Tile label="Blowouts" value={t.blowouts} sub="by 20 or more" />
          <Tile
            label="Closest games"
            value={t.closest.length}
            onClick={() => toggle('closest')}
            open={open === 'closest'}
          />
          <Tile
            label="Highest scoring"
            value={t.highest.length}
            onClick={() => toggle('highest')}
            open={open === 'highest'}
          />
        </div>
        {open === 'closest' && (
          <GameList games={t.closest} tz={tz} onOpen={onOpen} note={(g) => `by ${margin(g)}`} />
        )}
        {open === 'highest' && (
          <GameList
            games={t.highest}
            tz={tz}
            onOpen={onOpen}
            note={(g) => `${g.score[0] + g.score[1]} total`}
          />
        )}
        <p className="fine">
          Totals cover the regular season. The five closest and five highest-scoring games
          are the only regular-season games kept — each still opens its box score.
        </p>
      </div>

      <Leaders getRows={getRows} onPickTeam={pickTeam} onPickPlayer={onPickPlayer} />

      <MarginChart rows={rows} onPickTeam={pickTeam} />
    </>
  )
}

/* ── Champions, all seasons ────────────────────────────────────────────── */

function Champions({ seasons, onPick, onSeason }) {
  const rows = useMemo(
    () =>
      seasons.map((s) => ({
        season: s,
        finals: finalsSummary(s),
        best: s.standings[0],
        champSeed: s.standings.find((r) => r.abbr === s.champion)?.seed,
      })),
    [seasons]
  )

  return (
    <div className="card">
      <h3 className="card-title">Champions</h3>
      <div className="table-scroll">
        <table className="standings hy-table">
          <thead>
            <tr>
              <th>Season</th>
              <th className="col-team">Champion</th>
              <th className="num">Seed</th>
              <th className="col-team">Runner-up</th>
              <th className="num">Finals</th>
              <th className="num hide-sm">Best of</th>
              <th className="col-team hide-sm">Best record</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ season, finals, best, champSeed }) => (
              <tr key={season.year}>
                <td>
                  <button className="hy-year" onClick={() => onSeason?.(season.year)}>
                    {season.label}
                  </button>
                </td>
                <td className="col-team">
                  <TeamChip abbr={finals.winner} onPick={onPick} year={season.year} />
                </td>
                <td className="num">{champSeed}</td>
                <td className="col-team">
                  <TeamChip abbr={finals.loser} onPick={onPick} year={season.year} />
                </td>
                <td className="num">
                  {finals.wins[0]}–{finals.wins[1]}
                </td>
                <td className="num dim hide-sm">{season.lengths.Final}</td>
                <td className="col-team hide-sm">
                  <TeamChip abbr={best.abbr} onPick={onPick} year={season.year} />
                  <span className="dim">
                    {' '}
                    {best.w}-{best.l}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="fine">
        The Finals ran best-of-5 through 2024 and best-of-7 from 2025, so the series column
        isn&apos;t comparable across the whole table — each season is drawn against its own
        format. {rows.filter((r) => r.champSeed === 1).length} of {rows.length} champions
        here went in as the top seed.
      </p>
    </div>
  )
}

export default function HistoryView({
  season,
  onSeason,
  tz,
  onPick,
  onOpen,
  onPickPlayer,
  seasons = HISTORY,
}) {
  const [mode, setMode] = useState('season')
  // An unknown ?season= (a stale link, or one pointing at the current season) falls back
  // to the most recent archived year rather than rendering nothing.
  const year = HISTORY_BY_YEAR[season] ? season : HISTORY_YEARS[0]
  const data = HISTORY_BY_YEAR[year]

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>History</h2>
          <p className="sub">
            Every completed season since <strong>2022</strong> — the year the playoffs
            became series in every round, which is what makes these seasons directly
            comparable with this one. Each carries its final standings, its full bracket
            drawn to that season&apos;s own series lengths, and a season of statistics.
          </p>
        </div>
        <div className="view-tools" role="group" aria-label="History mode">
          {MODES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`chip ${mode === m.key ? 'on' : ''}`}
              onClick={() => setMode(m.key)}
              aria-pressed={mode === m.key}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {SEASON_SCOPED.has(mode) && (
        <div className="hy-pick">
          <label className="season-pick">
            <span className="sr-only">Season</span>
            <select value={year} onChange={(e) => onSeason?.(Number(e.target.value))}>
              {HISTORY_YEARS.map((y) => (
                <option key={y} value={y}>
                  {HISTORY_BY_YEAR[y].label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {mode === 'season' && <Season season={data} tz={tz} onPick={onPick} onOpen={onOpen} />}

      {mode === 'stats' && (
        <SeasonStats
          season={data}
          tz={tz}
          onPickTeam={onPick}
          onPickPlayer={onPickPlayer}
          onOpen={onOpen}
        />
      )}

      {mode === 'champions' && (
        <Champions seasons={seasons} onPick={onPick} onSeason={onSeason} />
      )}
    </section>
  )
}
