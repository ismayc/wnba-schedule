import { useMemo, useRef, useEffect } from 'react'
import { dayKey, dayLabel, todayKey } from '../utils/time.js'
import GameCard from './GameCard.jsx'

// How many days back the default ("recent") view reaches — a week of results, so
// yesterday's finals are always one glance away without loading the whole season.
export const RECENT_LOOKBACK_DAYS = 7

export default function ScheduleView({ games, tz, hideScores, showPast = false, onOpen }) {
  const anchorRef = useRef(null)
  const today = todayKey(tz)

  // The oldest day the default view shows: today minus a week, as a YYYY-MM-DD key.
  // (UTC calendar math on the label handles month/year underflow; keys are compared
  // as strings, so the arithmetic just needs to land on the right date.)
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

  // Days are dropped whole rather than filtering individual games, so a game earlier
  // today still shows — "past" means a previous calendar day in the viewer's zone.
  // Default view = the last week of results through every upcoming game; "Full season"
  // (showPast) drops the cutoff and shows everything back to the opener.
  const days = useMemo(
    () => (showPast ? allDays : allDays.filter(([key]) => key >= cutoff)),
    [allDays, showPast, cutoff]
  )

  // Land the viewer at the results/upcoming boundary: the most recent past day shown
  // (yesterday, usually) sits at the top with today right below it — so recent scores
  // are visible immediately and today's slate follows, without a scroll through the
  // whole season. Fall back to today when there is no past day in view.
  const anchorKey = useMemo(() => {
    const past = days.filter(([key]) => key < today)
    return past.length ? past[past.length - 1][0] : today
  }, [days, today])

  useEffect(() => {
    anchorRef.current?.scrollIntoView({ block: 'start' })
  }, [showPast, anchorKey])

  if (!days.length) {
    return (
      <section className="view">
        <p className="empty">No games match those filters.</p>
      </section>
    )
  }

  return (
    <section className="view schedule">
      {days.map(([key, dayGames]) => (
        <div
          className={`day ${key === today ? 'is-today' : ''}`}
          key={key}
          ref={key === anchorKey ? anchorRef : null}
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
      ))}
    </section>
  )
}
