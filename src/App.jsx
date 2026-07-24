import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/schedule.js'
import { SEASON, TEAMS } from './data/teams.js'
import { detectTimezone, timezoneOptions, dayKey, todayKey, anyImminent } from './utils/time.js'
import { readState, writeState } from './utils/urlState.js'
import { parseQuery, matchesSearch } from './utils/search.js'
import { applyLive, fetchLive, liveCount } from './services/espn.js'
import { watchableServices } from './utils/watch.js'
import { useFollow } from './context/follow.jsx'
import { useServices } from './context/services.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import StandingsView from './components/StandingsView.jsx'
import StatsView from './components/StatsView.jsx'
import Bracket from './components/Bracket.jsx'
import RadialBracket from './components/RadialBracket.jsx'
import GameDetail from './components/GameDetail.jsx'
import PlayerModal from './components/PlayerModal.jsx'
import WeekView from './components/WeekView.jsx'
import CalendarModal from './components/CalendarModal.jsx'
import Toasts from './components/Toasts.jsx'
import TeamPanel from './components/TeamPanel.jsx'
import ServicesModal from './components/ServicesModal.jsx'
import { detectEvents, eventKey } from './services/alerts.js'
import TeamLogo from './components/TeamLogo.jsx'

const VIEWS = [
  { id: 'schedule', label: '📋 Schedule' },
  { id: 'week', label: '📆 Week' },
  { id: 'standings', label: '📊 Regular Season' },
  { id: 'playoffs', label: '🏆 Playoffs' },
  { id: 'radial', label: '🎯 Radial' },
  { id: 'stats', label: '📈 Stats' },
]

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000

// One-click examples that demonstrate the scoped-search syntax.
const SEARCH_EXAMPLES = ['team: Storm', 'city: Seattle', 'venue: Climate Pledge', 'tv: ION']

