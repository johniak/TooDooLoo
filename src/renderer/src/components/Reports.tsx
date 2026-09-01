import { useEffect, useMemo, useState } from 'react'
import { Todo, TimelineBlock, weekBlocks, todayStr, dayLabel, fmtDur, WEEKDAYS } from '../../../shared/core'
import { weekDates, shortDate } from './Timeline'

const CHART_H = 190

type Props = { onOpenTodo: (id: string, date: string) => void }

const p = (n: number): string => String(n).padStart(2, '0')
const fmtHM = (min: number): string => `${Math.floor(min / 60)}:${p(Math.round(min) % 60)}`
const minOfDay = (min: number): string => `${p(Math.floor(min / 60))}:${p(Math.round(min) % 60)}`

export default function Reports({ onOpenTodo }: Props): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    const load = (): void => {
      window.api.listAllTodos().then(setTodos)
    }
    load()
    return window.api.onDataChanged(load)
  }, [])

  const dates = weekDates(offset)
  const blocks = useMemo(() => weekBlocks(todos, dates), [todos, offset])

  // agregacje: minuty per dzień (segmenty per zadanie) i per zadanie w tygodniu
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

  const perTask = useMemo(() => {
    const acc = new Map<string, { todoId: string; text: string; color: string; min: number }>()
    for (const b of blocks) {
      const t = acc.get(b.todoId) ?? { todoId: b.todoId, text: b.text, color: b.color, min: 0 }
      t.min += b.endMin - b.startMin
      acc.set(b.todoId, t)
    }
    return [...acc.values()].sort((a, b) => b.min - a.min)
  }, [blocks])

  const totalMin = blocks.reduce((a, b) => a + b.endMin - b.startMin, 0)
  const gridStep = maxTotal > 360 ? 240 : maxTotal > 120 ? 60 : 30 // minuty między liniami
  const logDays = [...dates].reverse().filter((d) => dayTotal(d) > 0)
  const today = todayStr()

  return (
    <section className="reports" aria-label="Raport">
      <div className="tl-head">
        <div className="tl-nav">
          <button title="Poprzedni tydzień" onClick={() => setOffset(offset - 1)}>‹</button>
          <button title="Bieżący tydzień" onClick={() => setOffset(0)}>●</button>
          <button title="Następny tydzień" onClick={() => setOffset(offset + 1)}>›</button>
        </div>
        <span className="tl-range">
          {shortDate(dates[0])} – {shortDate(dates[6])}
        </span>
        {totalMin >= 1 && <span className="tl-total">{fmtDur(totalMin * 60)}</span>}
      </div>

      {totalMin < 1 ? (
        <div className="empty">
          <span className="empty-ember" />
          <p>Pusty tydzień. Odpal ▶ na todosie, a raport zacznie się rysować.</p>
        </div>
      ) : (
        <div className="rep-grid">
          <div className="rep-main">
            <div className="rep-chart" style={{ height: CHART_H }}>
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
                return (
                  <div key={date} className={`rep-day ${date === today ? 'rep-day-today' : ''}`}>
                    {total > 0 && <span className="rep-day-total">{fmtHM(total)}</span>}
                    <div className="rep-bar" style={{ height: Math.max((total / maxTotal) * CHART_H, total > 0 ? 3 : 0) }}>
                      {daySegments(date).map((s) => (
                        <div
                          key={s.todoId}
                          className="rep-seg"
                          title={`${s.text} — ${fmtDur(s.min * 60)}`}
                          style={{ height: `${(s.min / total) * 100}%`, background: s.color }}
                        />
                      ))}
                    </div>
                    <span className="rep-day-label">
                      {WEEKDAYS[new Date(y, m - 1, d).getDay()]} {shortDate(date)}
                    </span>
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
              <div key={t.todoId} className="rep-task">
                <span className="rep-row-edge" style={{ background: t.color }} />
                <span className="rep-row-text">{t.text}</span>
                <span className="rep-row-dur">{fmtHM(t.min)}</span>
              </div>
            ))}
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
