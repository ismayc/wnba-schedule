import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/schedule.js'
import { SEASON, TEAMS } from './data/teams.js'
import { detectTimezone, timezoneOptions, todayKey } from './utils/time.js'
import { applyLive, fetchLive, liveCount } from './services/espn.js'
import { useFollow } from './context/follow.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import StandingsView from './components/StandingsView.jsx'
import StatsView from './components/StatsView.jsx'
import TeamLogo from './components/TeamLogo.jsx'

const VIEWS = [
  { id: 'schedule', label: '📋 Schedule' },
  { id: 'standings', label: '📊 Regular Season' },
  { id: 'playoffs', label: '🏆 Playoffs' },
  { id: 'stats', label: '📈 Stats' },
]

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000

export default function App() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [view, setView] = useState('schedule')
  const [tz, setTz] = useState(detectTimezone)
  const [hideScores, setHideScores] = useState(false)
  const [team, setTeam] = useState('')
  const [onlyFollowed, setOnlyFollowed] = useState(false)
  const [live, setLive] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)

  const { count: followedCount, followed } = useFollow()

  // Committed schedule + live overlay. Everything downstream is derived from this.
  const games = useMemo(() => applyLive(GAMES, live), [live])
  const nLive = useMemo(() => liveCount(games), [games])

  // Poll faster while games are in progress, and not at all once the season is over.
  const seasonOver = useMemo(
    () => games.every((g) => g.score || g.postponed || g.canceled),
    [games]
  )

  const load = useCallback(async (signal) => {
    try {
      const next = await fetchLive({ signal })
      if (!signal?.aborted) {
        setLive(next)
        setUpdatedAt(new Date())
      }
    } catch {
      /* offline or feed hiccup — committed data still renders */
    }
  }, [])

  useEffect(() => {
    if (seasonOver) return
    const ctrl = new AbortController()
    load(ctrl.signal)
    const id = setInterval(() => load(ctrl.signal), nLive ? LIVE_REFRESH_MS : IDLE_REFRESH_MS)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [load, nLive, seasonOver])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem('wnba:theme', next)
    } catch {
      /* ignore */
    }
    setTheme(next)
  }

  // Filters apply to the schedule only; standings always reflect the whole season.
  const scheduleGames = useMemo(() => {
    return games.filter((g) => {
      if (team && g.home !== team && g.away !== team) return false
      if (onlyFollowed && followedCount && !followed.has(g.home) && !followed.has(g.away)) return false
      return true
    })
  }, [games, team, onlyFollowed, followed, followedCount])

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <h1>
            The WNBA Schedule <span className="season">{SEASON}</span>
          </h1>
          <p className="tagline">
            Every game in your timezone
            {nLive > 0 && (
              <span className="live-now">
                {' '}
                · <span className="dot" />
                {nLive} live now
              </span>
            )}
          </p>
        </div>
        <div className="top-actions">
          <label className="field">
            <span className="sr-only">Timezone</span>
            <select value={tz} onChange={(e) => setTz(e.target.value)}>
              {timezoneOptions(tz).map((z) => (
                <option key={z.id} value={z.id}>
                  {z.label}
                </option>
              ))}
            </select>
          </label>
          <button
            className={`ghost ${hideScores ? 'on' : ''}`}
            onClick={() => setHideScores((v) => !v)}
            title="Spoiler-free mode"
            aria-pressed={hideScores}
          >
            {hideScores ? '🙈' : '👁'}
          </button>
          <button className="ghost" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <nav className="views" aria-label="Views">
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`view-btn ${view === v.id ? 'on' : ''}`}
            onClick={() => setView(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {view === 'schedule' && (
        <div className="filters">
          <label className="field">
            <span className="sr-only">Team</span>
            <select value={team} onChange={(e) => setTeam(e.target.value)}>
              <option value="">All teams</option>
              {TEAMS.map((t) => (
                <option key={t.abbr} value={t.abbr}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </label>
          {followedCount > 0 && (
            <button
              className={`chip ${onlyFollowed ? 'on' : ''}`}
              onClick={() => setOnlyFollowed((v) => !v)}
              aria-pressed={onlyFollowed}
            >
              ★ My teams ({followedCount})
            </button>
          )}
          {team && (
            <button className="chip" onClick={() => setTeam('')}>
              <TeamLogo abbr={team} size={18} /> Clear
            </button>
          )}
        </div>
      )}

      <main>
        {view === 'schedule' && (
          <ScheduleView games={scheduleGames} tz={tz} hideScores={hideScores} />
        )}
        {view === 'standings' && <StandingsView games={games} onPick={(t) => (setTeam(t), setView('schedule'))} />}
        {view === 'playoffs' && (
          <section className="view">
            <p className="empty">Playoff bracket lands here once the field is set.</p>
          </section>
        )}
        {view === 'stats' && (
          <StatsView games={games} tz={tz} onPickTeam={(t) => (setTeam(t), setView('schedule'))} />
        )}
      </main>

      <footer className="foot">
        <span>
          Unofficial fan project · not affiliated with the WNBA. Data from ESPN&apos;s public
          feeds.
        </span>
        {updatedAt && (
          <span className="dim">
            Updated {updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </footer>
    </div>
  )
}