export default function App() {
  // Read the shared link once, on mount.
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(), [])

  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [view, setView] = useState(initial.view)
  const [tz, setTz] = useState(initial.tz || detectedTz)
  // Spoiler-free mode is remembered per-device like a followed team, but a shared
  // link's explicit ?hide= still wins on load so the sender's choice carries over.
  const [hideScores, setHideScores] = useState(() => {
    if (initial.hideExplicit) return initial.hide
    try {
      return localStorage.getItem('wnba:spoilerFree') === '1'
    } catch {
      return false
    }
  })
  const [team, setTeam] = useState(initial.team)
  const [onlyFollowed, setOnlyFollowed] = useState(initial.mine)
  // Off by default (194 of this season's 332 games are already played, so opening on the
  // season opener in May would bury today under months of finals), but remembered
  // per-device once toggled — like spoiler-free mode. A shared ?past= still wins on load.
  const [showPast, setShowPast] = useState(() => {
    if (initial.pastExplicit) return initial.past
    try {
      return localStorage.getItem('wnba:showPast') === '1'
    } catch {
      return false
    }
  })
  // "Only games I can watch" — filters to games on the viewer's chosen services (see
  // the services context). Off by default, but remembered across visits in localStorage
  // like a followed team rather than living in the shareable URL.
  const [watchOnly, setWatchOnly] = useState(() => {
    try {
      return localStorage.getItem('wnba:watchOnly') === '1'
    } catch {
      return false
    }
  })
  const [showServices, setShowServices] = useState(false)
  // Free-text / scoped search over the schedule. Deliberately component-local — it is
  // never written to the URL or localStorage, so it can't add a persisted readState key
  // (which would break the family's deep-equal link tests).
  const [search, setSearch] = useState('')
  // The filter panel is collapsed by default, but opens on load if a shared link already
  // has a team or "my teams" applied, or the device remembers a watch-only filter — so an
  // active filter is never hidden behind a closed panel. (Search always starts empty.)
  const [filtersOpen, setFiltersOpen] = useState(
    () => Boolean(initial.team) || Boolean(initial.mine) || watchOnly
  )
  const [live, setLive] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  // A ?game= deep link opens straight onto that game's detail (see urlState.js).
  const [detail, setDetail] = useState(
    () => (initial.game && GAMES.find((g) => g.id === initial.game)) || null
  )
  const [alerts, setAlerts] = useState(() => {
    try {
      return localStorage.getItem('wnba:alerts') === '1'
    } catch {
      return false
    }
  })
  const [toasts, setToasts] = useState([])
  const [teamPanel, setTeamPanel] = useState(null)
  const [playerModal, setPlayerModal] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  const prevGames = useRef(null)
  const filterBarRef = useRef(null)

  const { count: followedCount, followed } = useFollow()
  const { services, count: serviceCount } = useServices()

  // Committed schedule + live overlay. Everything downstream is derived from this.
  const games = useMemo(() => applyLive(GAMES, live), [live])
  const nLive = useMemo(() => liveCount(games), [games])

  // Poll faster while games are in progress, and not at all once the season is over.
  const seasonOver = useMemo(
    () => games.every((g) => g.score || g.postponed || g.canceled),
    [games]
  )

  // Warm cadence: any game live, OR a game about to tip. Re-evaluated each poll (keyed
  // on updatedAt) so we're already refreshing every 30s by the time the ball goes up —
  // otherwise the idle 2-min cycle could hide a fresh tip-off for that long.
  const warm = useMemo(() => nLive > 0 || anyImminent(games), [games, nLive, updatedAt])

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
    const id = setInterval(() => load(ctrl.signal), warm ? LIVE_REFRESH_MS : IDLE_REFRESH_MS)
    return () => {
      ctrl.abort()
      clearInterval(id)
    }
  }, [load, warm, seasonOver])

  // Notable-moment detection, diffed against the previous poll. Runs regardless of
  // whether alerts are on, so toggling it on mid-game doesn't replay old moments as
  // if they just happened.
  useEffect(() => {
    const prev = prevGames.current
    prevGames.current = games
    if (!prev || !alerts) return

    const found = detectEvents(prev, games, {
      teams: onlyFollowed || followedCount ? followed : null,
    })
    if (!found.length) return

    setToasts((cur) => {
      const seen = new Set(cur.map((t) => t.key))
      const fresh = found.map((e) => ({ ...e, key: eventKey(e) })).filter((e) => !seen.has(e.key))
      // Newest first, and never more than a handful on screen at once.
      return [...fresh, ...cur].slice(0, 4)
    })
  }, [games, alerts, followed, followedCount, onlyFollowed])

  // Toasts retire on their own; a lingering stack would bury the page.
  useEffect(() => {
    if (!toasts.length) return
    const id = setTimeout(() => setToasts((cur) => cur.slice(0, -1)), 9000)
    return () => clearTimeout(id)
  }, [toasts])

  // Keep the URL in step with the view so any state is shareable.
  useEffect(() => {
    writeState({ view, tz, team, hide: hideScores, mine: onlyFollowed, past: showPast }, detectedTz)
  }, [view, tz, team, hideScores, onlyFollowed, showPast, detectedTz])

  // Remember spoiler-free mode per-device, like a followed team (theme and alerts persist
  // the same way). A shared ?hide= link still overrides this on load.
  useEffect(() => {
    try {
      localStorage.setItem('wnba:spoilerFree', hideScores ? '1' : '0')
    } catch {
      /* private mode — the preference just won't persist */
    }
  }, [hideScores])

  // Same for the "show past days" toggle — remembered per-device, ?past= still overrides.
  useEffect(() => {
    try {
      localStorage.setItem('wnba:showPast', showPast ? '1' : '0')
    } catch {
      /* private mode — the preference just won't persist */
    }
  }, [showPast])

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

  // Parse the search box once per keystroke, not once per game.
  const parsedSearch = useMemo(() => parseQuery(search), [search])

  // Filters apply to the schedule only; standings always reflect the whole season.
  const scheduleGames = useMemo(() => {
    return games.filter((g) => {
      if (team && g.home !== team && g.away !== team) return false
      if (onlyFollowed && followedCount && !followed.has(g.home) && !followed.has(g.away)) return false
      // A no-op unless services are chosen — clearing them all shouldn't hide everything.
      if (watchOnly && serviceCount && watchableServices(g.broadcast, services).length === 0)
        return false
      if (!matchesSearch(g, parsedSearch)) return false
      return true
    })
  }, [games, team, onlyFollowed, followed, followedCount, watchOnly, services, serviceCount, parsedSearch])

  // How many filters are actively narrowing the schedule — drives the toggle badge and
  // the auto-open. Mirrors exactly what scheduleGames applies (a followed/service toggle
  // only counts once there are teams/services for it to act on).
  const activeFilterCount = useMemo(() => {
    let n = 0
    if (search.trim()) n++
    if (team) n++
    if (onlyFollowed && followedCount) n++
    if (watchOnly && serviceCount) n++
    return n
  }, [search, team, onlyFollowed, followedCount, watchOnly, serviceCount])

  const clearAllFilters = () => {
    setSearch('')
    setTeam('')
    setOnlyFollowed(false)
    setWatchOnly(false)
    try {
      localStorage.setItem('wnba:watchOnly', '0')
    } catch {
      /* private mode — the preference just won't persist */
    }
  }

  const pastDayCount = useMemo(() => {
    const today = todayKey(tz)
    const keys = new Set()
    for (const g of scheduleGames) {
      const key = dayKey(g.tip, tz)
      if (key < today) keys.add(key)
    }
    return keys.size
  }, [scheduleGames, tz])

  // Publish the sticky filter bar's height as a CSS variable so ScheduleView's own
  // sticky .month-jump can pin directly beneath it instead of behind it. Re-measured
  // whenever the bar's height can change (panel open/close, view switch, the
  // full-season chip appearing) and on window resize (the bar wraps on narrow screens).
  useEffect(() => {
    const el = filterBarRef.current
    if (!el) return
    const publish = () =>
      document.documentElement.style.setProperty('--filter-bar-h', `${el.offsetHeight}px`)
    publish()
    window.addEventListener('resize', publish)
    return () => window.removeEventListener('resize', publish)
  }, [filtersOpen, activeFilterCount, view, pastDayCount, showPast, serviceCount, followedCount])

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
          <button
            className={`ghost ${alerts ? 'on' : ''}`}
            onClick={() => {
              const next = !alerts
              setAlerts(next)
              try {
                localStorage.setItem('wnba:alerts', next ? '1' : '0')
              } catch {
                /* ignore */
              }
            }}
            title={alerts ? 'Live alerts on' : 'Live alerts off'}
            aria-pressed={alerts}
          >
            {alerts ? '🔔' : '🔕'}
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

      {(view === 'schedule' || view === 'week') && (
        <div className="filter-bar" ref={filterBarRef}>
          <div className="filter-controls">
            <button
              className={`chip filter-toggle ${filtersOpen ? 'on' : ''}`}
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls="filters-panel"
            >
              ⚙ Filters
              {activeFilterCount > 0 && (
                <span className="filter-badge">{activeFilterCount}</span>
              )}
              <span className="chev" aria-hidden="true">
                {filtersOpen ? '▲' : '▼'}
              </span>
            </button>
            {activeFilterCount > 0 && (
              <button className="chip filter-clear" onClick={clearAllFilters}>
                Clear all
              </button>
            )}
            {view === 'schedule' && pastDayCount > 0 && (
              <button
                className={`chip ${showPast ? 'on' : ''}`}
                onClick={() => setShowPast((v) => !v)}
                aria-pressed={showPast}
                title={
                  showPast
                    ? 'Show just the last week of games'
                    : 'Show the full season back to the opener'
                }
              >
                <span aria-hidden="true">{showPast ? '▾' : '▸'}</span> Full season
                <span className="chip-count">{pastDayCount}</span>
              </button>
            )}
            <button
              className="chip"
              onClick={() => setShowCalendar(true)}
              title="Subscribe to or download a calendar of these games"
            >
              📅 Calendar
            </button>
          </div>

          {filtersOpen && (
            <div className="filters-panel" id="filters-panel">
              <div className="filters">
                <label className="field search-field">
                  <span className="sr-only">Search games</span>
                  <input
                    className="search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder='Search — try "team: Storm" or "city: Seattle"'
                  />
                </label>
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
                {serviceCount === 0 ? (
                  <button
                    className="chip"
                    onClick={() => setShowServices(true)}
                    title="Pick the streaming services and TV packages you have"
                  >
                    📺 Choose my services
                  </button>
                ) : (
                  <span className="chip-group">
                    <button
                      className={`chip ${watchOnly ? 'on' : ''}`}
                      onClick={() => {
                        const next = !watchOnly
                        setWatchOnly(next)
                        try {
                          localStorage.setItem('wnba:watchOnly', next ? '1' : '0')
                        } catch {
                          /* private mode — the filter just won't be remembered */
                        }
                      }}
                      aria-pressed={watchOnly}
                      title="Only show games on my services"
                    >
                      📺 On my services ({serviceCount})
                    </button>
                    <button
                      className="chip chip-icon"
                      onClick={() => setShowServices(true)}
                      aria-label="Edit my services"
                      title="Edit my services"
                    >
                      ⚙
                    </button>
                  </span>
                )}
                {team && (
                  <button className="chip" onClick={() => setTeam('')}>
                    <TeamLogo abbr={team} size={18} /> Clear
                  </button>
                )}
              </div>
              <div className="search-hints">
                <span className="hint-label">Try:</span>
                {SEARCH_EXAMPLES.map((ex) => (
                  <button key={ex} className="hint-chip" onClick={() => setSearch(ex)}>
                    {ex}
                  </button>
                ))}
                <span className="hint-note">fields: team · city · venue</span>
              </div>
            </div>
          )}
        </div>
      )}

      <main>
        {view === 'schedule' && (
          <ScheduleView
            games={scheduleGames}
            tz={tz}
            hideScores={hideScores}
            showPast={showPast}
            onOpen={setDetail}
          />
        )}
        {view === 'week' && (
          <WeekView games={scheduleGames} tz={tz} hideScores={hideScores} onOpen={setDetail} />
        )}
        {view === 'standings' && <StandingsView games={games} onPick={setTeamPanel} />}
        {view === 'playoffs' && (
          <Bracket games={games} tz={tz} onPick={setTeamPanel} />
        )}
        {view === 'radial' && (
          <RadialBracket games={games} onPick={setTeamPanel} />
        )}
        {view === 'stats' && (
          <StatsView games={games} tz={tz} onPickTeam={setTeamPanel} onPickPlayer={setPlayerModal} />
        )}
      </main>

      <Toasts
        events={toasts}
        onOpen={(g) => setDetail(g)}
        onDismiss={(key) => setToasts((cur) => cur.filter((t) => t.key !== key))}
      />

      <TeamPanel
        abbr={teamPanel}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => setTeamPanel(null)}
        onSchedule={(t) => (setTeam(t), setView('schedule'))}
        onOpenGame={(g) => (setTeamPanel(null), setDetail(g))}
      />

      <GameDetail
        game={detail}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => setDetail(null)}
        onPickTeam={(t) => (setTeam(t), setView('schedule'))}
      />

      <PlayerModal player={playerModal} tz={tz} onClose={() => setPlayerModal(null)} />

      {showCalendar && (
        <CalendarModal
          games={games}
          filtered={scheduleGames}
          onClose={() => setShowCalendar(false)}
        />
      )}

      {showServices && <ServicesModal onClose={() => setShowServices(false)} />}

      <footer className="foot">
        <p className="disclaimer">
          An unofficial fan-made project. Not affiliated with, endorsed by, or sponsored by the
          WNBA. Team names and logos are trademarks of their respective owners. Schedule,
          results, and player data via{' '}
          <a href="https://www.espn.com/wnba/" target="_blank" rel="noopener noreferrer">
            ESPN
          </a>
          .
        </p>
        <div className="foot-row">
          <p className="credit">
            Created by{' '}
            <a href="https://chester.rbind.io" target="_blank" rel="noopener noreferrer">
              Chester Ismay
            </a>{' '}
            ·{' '}
            <a
              href="https://github.com/ismayc/wnba-schedule"
              target="_blank"
              rel="noopener noreferrer"
            >
              View source on GitHub
            </a>
          </p>
          {updatedAt && (
            <span className="dim">
              Updated{' '}
              {updatedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </footer>
    </div>
  )
}
