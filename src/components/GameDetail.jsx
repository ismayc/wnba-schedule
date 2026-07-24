import { useEffect, useMemo, useState } from 'react'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { formatDate, formatTime, formatZoneAbbr, liveState, countdown } from '../utils/time.js'
import { computeStandings, countsForStandings } from '../utils/standings.js'
import { playersByTeam } from '../utils/stats.js'
import { watchableServices, broadcastNotBadged } from '../utils/watch.js'
import { fetchGameSummary } from '../services/summary.js'
import { useServices } from '../context/services.jsx'
import { useModalA11y } from '../hooks/useModalA11y.js'
import { PlayerBox, TeamStatsSection, InjuryReport, WinProbSection } from './GameSummary.jsx'
import TeamLogo from './TeamLogo.jsx'

const one = (n) => n.toFixed(1)

// Season series between these two, so the detail answers "who's had the better of
// this matchup" without a trip to the schedule.
function useSeries(games, a, b) {
  return useMemo(() => {
    const met = games.filter(
      (g) => countsForStandings(g) && [g.home, g.away].includes(a) && [g.home, g.away].includes(b)
    )
    const wins = { [a]: 0, [b]: 0 }
    for (const g of met) {
      const winner = g.score[0] > g.score[1] ? g.home : g.away
      wins[winner]++
    }
    return { met, wins }
  }, [games, a, b])
}

// Basketball's answer to a goal timeline. Individual baskets are too numerous to
// enumerate (~65 a game), but the quarter breakdown carries the shape of the game —
// "won by 8" and "led by 20 and held on" look identical in a final score.
function LineScore({ game, hideScores }) {
  if (!game.line || hideScores) return null

  const { home, away } = game.line
  const periods = Math.max(home.length, away.length)
  if (!periods) return null

  const label = (i) => (i < 4 ? `Q${i + 1}` : periods - 4 > 1 ? `OT${i - 3}` : 'OT')
  const sum = (arr) => arr.reduce((a, b) => a + b, 0)

  const Row = ({ abbr, vals, total }) => (
    <tr>
      <th scope="row">
        <TeamLogo abbr={abbr} size={18} />
        <span>{abbr}</span>
      </th>
      {Array.from({ length: periods }, (_, i) => {
        const mine = vals[i]
        const theirs = (abbr === game.home ? away : home)[i]
        // Bolding the higher number per quarter turns the row into a momentum read.
        const won = mine != null && theirs != null && mine > theirs
        return (
          <td key={i} className={won ? 'q-won' : ''}>
            {mine ?? '–'}
          </td>
        )
      })}
      <td className="q-total">{total}</td>
    </tr>
  )

  return (
    <>
      <h4 className="md-sub">By quarter</h4>
      <div className="table-scroll">
        <table className="linescore">
          <thead>
            <tr>
              <th />
              {Array.from({ length: periods }, (_, i) => (
                <th key={i}>{label(i)}</th>
              ))}
              <th className="q-total">T</th>
            </tr>
          </thead>
          <tbody>
            <Row abbr={game.away} vals={away} total={sum(away)} />
            <Row abbr={game.home} vals={home} total={sum(home)} />
          </tbody>
        </table>
      </div>
    </>
  )
}

const CAT_LABEL = { points: 'PTS', rebounds: 'REB', assists: 'AST' }

