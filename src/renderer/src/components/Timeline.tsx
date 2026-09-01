import { useEffect, useMemo, useState } from 'react'
import { Todo, TimelineBlock, weekBlocks, taskColor, todayStr, fmtDur, WEEKDAYS } from '../../../shared/core'

const PX_PER_HOUR = 56

type Props = {
  workStart: string
  workEnd: string
  onOpenTodo: (id: string, date: string) => void
}

const hourOf = (t: string): number => Number(t.split(':')[0])

function weekDates(offset: number): string[] {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7) // poniedziałek tygodnia
  return [...Array(7)].map((_, i) => {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    return todayStr(day)
  })
}

const shortDate = (date: string): string => {
  const [, m, d] = date.split('-')
  return `${d}.${m}`
}

export default function Timeline({ workStart, workEnd, onOpenTodo }: Props): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [offset, setOffset] = useState(0)
  const [, setTick] = useState(0)

  useEffect(() => {
    const load = (): void => {
      window.api.listAllTodos().then(setTodos)
    }
    load()
    const i = setInterval(() => setTick((n) => n + 1), 60_000) // linia „teraz" i rosnący blok
    const unsub = window.api.onDataChanged(load)
    return () => {
      clearInterval(i)
      unsub()
    }
  }, [])

  const dates = weekDates(offset)
  const blocks = useMemo(() => weekBlocks(todos, dates), [todos, offset])
  const byDate = (date: string): TimelineBlock[] => blocks.filter((b) => b.date === date)

  // weekend tylko gdy ma sesje — jak w sidebarze
  const visible = dates.filter((d, i) => i < 5 || byDate(d).length > 0)

  // oś godzin: dzień pracy z marginesem, rozciągany przez sesje poza nim
  const startHour = Math.max(
    0,
    Math.min(hourOf(workStart) - 1, ...blocks.map((b) => Math.floor(b.startMin / 60)))
  )
  const endHour = Math.min(
    24,
    Math.max(hourOf(workEnd) + 2, ...blocks.map((b) => Math.ceil(b.endMin / 60)))
  )
  const colHeight = (endHour - startHour) * PX_PER_HOUR
  const toPx = (min: number): number => ((min - startHour * 60) / 60) * PX_PER_HOUR

  const totalSec = blocks.reduce((a, b) => a + (b.endMin - b.startMin) * 60, 0)
  const today = todayStr()
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <section className="timeline" aria-label="Oś czasu">
      <div className="tl-head">
        <div className="tl-nav">
          <button title="Poprzedni tydzień" onClick={() => setOffset(offset - 1)}>‹</button>
          <button title="Bieżący tydzień" onClick={() => setOffset(0)}>●</button>
          <button title="Następny tydzień" onClick={() => setOffset(offset + 1)}>›</button>
        </div>
        <span className="tl-range">
          {shortDate(dates[0])} – {shortDate(dates[6])}
        </span>
        {totalSec >= 60 && <span className="tl-total">{fmtDur(totalSec)}</span>}
      </div>
      <div className="tl-grid">
        <div className="tl-gutter" style={{ height: colHeight, marginTop: 28 }}>
          {[...Array(endHour - startHour + 1)].map((_, i) => (
            <span key={i} className="tl-hour" style={{ top: i * PX_PER_HOUR }}>
              {String(startHour + i).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {visible.map((date) => {
          const [y, m, d] = date.split('-').map(Number)
          const weekday = WEEKDAYS[new Date(y, m - 1, d).getDay()]
          return (
            <div key={date} className={`tl-col ${date === today ? 'tl-col-today' : ''}`}>
              <div className="tl-col-head">
                {weekday} {shortDate(date)}
              </div>
              <div
                className="tl-col-body"
                style={{ height: colHeight, backgroundSize: `100% ${PX_PER_HOUR}px` }}
              >
                {byDate(date).map((b, i) => {
                  const color = taskColor(b.todoId)
                  const h = toPx(b.endMin) - toPx(b.startMin)
                  return (
                    <button
                      key={i}
                      className={`tl-block ${b.running ? 'tl-block-running' : ''}`}
                      title={`${b.text} — ${fmtDur((b.endMin - b.startMin) * 60)}`}
                      style={{
                        top: toPx(b.startMin),
                        height: Math.max(h, 8),
                        left: `${(b.lane / b.lanes) * 100}%`,
                        width: `calc(${100 / b.lanes}% - 3px)`,
                        background: `${color}2E`,
                        borderLeftColor: color
                      }}
                      onClick={() => {
                        const t = todos.find((x) => x.id === b.todoId)
                        if (t) onOpenTodo(t.id, t.date)
                      }}
                    >
                      {h >= 24 && (
                        <span className="tl-block-label" style={{ color }}>
                          <span className="tl-block-text">{b.text}</span>
                          <span className="tl-block-dur">{fmtDur((b.endMin - b.startMin) * 60)}</span>
                        </span>
                      )}
                    </button>
                  )
                })}
                {date === today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                  <div className="tl-now" style={{ top: toPx(nowMin) }} />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
