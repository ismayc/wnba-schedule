import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GAMES } from './data/schedule.js'
import { SEASON, TEAMS } from './data/teams.js'
import {
  detectTimezone,
  timezoneOptions,
  dayKey,
  todayKey,
  anyImminent,
  whenBucket,
} from './utils/time.js'
import { DEFAULTS, readState, writeState } from './utils/urlState.js'
import { parseQuery, matchesSearch } from './utils/search.js'
import { applyLive, fetchLive, liveCount } from './services/espn.js'
import { watchableServices } from './utils/watch.js'
import { useFollow } from './context/follow.jsx'
import { useServices } from './context/services.jsx'
import ScheduleView from './components/ScheduleView.jsx'
import NextGame from './components/NextGame.jsx'
import StandingsView from './components/StandingsView.jsx'
import StatsView from './components/StatsView.jsx'
import HistoryView from './components/HistoryView.jsx'
import { HISTORY } from './data/history.js'
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
  { id: 'history', label: '📜 History' },
]

const LIVE_REFRESH_MS = 30_000
const IDLE_REFRESH_MS = 120_000

// One-click examples that demonstrate the scoped-search syntax.
const SEARCH_EXAMPLES = ['team: Storm', 'city: Seattle', 'venue: Climate Pledge', 'tv: ION']

// Season phases (ESPN's seasonType), in play order, with chip labels. The schedule
// mixes these together; the phase chips let you narrow to one or more. Only phases
// that actually occur in the data get a chip, so a Playoffs chip appears on its own
// once those games are added.
const PHASE_ORDER = ['regular', 'playoffs', 'allstar', 'cup']
const PHASE_LABELS = {
  regular: 'Regular season',
  playoffs: '🏆 Playoffs',
  allstar: '⭐ All-Star',
  cup: '🏅 Cup',
}

// The "When" quick filter. Exclusive — a game is in exactly one of these at a time —
// so clicking the active chip clears it rather than stacking a second bucket.
const WHEN_FILTERS = [
  { id: 'live', label: '🔴 Live' },
  { id: 'upcoming', label: '⏱ Upcoming' },
  { id: 'final', label: '✓ Finished' },
]

