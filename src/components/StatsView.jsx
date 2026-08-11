import { Fragment, useMemo, useState } from 'react'
import {
  seasonTotals,
  teamScoring,
  leaderboard,
  teamLabel,
  LEADER_CATEGORIES,
} from '../utils/stats.js'
import { playoffRace, PLAYOFF_SPOTS } from '../utils/standings.js'
import { formatDate } from '../utils/time.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)
// Player rate stats carry two decimals. ESPN publishes them at full precision and the
// boards sort on the stored value, so a one-decimal display hid real separation and
// manufactured ties that then broke alphabetically.
const two = (n) => n.toFixed(2)

// ── 1. Season totals ─────────────────────────────────────────────────────────
// Single headline numbers, so these are stat tiles rather than a chart. The two
// tiles with a story behind them expand into the actual games.

export function Tile({ label, value, sub, onClick, open }) {
  const Cmp = onClick ? 'button' : 'div'
  return (
    <Cmp className={`tile ${onClick ? 'tile-btn' : ''} ${open ? 'open' : ''}`} onClick={onClick}>
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {sub && <span className="tile-sub">{sub}</span>}
      {onClick && <span className="tile-caret">{open ? '▾' : '▸'}</span>}
    </Cmp>
  )
}

// Each row opens that game's box score when the caller wants it — a drill-down that
// names games and then can't show you any of them is a dead end.
export function GameList({ games, tz, note, onOpen }) {
  const Row = onOpen ? 'button' : 'span'
  return (
    <ul className="drill">
      {games.map((g) => (
        <li key={g.id}>
          <Row className="drill-row" onClick={onOpen ? () => onOpen(g) : undefined}>
            <span className="drill-date">{formatDate(g.tip, tz)}</span>
            <TeamLogo abbr={g.away} size={18} />
            <span className="drill-score">
              {g.score[1]} – {g.score[0]}
            </span>
            <TeamLogo abbr={g.home} size={18} />
            <span className="drill-note">{note(g)}</span>
          </Row>
        </li>
      ))}
    </ul>
  )
}

function TotalsStrip({ games, tz, onOpen }) {
  const t = useMemo(() => seasonTotals(games), [games])
  const [open, setOpen] = useState(null)
  const toggle = (k) => setOpen((v) => (v === k ? null : k))

  return (
    <div className="card">
      <h3 className="card-title">Season so far</h3>
      <div className="tiles">
        <Tile label="Games played" value={t.played} sub={`${t.remaining} to go`} />
        <Tile label="Points scored" value={t.totalPoints.toLocaleString()} />
        <Tile label="Points per game" value={one(t.combinedPpg)} sub="both teams" />
        <Tile label="Home win rate" value={`${Math.round(t.homeWinPct * 100)}%`} sub={`${t.homeWins} of ${t.played}`} />
        <Tile
          label="Overtime games"
          value={t.otGames.length}
          onClick={() => toggle('ot')}
          open={open === 'ot'}
        />
        <Tile
          label="One-possession finishes"
          value={t.nailbiters.length}
          sub="within 3"
          onClick={() => toggle('close')}
          open={open === 'close'}
        />
      </div>

      {open === 'ot' && (
        <GameList games={t.otGames} tz={tz} onOpen={onOpen} note={(g) => (g.ot > 1 ? `${g.ot}OT` : 'OT')} />
      )}
      {open === 'close' && (
        <GameList
          games={[...t.nailbiters].sort((a, b) => a.margin - b.margin)}
          tz={tz}
          onOpen={onOpen}
          note={(g) => `by ${g.margin}`}
        />
      )}
    </div>
  )
}

// ── 2. League leaders ────────────────────────────────────────────────────────
// One category at a time = a single series, so no legend is needed; the heading
// names it. Bars are a sequential blue, with the value direct-labelled.

