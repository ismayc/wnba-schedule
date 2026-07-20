import { useMemo, useState } from 'react'
import { seasonTotals, teamScoring, leaderboard, LEADER_CATEGORIES } from '../utils/stats.js'
import { playoffRace, PLAYOFF_SPOTS } from '../utils/standings.js'
import { formatDate } from '../utils/time.js'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)

// ── 1. Season totals ─────────────────────────────────────────────────────────
// Single headline numbers, so these are stat tiles rather than a chart. The two
// tiles with a story behind them expand into the actual games.

function Tile({ label, value, sub, onClick, open }) {
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

function GameList({ games, tz, note }) {
  return (
    <ul className="drill">
      {games.map((g) => (
        <li key={g.id}>
          <span className="drill-date">{formatDate(g.tip, tz)}</span>
          <TeamLogo abbr={g.away} size={18} />
          <span className="drill-score">
            {g.score[1]} – {g.score[0]}
          </span>
          <TeamLogo abbr={g.home} size={18} />
          <span className="drill-note">{note(g)}</span>
        </li>
      ))}
    </ul>
  )
}

function TotalsStrip({ games, tz }) {
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
        <GameList games={t.otGames} tz={tz} note={(g) => (g.ot > 1 ? `${g.ot}OT` : 'OT')} />
      )}
      {open === 'close' && (
        <GameList
          games={[...t.nailbiters].sort((a, b) => a.margin - b.margin)}
          tz={tz}
          note={(g) => `by ${g.margin}`}
        />
      )}
    </div>
  )
}

// ── 2. League leaders ────────────────────────────────────────────────────────
// One category at a time = a single series, so no legend is needed; the heading
// names it. Bars are a sequential blue, with the value direct-labelled.

function Leaders({ onPickTeam }) {
  const [cat, setCat] = useState(LEADER_CATEGORIES[0])
  const rows = useMemo(() => leaderboard(cat.key, { limit: 10 }), [cat])
  const max = rows[0]?.value || 1
  const isPct = cat.key.endsWith('Pct')

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
                <button onClick={() => onPickTeam?.(p.team)} title={p.team}>
                  <TeamLogo abbr={p.team} size={20} />
                </button>
              </td>
              <td className="lead-name">
                {p.name}
                <span className="lead-pos">{p.pos}</span>
              </td>
              <td className="lead-bar">
                <span className="bar" style={{ '--w': `${(p.value / max) * 100}%` }} />
              </td>
              <td className="lead-value">
                {isPct ? `${one(p.value)}%` : p.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">
        Qualified players only, per ESPN&apos;s minimums. Ties share a rank.
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

function MarginChart({ games, onPickTeam }) {
  const rows = useMemo(() => teamScoring(games), [games])
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

export default function StatsView({ games, tz, onPickTeam }) {
  return (
    <section className="view">
      <div className="view-head">
        <h2>Stats</h2>
      </div>
      <TotalsStrip games={games} tz={tz} />
      <Leaders onPickTeam={onPickTeam} />
      <div className="grid-2">
        <MarginChart games={games} onPickTeam={onPickTeam} />
        <PlayoffRace games={games} onPickTeam={onPickTeam} />
      </div>
    </section>
  )
}