export default function App() {
  // Read the shared link once, on mount.
  const detectedTz = useMemo(detectTimezone, [])
  const initial = useMemo(() => readState(), [])

  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'dark')
  const [view, setView] = useState(initial.view)
  const [tz, setTz] = useState(initial.tz || detectedTz)
  // Spoiler-free mode is on by default and remembered per-device like a followed team,
  // but a shared link's explicit ?hide= still wins on load so the sender's choice
  // carries over. Only a stored '0' turns it off — an absent key means "never chose",
  // which takes the default.
  const [hideScores, setHideScores] = useState(() => {
    if (initial.hideExplicit) return initial.hide
    try {
      return localStorage.getItem('wnba:spoilerFree') !== '0'
    } catch {
      return DEFAULTS.hide
    }
  })
  const [team, setTeam] = useState(initial.team)
  // Which archived season the History view is showing — in the URL so a link to a past
  // season is shareable, like the NBA and Premier League siblings.
  const [season, setSeason] = useState(initial.season)
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
  // Which season phases to show (empty = all). Component-local like search, for the same
  // reason — it stays out of the URL/localStorage and adds no persisted readState key.
  const [phases, setPhases] = useState([])
  const [when, setWhen] = useState('')
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
  // Which season the open team panel describes. null = the live one; a year
  // means it was opened from the History view and must show that season.
  const [panelYear, setPanelYear] = useState(null)
  const [playerModal, setPlayerModal] = useState(null)
  const [showCalendar, setShowCalendar] = useState(false)
  // Opening a team from anywhere in the live season; the History view uses the
  // variant below, which remembers which season the click came from.
  const pickTeam = (abbr) => (setPanelYear(null), setTeamPanel(abbr))
  const pickHistoryTeam = (abbr, year) => (setPanelYear(year), setTeamPanel(abbr))
  const prevGames = useRef(null)
  const filterBarRef = useRef(null)
  const viewsRef = useRef(null)
  // The in-flow tab nav has scrolled out of view (see the IntersectionObserver below).
  const [navAway, setNavAway] = useState(false)
  // The condensed strip's expanded tab set. Component-local like search — never persisted.
  const [stripOpen, setStripOpen] = useState(false)

  const { count: followedCount, followed } = useFollow()
  const { services, count: serviceCount } = useServices()

  // Committed schedule + live overlay. Everything downstream is derived from this.
  const games = useMemo(() => applyLive(GAMES, live), [live])
  const nLive = useMemo(() => liveCount(games), [games])
  // The archived season a History-opened panel describes, or null for the live one.
  const panelSeason = panelYear == null ? null : HISTORY.find((s) => s.year === panelYear)

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
    writeState(
      { view, tz, team, hide: hideScores, mine: onlyFollowed, past: showPast, season },
      detectedTz
    )
  }, [view, tz, team, hideScores, onlyFollowed, showPast, season, detectedTz])

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

  // The phase chips to offer — only the seasonTypes that actually occur, in play order.
  const availablePhases = useMemo(
    () => PHASE_ORDER.filter((p) => games.some((g) => g.seasonType === p)),
    [games]
  )
  const togglePhase = (p) =>
    setPhases((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))

  // Filters apply to the schedule only; standings always reflect the whole season.
  const scheduleGames = useMemo(() => {
    return games.filter((g) => {
      if (team && g.home !== team && g.away !== team) return false
      if (onlyFollowed && followedCount && !followed.has(g.home) && !followed.has(g.away)) return false
      // A no-op unless services are chosen — clearing them all shouldn't hide everything.
      if (watchOnly && serviceCount && watchableServices(g.broadcast, services).length === 0)
        return false
      // Empty = all phases; otherwise the game's phase must be one of the chosen chips.
      if (phases.length && !phases.includes(g.seasonType)) return false
      // Empty = any time; otherwise live/upcoming/finished as the card reads right now.
      if (when && whenBucket(g) !== when) return false
      if (!matchesSearch(g, parsedSearch)) return false
      return true
    })
  }, [games, team, onlyFollowed, followed, followedCount, watchOnly, services, serviceCount, phases, when, parsedSearch])

  // How many filters are actively narrowing the schedule — drives the toggle badge and
  // the auto-open. Mirrors exactly what scheduleGames applies (a followed/service toggle
  // only counts once there are teams/services for it to act on).
  const activeFilterCount = useMemo(() => {
    let n = 0
    if (search.trim()) n++
    if (team) n++
    if (onlyFollowed && followedCount) n++
    if (watchOnly && serviceCount) n++
    if (phases.length) n++
    if (when) n++
    return n
  }, [search, team, onlyFollowed, followedCount, watchOnly, serviceCount, phases, when])

  const clearAllFilters = () => {
    setSearch('')
    setTeam('')
    setOnlyFollowed(false)
    setWatchOnly(false)
    setPhases([])
    setWhen('')
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

  // Condensed view strip: once the in-flow tab nav scrolls out of view, a slim fixed
  // strip takes over so switching views never means scrolling back to the top — the
  // Schedule view's landing scroll starts the page mid-list, past the real nav. The
  // strip collapses again (and its expanded tab set closes) when the nav returns.
  useEffect(() => {
    if (typeof IntersectionObserver !== 'function') return
    const io = new IntersectionObserver(([entry]) => {
      const away = !entry.isIntersecting
      setNavAway(away)
      if (!away) setStripOpen(false)
    })
    io.observe(viewsRef.current)
    return () => io.disconnect()
  }, [])

  const pickView = (id) => {
    setView(id)
    setStripOpen(false)
  }

  return (
    <div className={`app${navAway ? ' nav-away' : ''}`}>
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

      <nav className="views" aria-label="Views" ref={viewsRef}>
        {VIEWS.map((v) => (
          <button
            key={v.id}
            className={`view-btn ${view === v.id ? 'on' : ''}`}
            onClick={() => pickView(v.id)}
            aria-current={view === v.id ? 'page' : undefined}
          >
            {v.label}
          </button>
        ))}
      </nav>

      {navAway && (
        <div className="view-strip">
          <div className="view-strip-inner">
            <button
              className="view-strip-toggle"
              onClick={() => setStripOpen((o) => !o)}
              aria-expanded={stripOpen}
              aria-controls="view-strip-tabs"
            >
              {VIEWS.find((v) => v.id === view).label}
              <span className="chev" aria-hidden="true">
                {stripOpen ? '▲' : '▼'}
              </span>
            </button>
            {stripOpen && (
              <nav id="view-strip-tabs" className="view-strip-tabs" aria-label="Views quick switch">
                {VIEWS.map((v) => (
                  <button
                    key={v.id}
                    className={`view-btn ${view === v.id ? 'on' : ''}`}
                    onClick={() => pickView(v.id)}
                    aria-current={view === v.id ? 'page' : undefined}
                  >
                    {v.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        </div>
      )}

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
                    : 'Also show earlier games, back to the opener'
                }
              >
                <span aria-hidden="true">{showPast ? '▾' : '▸'}</span> Earlier games
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
                <span className="hint-note">fields: team · city · venue · broadcast</span>
              </div>
              <div className="phase-chips">
                <span className="hint-label">Show:</span>
                {availablePhases.map((p) => (
                  <button
                    key={p}
                    className={`phase-chip${phases.includes(p) ? ' active' : ''}`}
                    onClick={() => togglePhase(p)}
                    aria-pressed={phases.includes(p)}
                  >
                    {PHASE_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="phase-chips when-chips">
                <span className="hint-label">When:</span>
                {WHEN_FILTERS.map((w) => (
                  <button
                    key={w.id}
                    className={`phase-chip${when === w.id ? ' active' : ''}`}
                    onClick={() => setWhen((cur) => (cur === w.id ? '' : w.id))}
                    aria-pressed={when === w.id}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <main>
        {view === 'schedule' && <NextGame games={scheduleGames} tz={tz} />}
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
        {view === 'standings' && <StandingsView games={games} onPick={pickTeam} />}
        {view === 'playoffs' && (
          <Bracket games={games} tz={tz} onPick={pickTeam} onOpen={setDetail} />
        )}
        {view === 'radial' && (
          <RadialBracket games={games} onPick={pickTeam} />
        )}
        {view === 'stats' && (
          <StatsView
            games={games}
            tz={tz}
            onPickTeam={pickTeam}
            onPickPlayer={setPlayerModal}
            onOpen={setDetail}
          />
        )}
        {view === 'history' && (
          <HistoryView
            season={season}
            onSeason={setSeason}
            tz={tz}
            onPick={pickHistoryTeam}
            onPickPlayer={setPlayerModal}
            onOpen={setDetail}
          />
        )}
      </main>

      <Toasts
        events={toasts}
        onOpen={(g) => setDetail(g)}
        onDismiss={(key) => setToasts((cur) => cur.filter((t) => t.key !== key))}
      />

      <TeamPanel
        abbr={teamPanel}
        season={panelSeason}
        games={games}
        tz={tz}
        hideScores={hideScores}
        onClose={() => (setTeamPanel(null), setPanelYear(null))}
        onSchedule={(t) => (setTeam(t), setView('schedule'))}
        onOpenGame={(g) => (setTeamPanel(null), setPanelYear(null), setDetail(g))}
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