// Every team a player suited up for that season, oldest first — one badge each, so a
// midseason trade reads as the two clubs it was rather than as whoever holds her rights
// today. `gp` is null only when ESPN's per-team splits couldn't be resolved at fetch time.
function SeasonTeams({ teams, onPickTeam }) {
  return (
    <span className="lead-teams">
      {teams.map((t, i) => (
        <Fragment key={t.abbr}>
          {i > 0 && (
            <i className="lead-arrow" aria-hidden="true">
              →
            </i>
          )}
          <button onClick={() => onPickTeam?.(t.abbr)} title={teamLabel(t)}>
            <TeamLogo abbr={t.abbr} size={20} />
          </button>
        </Fragment>
      ))}
    </span>
  )
}

// `getRows(cat)` supplies the board for the chosen category: the live view computes it
// from the committed PLAYERS table, the History tab reads the season's stored board (which
// fetch-history built with this same leaderboard(), ties and qualifiers included).
// Both carry season-accurate `teams`, so archived boards badge their rows too — they did
// not before, because ESPN's per-athlete stats answer with the player's CURRENT club even
// when an older season is asked for, and only for players who later moved, which left a
// historical board mixing correct and anachronistic badges (2023's scoring leader Jewell
// Loyd read as an Ace, not a Storm).
export function Leaders({ getRows, onPickTeam, onPickPlayer }) {
  const [cat, setCat] = useState(LEADER_CATEGORIES[0])
  const rows = useMemo(() => getRows(cat), [getRows, cat])
  // rows is always non-empty with a positive top value for every committed category, so
  // this empty/zero guard can't fire.
  /* v8 ignore next */
  const max = rows[0]?.value || 1
  const isPct = cat.key.endsWith('Pct')
  // Double- and triple-doubles are whole-number counts; every other category is a per-game
  // average that reads as ".0" when whole, so the column stays decimal-aligned (21.0 under 21.1).
  const isCount = cat.key === 'doubleDouble' || cat.key === 'tripleDouble'

  return (
    <div className="card">
      <div className="card-head">
        <h3 className="card-title">League leaders — {cat.label}</h3>
        <div className="cats">
          {LEADER_CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`cat ${c.key === cat.key ? 'on' : ''}`}
              onClick={() => setCat(c)}
              aria-pressed={c.key === cat.key}
            >
              {c.short}
            </button>
          ))}
        </div>
      </div>

      <table className="leaders">
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="lead-rank">{p.rank}</td>
              <td className="lead-team">
                <SeasonTeams teams={p.teams} onPickTeam={onPickTeam} />
              </td>
              <td className="lead-name">
                <button className="lead-player" onClick={() => onPickPlayer?.(p)}>
                  {p.name}
                </button>
                <span className="lead-pos">{p.pos}</span>
              </td>
              <td className="lead-bar">
                <span className="bar" style={{ '--w': `${(p.value / max) * 100}%` }} />
              </td>
              <td className="lead-value">
                {isPct ? `${two(p.value)}%` : isCount ? p.value : two(p.value)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">
        Qualification follows the WNBA&apos;s published minimums for a full season — 20 games
        or the season total for a per-game average, 85 made field goals for FG%, 20 made
        threes for 3P% — each scaled to how much of the season has been played, so a board
        in June ranks who has actually been available rather than sitting empty. Ties share a
        rank; a traded player shows every team she played for, oldest first.
      </p>
    </div>
  )
}

// ── 3. Team scoring margin ───────────────────────────────────────────────────
// Net points per game is a polarity measure, so it gets the validated diverging
// pair (blue positive / red negative) around a neutral zero line.
//
// Deliberately labelled "points per game" and not "efficiency" or "rating":
// those are per-100-possessions measures, and the public feeds don't expose
// possession counts.

