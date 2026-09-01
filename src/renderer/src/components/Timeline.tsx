import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Todo,
  Session,
  TimelineBlock,
  weekBlocks,
  taskColor,
  todayStr,
  fmtDur,
  WEEKDAYS
} from '../../../shared/core'

const PX_PER_HOUR = 56
const GUTTER = 44
const SNAP_MIN = 5

type Props = {
  workStart: string
  workEnd: string
  onOpenTodo: (id: string, date: string) => void
}

type Drag = {
  todoId: string
  idx: number
  mode: 'move' | 'start' | 'end'
  originX: number
  originY: number
  deltaMin: number
  dayDelta: number
  moved: boolean
}

const hourOf = (t: string): number => Number(t.split(':')[0])
const p = (n: number): string => String(n).padStart(2, '0')

const SNAP_MS = SNAP_MIN * 60_000
const snap = (ms: number): number => Math.round(ms / SNAP_MS) * SNAP_MS

/** Nowe start/koniec sesji dla trwającego dragu — wynik snapowany do siatki 5 min. */
function dragPatch(s: Session, d: Drag): { start?: string; end?: string } {
  const patch: { start?: string; end?: string } = {}
  if (d.mode === 'move') {
    const shift = d.dayDelta * 86_400_000 + d.deltaMin * 60_000
    const newStart = snap(Date.parse(s.start) + shift)
    patch.start = new Date(newStart).toISOString()
    if (s.end) patch.end = new Date(Date.parse(s.end) + (newStart - Date.parse(s.start))).toISOString()
  } else if (d.mode === 'start') {
    patch.start = new Date(snap(Date.parse(s.start) + d.deltaMin * 60_000)).toISOString()
  } else if (s.end) {
    patch.end = new Date(snap(Date.parse(s.end) + d.deltaMin * 60_000)).toISOString()
  }
  return patch
}

export function weekDates(offset: number): string[] {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7) // poniedziałek tygodnia
  return [...Array(7)].map((_, i) => {
    const day = new Date(d)
    day.setDate(d.getDate() + i)
    return todayStr(day)
  })
}

export const shortDate = (date: string): string => {
  const [, m, d] = date.split('-')
  return `${d}.${m}`
}