// The per-game equivalent of "who scored" — aggregated leaders rather than an event
// list, for the same reason.
function GameLeaders({ game }) {
  if (!game.stars?.length) return null
  const byTeam = [game.away, game.home].map((abbr) => ({
    abbr,
    rows: game.stars.filter((s) => s.team === abbr),
  }))
  if (!byTeam.some((t) => t.rows.length)) return null

  return (
    <>
      <h4 className="md-sub">Game leaders</h4>
      <div className="leaders-split">
        {byTeam.map(({ abbr, rows }) => (
          <div key={abbr} className="gl-team">
            <div className="gl-head">
              <TeamLogo abbr={abbr} size={18} />
              <span>{abbr}</span>
            </div>
            {rows.map((s) => (
              <div className="gl-row" key={s.cat}>
                <span className="gl-cat">{CAT_LABEL[s.cat] || s.cat}</span>
                <span className="gl-who">{s.who}</span>
                <span className="gl-v">{s.v}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  )
}

function TaleRow({ label, left, right, betterLeft }) {
  return (
    <div className="tale-row">
      <span className={`tale-val ${betterLeft === true ? 'better' : ''}`}>{left}</span>
      <span className="tale-label">{label}</span>
      <span className={`tale-val ${betterLeft === false ? 'better' : ''}`}>{right}</span>
    </div>
  )
}

export default function GameDetail({ game, games, tz, hideScores, onClose, onPickTeam }) {
  const ref = useModalA11y(onClose, !!game)
  const { services } = useServices()
  const table = useMemo(() => computeStandings(games), [games])
  const series = useSeries(games, game?.away, game?.home)

  // One ESPN summary request per game, fanned out into the box score, team stats,
  // injuries, attendance/officials, and win-probability sections below.
  const [summary, setSummary] = useState({ status: 'loading', data: null })
  const gameId = game?.id
  useEffect(() => {
    if (!gameId) return
    const ctrl = new AbortController()
    setSummary({ status: 'loading', data: null })
    fetchGameSummary(gameId, { signal: ctrl.signal }).then((data) => {
      if (ctrl.signal.aborted) return
      setSummary({ status: 'ready', data })
    })
    return () => ctrl.abort()
  }, [gameId])

  // The detail groups into tabs so the modal isn't one long scroll. "Scoring" only
  // exists once a game has been played (before that there's no line score to show), and
  // the All-Star Game has no "Matchup" tab — its captain-drafted sides aren't in the
  // standings, so tale-of-the-tape and season series don't apply.
  const played = !!game?.score
  const isAllStar = game?.seasonType === 'allstar'
  const [tab, setTab] = useState('box')
  // A per-game score reveal for spoiler-free mode: shows THIS game's score inside the
  // popout without turning spoiler-free off everywhere else. Re-masks when another opens.
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    // Open a completed game (and any All-Star game) on its box score, else the matchup.
    setTab(played || isAllStar ? 'box' : 'matchup')
    setRevealed(false)
  }, [gameId, played, isAllStar])

  if (!game) return null

  const info = summary.data?.info
  const TABS = [
    { id: 'box', label: 'Box score' },
    ...(played ? [{ id: 'scoring', label: 'Scoring' }] : []),
    ...(isAllStar ? [] : [{ id: 'matchup', label: 'Matchup' }]),
  ]
  const activeTab = TABS.some((t) => t.id === tab) ? tab : TABS[0].id

  const watch = watchableServices(game.broadcast, services)
  const airedOn = broadcastNotBadged(game.broadcast, watch)

  const away = TEAM_BY_ABBR[game.away]
  const home = TEAM_BY_ABBR[game.home]
  const A = table[game.away]
  const H = table[game.home]
  const state = liveState(game)
  // In spoiler-free mode `hide` stays true until the viewer reveals THIS game's score.
  const hide = hideScores && !revealed
  const scored = game.score && !hide
  const [hs, as] = game.score || []

  const topScorer = (abbr) => playersByTeam(abbr)[0]

  return (
    <div className="modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Game detail" ref={ref} tabIndex={-1}>
        <button className="modal-x" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="md-head">
          <div className="md-side">
            {away ? <TeamLogo abbr={game.away} size={52} /> : <span className="md-allstar-mark">⭐</span>}
            <strong>{away?.displayName ?? game.awayName ?? game.away}</strong>
            {A && (
              <span className="dim">
                {A.w}–{A.l}
              </span>
            )}
          </div>
          <div className="md-center">
            {scored ? (
              <>
                <span className="md-score">
                  {as} – {hs}
                </span>
                <span className="md-state">
                  {state === 'live' ? game.statusLabel || 'Live' : `Final${game.ot ? (game.ot > 1 ? `/${game.ot}OT` : '/OT') : ''}`}
                </span>
              </>
            ) : (
              <>
                <span className="md-time">{formatTime(game.tip, tz)}</span>
                <span className="md-state">{formatZoneAbbr(game.tip, tz)}</span>
                {countdown(game.tip) && <span className="md-state">in {countdown(game.tip)}</span>}
              </>
            )}
            {game.score && hideScores && (
              <button
                className="md-reveal"
                onClick={() => setRevealed((v) => !v)}
                aria-pressed={revealed}
              >
                {revealed ? 'Hide score' : 'Reveal score'}
              </button>
            )}
          </div>
          <div className="md-side">
            {home ? <TeamLogo abbr={game.home} size={52} /> : <span className="md-allstar-mark">⭐</span>}
            <strong>{home?.displayName ?? game.homeName ?? game.home}</strong>
            {H && (
              <span className="dim">
                {H.w}–{H.l}
              </span>
            )}
          </div>
        </div>

        <dl className="md-facts">
          <div>
            <dt>Date</dt>
            <dd>{formatDate(game.tip, tz, { year: 'numeric' })}</dd>
          </div>
          {game.venue && (
            <div>
              <dt>Venue</dt>
              <dd>
                {game.venue}
                {game.city ? `, ${game.city}` : ''}
                {game.state ? `, ${game.state}` : ''}
              </dd>
            </div>
          )}
          {game.broadcast?.length && (
            <div>
              <dt>Watch</dt>
              <dd>
                {airedOn.join(' · ')}
                {watch.length > 0 && (
                  <span
                    className="watch"
                    aria-label={`Watch on ${watch.map((s) => s.label).join(', ')}`}
                  >
                    <span className="watch-tv" aria-hidden="true">
                      📺
                    </span>
                    {watch.map((s) => (
                      <span key={s.key} className="watch-chip">
                        {s.label}
                      </span>
                    ))}
                  </span>
                )}
              </dd>
            </div>
          )}
          {info?.attendance != null && (
            <div>
              <dt>Attendance</dt>
              <dd>{info.attendance.toLocaleString()}</dd>
            </div>
          )}
          {info?.officials?.length > 0 && (
            <div>
              <dt>Officials</dt>
              <dd>{info.officials.join(' · ')}</dd>
            </div>
          )}
          {game.note && (
            <div>
              <dt>Note</dt>
              <dd className="note">{game.note}</dd>
            </div>
          )}
        </dl>

        <div className="md-tabs" role="tablist" aria-label="Game detail sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              className={`md-tab ${activeTab === t.id ? 'on' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'box' && (
          <div className="md-panel" role="tabpanel">
            <PlayerBox summary={summary} game={game} hideScores={hide} />
            <TeamStatsSection summary={summary} game={game} hideScores={hide} />
            {/* The All-Star Game has no Matchup tab, so its injury report (the player a
                replacement stood in for) would otherwise have nowhere to show — surface
                it here, beside the lineups it relates to. */}
            {isAllStar && <InjuryReport summary={summary} game={game} />}
          </div>
        )}

        {activeTab === 'scoring' && (
          <div className="md-panel" role="tabpanel">
            <LineScore game={game} hideScores={hide} />
            <GameLeaders game={game} />
            <WinProbSection summary={summary} game={game} hideScores={hide} />
          </div>
        )}

        {activeTab === 'matchup' && (
          <div className="md-panel" role="tabpanel">
            <h4 className="md-sub">Tale of the tape</h4>
            <div className="tale">
              <TaleRow
                label="Record"
                left={`${A.w}–${A.l}`}
                right={`${H.w}–${H.l}`}
                betterLeft={A.pct === H.pct ? null : A.pct > H.pct}
              />
              <TaleRow
                label="Points per game"
                left={one(A.ppg)}
                right={one(H.ppg)}
                betterLeft={A.ppg === H.ppg ? null : A.ppg > H.ppg}
              />
              <TaleRow
                label="Allowed per game"
                left={one(A.oppPpg)}
                right={one(H.oppPpg)}
                betterLeft={A.oppPpg === H.oppPpg ? null : A.oppPpg < H.oppPpg}
              />
              <TaleRow
                label="Last 10"
                left={`${A.last10.filter(Boolean).length}–${A.last10.filter((x) => !x).length}`}
                right={`${H.last10.filter(Boolean).length}–${H.last10.filter((x) => !x).length}`}
              />
              {topScorer(game.away) && topScorer(game.home) && (
                <TaleRow
                  label="Leading scorer"
                  left={`${topScorer(game.away).short} ${topScorer(game.away).avgPoints}`}
                  right={`${topScorer(game.home).short} ${topScorer(game.home).avgPoints}`}
                />
              )}
            </div>

            {series.met.length > 0 && (
              <>
                <h4 className="md-sub">
                  Season series — {series.wins[game.away]}–{series.wins[game.home]}
                </h4>
                <ul className="drill">
                  {series.met.map((g) => (
                    <li key={g.id}>
                      <span className="drill-date">{formatDate(g.tip, tz)}</span>
                      <span className="dim">{g.away} @ {g.home}</span>
                      <span className="drill-score">
                        {hide ? '—' : `${g.score[1]} – ${g.score[0]}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            <InjuryReport summary={summary} game={game} />
          </div>
        )}

        {/* The All-Star sides aren't franchises, so "their schedule" doesn't exist. */}
        {!isAllStar && (
          <div className="md-actions">
            <button className="chip" onClick={() => (onPickTeam?.(game.away), onClose())}>
              <TeamLogo abbr={game.away} size={16} /> {away?.name} schedule
            </button>
            <button className="chip" onClick={() => (onPickTeam?.(game.home), onClose())}>
              <TeamLogo abbr={game.home} size={16} /> {home?.name} schedule
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
