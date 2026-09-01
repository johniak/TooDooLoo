import { useEffect, useMemo, useState } from 'react'
import { Todo, TimelineBlock, weekBlocks, todayStr, dayLabel, fmtDur, WEEKDAYS } from '../../../shared/core'
import { weekDates, shortDate } from './Timeline'

const CHART_H = 190

type Props = { onOpenTodo: (id: string, date: string) => void }
type Range = 'week' | 'month'

const p = (n: number): string => String(n).padStart(2, '0')
const fmtHM = (min: number): string => `${Math.floor(min / 60)}:${p(Math.round(min) % 60)}`
const minOfDay = (min: number): string => `${p(Math.floor(min / 60))}:${p(Math.round(min) % 60)}`

function monthDates(offset: number): string[] {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const y = d.getFullYear()
  const m = d.getMonth()
  const days = new Date(y, m + 1, 0).getDate()
  return [...Array(days)].map((_, i) => todayStr(new Date(y, m, i + 1)))
}

export default function Reports({ onOpenTodo }: Props): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [range, setRange] = useState<Range>('week')
  const [offset, setOffset] = useState(0)
  const [taskFilter, setTaskFilter] = useState<string | null>(null)

  useEffect(() => {
    const load = (): void => {
      window.api.listAllTodos().then(setTodos)
    }
    load()
    return window.api.onDataChanged(load)
  }, [])

  const dates = range === 'week' ? weekDates(offset) : monthDates(offset)
  const allBlocks = useMemo(() => weekBlocks(todos, dates), [todos, range, offset])
  // raport per zadanie: filtr z legendy zawęża słupki, log i sumy
  const blocks = taskFilter ? allBlocks.filter((b) => b.todoId === taskFilter) : allBlocks

  const byDate = (date: string): TimelineBlock[] => blocks.filter((b) => b.date === date)
  const daySegments = (date: string): { todoId: string; text: string; color: string; min: number }[] => {
    const acc = new Map<string, { todoId: string; text: string; color: string; min: number }>()
    for (const b of byDate(date)) {
      const seg = acc.get(b.todoId) ?? { todoId: b.todoId, text: b.text, color: b.color, min: 0 }
      seg.min += b.endMin - b.startMin
      acc.set(b.todoId, seg)
    }
    return [...acc.values()].sort((a, b) => a.todoId.localeCompare(b.todoId)) // stały porządek stosu
  }
  const dayTotal = (date: string): number => byDate(date).reduce((a, b) => a + b.endMin - b.startMin, 0)
  const maxTotal = Math.max(...dates.map(dayTotal), 1)

  // legenda zawsze z pełnego zakresu — z niej wybiera się filtr
  const perTask = useMemo(() => {
    const acc = new Map<string, { todoId: string; text: string; color: string; min: number }>()
    for (const b of allBlocks) {
      const t = acc.get(b.todoId) ?? { todoId: b.todoId, text: b.text, color: b.color, min: 0 }
      t.min += b.endMin - b.startMin
      acc.set(b.todoId, t)
    }
    return [...acc.values()].sort((a, b) => b.min - a.min)
  }, [allBlocks])

  const totalMin = blocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
  const gridStep = maxTotal > 360 ? 240 : maxTotal > 120 ? 60 : 30 // minuty między liniami
  const logDays = [...dates].reverse().filter((d) => dayTotal(d) > 0)
  const today = todayStr()
  const isWeek = range === 'week'
  const rangeLabel = isWeek
    ? `${shortDate(dates[0])} – ${shortDate(dates[dates.length - 1])}`
    : new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(
        new Date(Number(dates[0].slice(0, 4)), Number(dates[0].slice(5, 7)) - 1, 15)
      )

  const switchRange = (r: Range): void => {
    setRange(r)
    setOffset(0)
  }

  return (
    <section className="reports" aria-label="Raport">
      <div className="tl-head">
        <div className="tl-nav">
          <button title="Wstecz" onClick={() => setOffset(offset - 1)}>‹</button>
          <button title={isWeek ? 'Bieżący tydzień' : 'Bieżący miesiąc'} onClick={() => setOffset(0)}>●</button>
          <button title="Dalej" onClick={() => setOffset(offset + 1)}>›</button>
        </div>
        <span className="tl-range">{rangeLabel}</span>
        <div className="rep-switch" role="radiogroup" aria-label="Zakres raportu">
          {(['week', 'month'] as Range[]).map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={range === r}
              className={range === r ? 'rep-switch-on' : ''}
              onClick={() => switchRange(r)}
            >
              {r === 'week' ? 'Tydzień' : 'Miesiąc'}
            </button>
          ))}
        </div>
        {totalMin >= 1 && <span className="tl-total">{fmtDur(totalMin * 60)}</span>}
      </div>

      {totalMin < 1 ? (
        <div className="empty">
          <span className="empty-ember" />
          <p>
            {taskFilter
              ? 'To zadanie nie ma sesji w tym zakresie.'
              : 'Pusty zakres. Odpal ▶ na todosie, a raport zacznie się rysować.'}
          </p>
          {taskFilter && (
            <button className="picker-option" onClick={() => setTaskFilter(null)}>
              ✕ Pokaż wszystkie zadania
            </button>
          )}
        </div>
      ) : (
        <div className="rep-grid">
          <div className="rep-main">
            <div className={`rep-chart ${isWeek ? '' : 'rep-chart-month'}`} style={{ height: CHART_H }}>
              {[...Array(Math.floor(maxTotal / gridStep))].map((_, i) => {
                const min = (i + 1) * gridStep
                return (
                  <div key={i} className="rep-gridline" style={{ bottom: (min / maxTotal) * CHART_H }}>
                    <span>{fmtHM(min)}</span>
                  </div>
                )
              })}
              {dates.map((date) => {
                const total = dayTotal(date)
                const [y, m, d] = date.split('-').map(Number)
                const weekday = new Date(y, m - 1, d).getDay()
                // w miesiącu etykiety tylko na poniedziałkach i 1., inaczej sieczka
                const label = isWeek ? `${WEEKDAYS[weekday]} ${shortDate(date)}` : weekday === 1 || d === 1 ? String(d) : ''
                return (
                  <div key={date} className={`rep-day ${date === today ? 'rep-day-today' : ''}`}>
                    {isWeek && total > 0 && <span className="rep-day-total">{fmtHM(total)}</span>}
                    <div
                      className="rep-bar"
                      title={total > 0 ? `${dayLabel(date)} — ${fmtDur(total * 60)}` : undefined}
                      style={{ height: Math.max((total / maxTotal) * CHART_H, total > 0 ? 3 : 0) }}
                    >
                      {daySegments(date).map((s) => (
                        <div
                          key={s.todoId}
                          className="rep-seg"
                          title={`${s.text} — ${fmtDur(s.min * 60)}`}
                          style={{ height: `${(s.min / total) * 100}%`, background: s.color }}
                        />
                      ))}
                    </div>
                    {label && <span className="rep-day-label">{label}</span>}
                  </div>
                )
              })}
            </div>

            <div className="rep-log">
              {logDays.map((date) => (
                <div key={date} className="rep-log-day">
                  <div className="rep-log-head">
                    <span>{dayLabel(date)}</span>
                    <span className="rep-log-total">{fmtHM(dayTotal(date))}</span>
                  </div>
                  {byDate(date)
                    .sort((a, b) => b.startMin - a.startMin)
                    .map((b, i) => (
                      <button key={i} className="rep-row" onClick={() => onOpenTodo(b.todoId, todos.find((t) => t.id === b.todoId)?.date ?? date)}>
                        <span className="rep-row-times">
                          {b.running ? <span className="tl-live-dot" /> : minOfDay(b.endMin)}
                          <br />
                          {minOfDay(b.startMin)}
                        </span>
                        <span className="rep-row-edge" style={{ background: b.color }} />
                        <span className="rep-row-text">{b.text}</span>
                        <span className="rep-row-dur">{fmtDur((b.endMin - b.startMin) * 60)}</span>
                      </button>
                    ))}
                </div>
              ))}
            </div>
          </div>

          <aside className="rep-tasks">
            <h3 className="settings-eyebrow">Zadania</h3>
            {perTask.map((t) => (
              <button
                key={t.todoId}
                className="rep-task"
                aria-pressed={taskFilter === t.todoId}
                title={taskFilter === t.todoId ? 'Pokaż wszystkie zadania' : 'Raport tylko dla tego zadania'}
                onClick={() => setTaskFilter(taskFilter === t.todoId ? null : t.todoId)}
              >
                <span className="rep-row-edge" style={{ background: t.color }} />
                <span className="rep-row-text">{t.text}</span>
                <span className="rep-row-dur">{fmtHM(t.min)}</span>
              </button>
            ))}
            {taskFilter && (
              <button className="rep-task rep-task-clear" onClick={() => setTaskFilter(null)}>
                ✕ Wszystkie zadania
              </button>
            )}
            <div className="rep-summary">
              <span>Razem</span>
              <span className="rep-summary-total">{fmtHM(totalMin)}</span>
            </div>
          </aside>
        </div>
      )}
    </section>
  )
}
