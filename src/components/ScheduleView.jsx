import { useMemo, useRef, useEffect, useState } from 'react'
import { dayKey, dayLabel, todayKey } from '../utils/time.js'
import GameCard from './GameCard.jsx'

// How many days back the default ("recent") view reaches — a week of results, so
// yesterday's finals are always one glance away without loading the whole season.
export const RECENT_LOOKBACK_DAYS = 7

// Labels derived from the 'YYYY-MM' key itself (UTC so the month never shifts).
const monthLabel = (mk) =>
  new Date(`${mk}-01T12:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
const monthShort = (mk) =>
  new Date(`${mk}-01T12:00:00.000Z`).toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })

export default function ScheduleView({ games, tz, hideScores, showPast = false, onOpen }) {
  const today = todayKey(tz)
  const thisMonth = today.slice(0, 7)

  // The oldest day the default view shows: today minus a week, as a YYYY-MM-DD key.
  const cutoff = useMemo(() => {
    const [y, m, d] = today.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d - RECENT_LOOKBACK_DAYS)).toISOString().slice(0, 10)
  }, [today])

  // Bucket by the calendar day the viewer sees, not by UTC date.
  const allDays = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      const key = dayKey(g.tip, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [games, tz])

  // Default = the last week of results through every upcoming game; Full season shows
  // everything, grouped into collapsible months.
  const days = useMemo(() => {
    if (showPast) return allDays
    const recent = allDays.filter(([key]) => key >= cutoff)
    // Off-season: with the whole season in the past there's nothing in the last week and
    // nothing upcoming, so the recent window is empty. Fall back to the last ~week of
    // actual game-days rather than render a blank schedule on a finished season.
    return recent.length ? recent : allDays.slice(-RECENT_LOOKBACK_DAYS)
  }, [allDays, showPast, cutoff])

  // The results/upcoming boundary the view lands on: the most recent past day shown
  // (yesterday, usually) with today right below it. Falls back to today.
  const anchorRef = useRef(null)
  const anchorKey = useMemo(() => {
    const past = days.filter(([key]) => key < today)
    return past.length ? past[past.length - 1][0] : today
  }, [days, today])

  // Full-season grouping: [ [monthKey, [ [dayKey, games], ... ] ], ... ].
  const months = useMemo(() => {
    const map = new Map()
    for (const entry of allDays) {
      const mk = entry[0].slice(0, 7)
      if (!map.has(mk)) map.set(mk, [])
      map.get(mk).push(entry)
    }
    return [...map.entries()]
  }, [allDays])

  // Only the current month is open to start; the rest collapse the season to a few rows.
  const [expanded, setExpanded] = useState(() => new Set([thisMonth]))
  const monthRefs = useRef({})
  const todayRef = useRef(null)
  const [pendingScroll, setPendingScroll] = useState(null)

  const toggleMonth = (mk) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(mk)) next.delete(mk)
      else next.add(mk)
      return next
    })
  const jumpToMonth = (mk) => {
    setExpanded((prev) => new Set(prev).add(mk))
    setPendingScroll(mk)
  }
  // "Today" jump: open the current month and scroll to today itself (not the month head).
  const jumpToToday = () => {
    setExpanded((prev) => new Set(prev).add(thisMonth))
    setPendingScroll('today')
  }

  // Landing scroll: recent view sits at the yesterday/today boundary; full-season lands on
  // today within its (open) current month, falling back to the month header if today has
  // no games.
  useEffect(() => {
    const target = showPast
      ? todayRef.current || monthRefs.current[thisMonth]
      : anchorRef.current
    target?.scrollIntoView({ block: 'start' })
  }, [showPast, anchorKey, thisMonth])

  // Jump-bar scroll: after a chip (or "Today") expands its month, scroll the target into
  // view. Clearing pendingScroll re-runs this, but the guard makes the second pass a no-op.
  useEffect(() => {
    if (pendingScroll == null) return
    const el =
      pendingScroll === 'today'
        ? todayRef.current || monthRefs.current[thisMonth]
        : monthRefs.current[pendingScroll]
    el?.scrollIntoView({ block: 'start' })
    setPendingScroll(null)
  }, [pendingScroll])

  const renderDay = ([key, dayGames]) => (
    <div
      className={`day ${key === today ? 'is-today' : ''}`}
      key={key}
      ref={(el) => {
        if (key === anchorKey) anchorRef.current = el
        if (key === today) todayRef.current = el
      }}
    >
      <h3 className="day-head">
        <span>{dayLabel(key, tz)}</span>
        <span className="day-count">{dayGames.length} game{dayGames.length === 1 ? '' : 's'}</span>
      </h3>
      <div className="day-games">
        {dayGames.map((g) => (
          <GameCard key={g.id} game={g} tz={tz} hideScores={hideScores} onOpen={onOpen} />
        ))}
      </div>
    </div>
  )

  if (!days.length) {
    return (
      <section className="view">
        <p className="empty">No games match those filters.</p>
      </section>
    )
  }

  // Recent (default): a short flat list, no need for month machinery.
  if (!showPast) {
    return <section className="view schedule">{days.map(renderDay)}</section>
  }

  // Full season: a sticky month jump-bar over collapsible month sections.
  return (
    <section className="view schedule">
      <nav className="month-jump" aria-label="Jump to month">
        {months.map(([mk]) => (
          <button
            key={mk}
            className={`month-chip ${mk === thisMonth ? 'is-current' : ''}`}
            onClick={() => jumpToMonth(mk)}
          >
            {monthShort(mk)}
          </button>
        ))}
        <button className="month-chip month-today" onClick={jumpToToday}>
          Today
        </button>
      </nav>
      {months.map(([mk, monthDays]) => {
        const open = expanded.has(mk)
        const count = monthDays.reduce((n, [, gs]) => n + gs.length, 0)
        return (
          <div className="month" key={mk} ref={(el) => (monthRefs.current[mk] = el)}>
            <button
              className={`month-head ${open ? 'open' : ''}`}
              onClick={() => toggleMonth(mk)}
              aria-expanded={open}
            >
              <span aria-hidden="true">{open ? '▾' : '▸'}</span> <span>{monthLabel(mk)}</span>
              <span className="month-count">{count} game{count === 1 ? '' : 's'}</span>
            </button>
            {open && <div className="month-days">{monthDays.map(renderDay)}</div>}
          </div>
        )
      })}
    </section>
  )
}