const localDate = (iso: string): string => todayStr(new Date(iso))
const localTime = (iso: string): string => {
  const d = new Date(iso)
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
const toIso = (date: string, time: string): string => {
  const [y, m, d] = date.split('-').map(Number)
  const [h, mi] = time.split(':').map(Number)
  return new Date(y, m - 1, d, h, mi).toISOString()
}

function SessionModal({
  todo,
  idx,
  onClose,
  onSaved,
  onOpenTodo
}: {
  todo: Todo
  idx: number
  onClose: () => void
  onSaved: () => void
  onOpenTodo: (id: string, date: string) => void
}): React.JSX.Element {
  const s: Session = todo.sessions![idx]
  const running = !s.end
  const [startDate, setStartDate] = useState(localDate(s.start))
  const [startTime, setStartTime] = useState(localTime(s.start))
  const [endDate, setEndDate] = useState(s.end ? localDate(s.end) : '')
  const [endTime, setEndTime] = useState(s.end ? localTime(s.end) : '')

  const startIso = (): string => toIso(startDate, startTime)
  const endIso = (): string => toIso(endDate, endTime)
  const durMin = running
    ? Math.round((Date.now() - Date.parse(startIso())) / 60_000)
    : Math.round((Date.parse(endIso()) - Date.parse(startIso())) / 60_000)

  const save = async (): Promise<void> => {
    const ok = await window.api.updateSession(
      todo.id,
      idx,
      running ? { start: startIso() } : { start: startIso(), end: endIso() }
    )
    if (ok) {
      onSaved()
      onClose()
    }
  }

  return (
    <div className="tl-backdrop" onClick={onClose}>
      <div className="tl-modal card" onClick={(e) => e.stopPropagation()}>
        <h3 className="tl-modal-title" style={{ color: taskColor(todo) }}>
          {todo.num != null && <span className="todo-num">#{todo.num}</span>} {todo.text}
        </h3>
        <label className="tl-field">
          Start
          <span className="tl-field-inputs">
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input
              className="tl-start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </span>
        </label>
        <label className="tl-field">
          Koniec
          {running ? (
            <span className="tl-live">
              <span className="tl-live-dot" /> w toku
            </span>
          ) : (
            <span className="tl-field-inputs">
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              <input
                className="tl-end-time"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </span>
          )}
        </label>
        <label className="tl-field">
          Długość (min)
          <input
            className="tl-dur"
            type="number"
            min={1}
            step={5}
            value={durMin > 0 ? durMin : ''}
            disabled={running}
            onChange={(e) => {
              const min = Number(e.target.value)
              if (!min) return
              const end = new Date(Date.parse(startIso()) + min * 60_000)
              setEndDate(todayStr(end))
              setEndTime(`${p(end.getHours())}:${p(end.getMinutes())}`)
            }}
          />
        </label>
        <div className="tl-modal-actions">
          <button className="tl-modal-link" onClick={() => onOpenTodo(todo.id, todo.date)}>
            ▤ Pokaż todosa
          </button>
          {!running && (
            <button
              className="tl-modal-delete"
              title="Usuń zalogowany czas"
              onClick={async () => {
                await window.api.deleteSession(todo.id, idx)
                onSaved()
                onClose()
              }}
            >
              Usuń
            </button>
          )}
          <button onClick={onClose}>Anuluj</button>
          <button className="btn-primary" onClick={save} disabled={durMin <= 0}>
            Zapisz
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Timeline({ workStart, workEnd, onOpenTodo }: Props): React.JSX.Element {
  const [todos, setTodos] = useState<Todo[]>([])
  const [offset, setOffset] = useState(0)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [editing, setEditing] = useState<{ todoId: string; idx: number } | null>(null)
  const [, setTick] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)
  const suppressClick = useRef(false)

  const load = (): void => {
    window.api.listAllTodos().then(setTodos)
  }

  useEffect(() => {
    load()
    const i = setInterval(() => setTick((n) => n + 1), 60_000) // linia „teraz" i rosnący blok
    const unsub = window.api.onDataChanged(load)
    return () => {
      clearInterval(i)
      unsub()
    }
  }, [])

  const dates = weekDates(offset)

  // podgląd przeciągania: sesja przesunięta lokalnie, zanim commit trafi na dysk
  const previewTodos = useMemo(() => {
    if (!drag?.moved) return todos
    return todos.map((t) =>
      t.id !== drag.todoId
        ? t
        : {
            ...t,
            sessions: t.sessions!.map((s, i) => (i !== drag.idx ? s : { ...s, ...dragPatch(s, drag) }))
          }
    )
  }, [todos, drag])

  const blocks = useMemo(() => weekBlocks(previewTodos, dates), [previewTodos, offset])
  const byDate = (date: string): TimelineBlock[] => blocks.filter((b) => b.date === date)

  // weekend tylko gdy ma sesje — jak w sidebarze
  const visible = dates.filter((d, i) => i < 5 || byDate(d).length > 0)

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

  const commitDrag = async (d: Drag): Promise<void> => {
    const s = todos.find((x) => x.id === d.todoId)?.sessions?.[d.idx]
    if (!s) return
    await window.api.updateSession(d.todoId, d.idx, dragPatch(s, d))
    load()
  }

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
      <div className="tl-grid" ref={gridRef}>
        <div className="tl-gutter" style={{ height: colHeight, marginTop: 28 }}>
          {[...Array(endHour - startHour + 1)].map((_, i) => (
            <span key={i} className="tl-hour" style={{ top: i * PX_PER_HOUR }}>
              {p(startHour + i)}:00
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
                {date === today && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                  <div className="tl-now" style={{ top: toPx(nowMin) }} />
                )}
                {byDate(date).map((b, i) => {
                  const color = b.color
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
                      onPointerDown={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        let mode: Drag['mode'] =
                          e.clientY - rect.top < 7 && b.isStart
                            ? 'start'
                            : rect.bottom - e.clientY < 7 && b.isEnd
                              ? 'end'
                              : 'move'
                        if (b.running && mode !== 'start') {
                          if (e.clientY - rect.top >= 7) return // otwartą sesję ciągniemy tylko za start
                          mode = 'start'
                        }
                        e.currentTarget.setPointerCapture(e.pointerId)
                        setDrag({
                          todoId: b.todoId,
                          idx: b.sessionIdx,
                          mode,
                          originX: e.clientX,
                          originY: e.clientY,
                          deltaMin: 0,
                          dayDelta: 0,
                          moved: false
                        })
                      }}
                      onPointerMove={(e) => {
                        if (!drag) return
                        const dy = e.clientY - drag.originY
                        const dx = e.clientX - drag.originX
                        const grid = gridRef.current
                        const colW = grid ? (grid.clientWidth - GUTTER) / visible.length : 1
                        setDrag({
                          ...drag,
                          deltaMin: (dy / PX_PER_HOUR) * 60, // surowa delta — snap robi dragPatch na wyniku
                          dayDelta: drag.mode === 'move' ? Math.round(dx / colW) : 0,
                          moved: drag.moved || Math.abs(dy) > 3 || Math.abs(dx) > 3
                        })
                      }}
                      onPointerUp={async () => {
                        if (!drag) return
                        if (drag.moved) {
                          suppressClick.current = true
                          await commitDrag(drag)
                        }
                        setDrag(null)
                      }}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false
                          return
                        }
                        setEditing({ todoId: b.todoId, idx: b.sessionIdx })
                      }}
                    >
                      {(b.isStart || b.running) && <span className="tl-handle tl-handle-top" />}
                      {b.isEnd && !b.running && <span className="tl-handle tl-handle-bottom" />}
                      {h >= 24 && (
                        <span className="tl-block-label" style={{ color }}>
                          {b.running && <span className="tl-live-dot" />}
                          <span className="tl-block-text">{b.text}</span>
                          <span className="tl-block-dur">{fmtDur((b.endMin - b.startMin) * 60)}</span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {editing &&
        (() => {
          const t = todos.find((x) => x.id === editing.todoId)
          if (!t?.sessions?.[editing.idx]) return null
          return (
            <SessionModal
              todo={t}
              idx={editing.idx}
              onClose={() => setEditing(null)}
              onSaved={load}
              onOpenTodo={onOpenTodo}
            />
          )
        })()}
    </section>
  )
}
