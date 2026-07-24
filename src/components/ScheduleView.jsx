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

  // Where a "Today" jump lands: today if it has games, else the NEXT game-day, else (the
  // whole season already past) the most recent game-day.
  const nowKey = useMemo(() => {
    const upcoming = allDays.find(([key]) => key >= today)
    return (upcoming || allDays[allDays.length - 1])?.[0] ?? null
  }, [allDays, today])
  const nowMonth = nowKey ? nowKey.slice(0, 7) : thisMonth

  // The month holding that landing day is the one open to start; the rest collapse the
  // season to a few rows.
  const [expanded, setExpanded] = useState(() => new Set([nowMonth]))
  const monthRefs = useRef({})
  const dayRefs = useRef({})
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
  // "Today" jump: open the month holding the landing day and scroll to that day itself
  // (today, or the next game-day when today is idle) — never just the month header.
  const jumpToToday = () => {
    setExpanded((prev) => new Set(prev).add(nowMonth))
    setPendingScroll(nowKey)
  }
  // "Top" jump: back to the very top of the page — where the settings toolbar lives, which
  // the landing scroll otherwise leaves above the fold.
  const jumpToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  // Landing scroll: recent view sits at the yesterday/today boundary; full-season lands on
  // the "now" day (today / next game-day), which its open month renders.
  useEffect(() => {
    const target = showPast ? dayRefs.current[nowKey] : anchorRef.current
    target?.scrollIntoView({ block: 'start' })
  }, [showPast, anchorKey, nowKey])

  // Jump-bar scroll: after a chip or "Today" expands its target, scroll it into view — a day
  // key resolves via dayRefs, a month key via monthRefs. Clearing pendingScroll re-runs
  // this, but the guard makes the second pass a no-op.
  useEffect(() => {
    if (pendingScroll == null) return
    const el = dayRefs.current[pendingScroll] || monthRefs.current[pendingScroll]
    el?.scrollIntoView({ block: 'start' })
    setPendingScroll(null)
  }, [pendingScroll])

  const renderDay = ([key, dayGames]) => (
    <div
      className={`day ${key === today ? 'is-today' : ''}`}
      key={key}
      ref={(el) => {
        dayRefs.current[key] = el
        if (key === anchorKey) anchorRef.current = el
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
        <button className="month-chip month-top" onClick={jumpToTop}>
          ↑ Top
        </button>
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
