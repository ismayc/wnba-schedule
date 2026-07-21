import { useMemo, useState } from 'react'
import { dayKey, todayKey, formatTime } from '../utils/time.js'
import { TEAM_BY_ABBR } from '../data/teams.js'
import { useFollow } from '../context/follow.jsx'
import TeamLogo from './TeamLogo.jsx'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Week keys are computed on a UTC noon anchor so DST transitions can't shift a day.
const anchor = (key) => new Date(`${key}T12:00:00Z`)

function startOfWeek(key) {
  const d = anchor(key)
  d.setUTCDate(d.getUTCDate() - d.getUTCDay())
  return d.toISOString().slice(0, 10)
}

const shiftDays = (key, n) => {
  const d = anchor(key)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const monthLabel = (key) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric' }).format(
    anchor(key)
  )

function Cell({ dayGames, tz, isToday, hideScores, onOpen }) {
  const { isFollowed } = useFollow()

  return (
    <div className={`wk-cell ${isToday ? 'is-today' : ''}`}>
      {dayGames.map((g) => {
        const done = g.score && !hideScores
        const [hs, as] = g.score || []
        const mine = isFollowed(g.home) || isFollowed(g.away)

        // The All-Star Game's captain-drafted sides have no logos, so it gets its own
        // compact treatment rather than the two-logo rows.
        if (g.seasonType === 'allstar') {
          return (
            <button
              key={g.id}
              className="wk-game wk-allstar"
              onClick={() => onOpen?.(g)}
              title="AT&T WNBA All-Star Game"
            >
              <span className="wk-allstar-tag">⭐ All-Star</span>
              <span className="wk-allstar-teams">
                {g.awayName || g.away} · {g.homeName || g.home}
              </span>
              {!g.score && <span className="wk-time">{formatTime(g.tip, tz)}</span>}
              {done && <span className="wk-pts">{as} – {hs}</span>}
            </button>
          )
        }

        return (
          <button
            key={g.id}
            className={`wk-game ${mine ? 'is-mine' : ''} ${g.live ? 'is-live' : ''}`}
            onClick={() => onOpen?.(g)}
            title={`${TEAM_BY_ABBR[g.away]?.displayName} at ${TEAM_BY_ABBR[g.home]?.displayName}`}
          >
            <span className="wk-row">
              <TeamLogo abbr={g.away} size={16} />
              <span className="wk-abbr">{g.away}</span>
              {done && <span className={`wk-pts ${as > hs ? 'won' : ''}`}>{as}</span>}
            </span>
            <span className="wk-row">
              <TeamLogo abbr={g.home} size={16} />
              <span className="wk-abbr">{g.home}</span>
              {done && <span className={`wk-pts ${hs > as ? 'won' : ''}`}>{hs}</span>}
            </span>
            {!g.score && <span className="wk-time">{formatTime(g.tip, tz)}</span>}
          </button>
        )
      })}
    </div>
  )
}

export default function WeekView({ games, tz, hideScores, onOpen }) {
  const today = todayKey(tz)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today))

  // Bucket once, then slice per week — cheaper than filtering the season on every nav.
  const byDay = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      const key = dayKey(g.tip, tz)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(g)
    }
    for (const list of map.values()) list.sort((a, b) => a.tip.localeCompare(b.tip))
    return map
  }, [games, tz])

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => shiftDays(weekStart, i)),
    [weekStart]
  )

  const weekGames = days.reduce((n, k) => n + (byDay.get(k)?.length || 0), 0)

  // The season's real bounds, so navigation can't wander into empty months.
  const [firstKey, lastKey] = useMemo(() => {
    const keys = [...byDay.keys()].sort()
    return [keys[0], keys[keys.length - 1]]
  }, [byDay])

  const canPrev = !firstKey || weekStart > startOfWeek(firstKey)
  const canNext = !lastKey || weekStart < startOfWeek(lastKey)

  return (
    <section className="view">
      <div className="view-head">
        <div>
          <h2>Week</h2>
          <p className="sub">
            {monthLabel(weekStart)} – {monthLabel(shiftDays(weekStart, 6))} ·{' '}
            {weekGames} game{weekGames === 1 ? '' : 's'}
          </p>
        </div>
        <div className="wk-nav">
          <button
            className="ghost"
            onClick={() => setWeekStart(shiftDays(weekStart, -7))}
            disabled={!canPrev}
            aria-label="Previous week"
          >
            ‹
          </button>
          <button className="chip" onClick={() => setWeekStart(startOfWeek(today))}>
            This week
          </button>
          <button
            className="ghost"
            onClick={() => setWeekStart(shiftDays(weekStart, 7))}
            disabled={!canNext}
            aria-label="Next week"
          >
            ›
          </button>
        </div>
      </div>

      <div className="wk">
        {days.map((key, i) => (
          <div className="wk-col" key={key}>
            <div className={`wk-head ${key === today ? 'is-today' : ''}`}>
              <span className="wk-dow">{DAYS[i]}</span>
              <span className="wk-date">{anchor(key).getUTCDate()}</span>
            </div>
            <Cell
              dayGames={byDay.get(key) || []}
              tz={tz}
              isToday={key === today}
              hideScores={hideScores}
              onOpen={onOpen}
            />
          </div>
        ))}
      </div>

      {weekGames === 0 && <p className="empty">No games this week.</p>}
    </section>
  )
}