export function MarginChart({ rows, onPickTeam }) {
  const span = Math.max(...rows.map((r) => Math.abs(r.netPpg)), 1)

  return (
    <div className="card">
      <h3 className="card-title">Scoring margin — points per game</h3>
      <div className="margin" role="table" aria-label="Team scoring margin per game">
        {rows.map((r) => {
          const pos = r.netPpg >= 0
          // Each arm gets 40% of the track, leaving room for the direct label to sit
          // beyond the longest bar without colliding with the next column.
          const width = (Math.abs(r.netPpg) / span) * 40
          return (
            <div className="margin-row" key={r.abbr} role="row">
              <button className="margin-team" onClick={() => onPickTeam?.(r.abbr)} role="cell">
                <TeamLogo abbr={r.abbr} size={22} />
                <span>{r.team.name}</span>
              </button>
              {/* --w lives on the track so the bar AND its label can both read it. */}
              <div className="margin-track" role="cell" style={{ '--w': `${width}%` }}>
                <span className="margin-zero" />
                <span className={`margin-bar ${pos ? 'pos' : 'neg'}`} />
                <span className={`margin-label ${pos ? 'pos' : 'neg'}`}>
                  {pos ? '+' : '−'}
                  {one(Math.abs(r.netPpg))}
                </span>
              </div>
              <span className="margin-split" role="cell">
                <span title={`${one(r.ppg)} scored per game (rank ${r.offRank})`}>{one(r.ppg)}</span>
                <i>/</i>
                <span title={`${one(r.oppPpg)} allowed per game (rank ${r.defRank})`}>
                  {one(r.oppPpg)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <p className="fine">
        Bar length is net points per game; the right column is scored / allowed. Not
        possession-adjusted — the public feeds don&apos;t publish possession counts.
      </p>
    </div>
  )
}

// ── 4. Playoff race ──────────────────────────────────────────────────────────
// Status is carried by an icon + word, never by color alone.

const STATUS = {
  clinched: { icon: '✓', word: 'Clinched', cls: 'st-good' },
  eliminated: { icon: '✕', word: 'Eliminated', cls: 'st-out' },
  in: { icon: '●', word: 'In the field', cls: 'st-in' },
  chasing: { icon: '○', word: 'Chasing', cls: 'st-chase' },
}

function statusOf(row) {
  if (row.clinched) return STATUS.clinched
  if (row.eliminated) return STATUS.eliminated
  return row.inPlayoffs ? STATUS.in : STATUS.chasing
}

function PlayoffRace({ games, onPickTeam }) {
  const rows = useMemo(() => playoffRace(games), [games])
  const cut = rows[PLAYOFF_SPOTS - 1]

  return (
    <div className="card">
      <h3 className="card-title">Playoff race</h3>
      <p className="fine top">
        Top {PLAYOFF_SPOTS} by record make the postseason, regardless of conference.
        {cut && ` The cut sits at ${cut.w}–${cut.l} (${cut.team.name}).`}
      </p>
      <div className="table-scroll">
        <table className="standings race">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Team</th>
              <th className="num">W–L</th>
              <th className="num">Left</th>
              <th className="num" title="Wins needed to guarantee a spot">Magic</th>
              <th className="num hide-sm">GB cut</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const st = statusOf(r)
              return (
                <tr key={r.abbr} className={r.eliminated ? 'row-elim' : ''}>
                  <td className="num dim">{r.seed}</td>
                  <td>
                    <button className="team-btn" onClick={() => onPickTeam?.(r.abbr)}>
                      <TeamLogo abbr={r.abbr} size={22} />
                      <span className="team-nick">{r.team.name}</span>
                    </button>
                  </td>
                  <td className="num">
                    {r.w}–{r.l}
                  </td>
                  <td className="num dim">{r.remaining}</td>
                  <td className="num">{r.magic ?? <span className="dim">—</span>}</td>
                  <td className="num dim hide-sm">
                    {r.inPlayoffs ? '—' : one(Math.abs(r.gbCut))}
                  </td>
                  <td>
                    <span className={`status ${st.cls}`}>
                      <i aria-hidden="true">{st.icon}</i> {st.word}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Stable identity so the Leaders memo doesn't recompute on every parent render.
const liveLeaders = (cat) => leaderboard(cat.key, { limit: 10 })

export default function StatsView({ games, tz, onPickTeam, onPickPlayer, onOpen }) {
  return (
    <section className="view">
      <div className="view-head">
        <h2>Stats</h2>
      </div>
      <TotalsStrip games={games} tz={tz} onOpen={onOpen} />
      <Leaders getRows={liveLeaders} onPickTeam={onPickTeam} onPickPlayer={onPickPlayer} />
      <div className="grid-2">
        <MarginChart rows={teamScoring(games)} onPickTeam={onPickTeam} />
        <PlayoffRace games={games} onPickTeam={onPickTeam} />
      </div>
    </section>
  )
}
