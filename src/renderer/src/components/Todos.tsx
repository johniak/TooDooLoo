import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import TodoNote from './TodoNote'
import {
  Todo,
  NoteMeta,
  Urgency,
  URGENCIES,
  dayLabel,
  trackingSince,
  trackedSeconds,
  fmtClock,
  taskColor,
  TASK_COLORS
} from '../../../shared/core'

const hostname = (u: string): string => {
  try {
    return new URL(u).hostname
  } catch {
    return u
  }
}

const normalizeUrl = (v: string): string =>
  v && !/^https?:\/\//i.test(v) ? `https://${v}` : v

function Sparks(): React.JSX.Element {
  return (
    <span className="sparks">
      {[...Array(10)].map((_, i) => (
        <motion.span
          key={i}
          className="spark"
          style={{ background: URGENCIES[i % 3].color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((i / 10) * Math.PI * 2) * 42,
            y: Math.sin((i / 10) * Math.PI * 2) * 42 - 12,
            opacity: 0,
            scale: 0.3
          }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      ))}
    </span>
  )
}

type Props = {
  date: string
  todos: Todo[]
  notes: NoteMeta[]
  ticketNotes?: NoteMeta[] // notatki todo-* — do podświetlenia ✎, gdy ticket ma już treść
  onChange: () => void
  onOpenNote?: (id: string) => void
  highlightId?: string | null
}

export default function Todos({
  date,
  todos,
  notes,
  ticketNotes = [],
  onChange,
  onOpenNote,
  highlightId
}: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('medium')
  const [burstId, setBurstId] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<{
    id: string
    kind: 'link' | 'urgency' | 'color'
  } | null>(null)
  const [noteFor, setNoteFor] = useState<string | null>(null) // rozwinięta notatka ticketa
  const [, setClockTick] = useState(0)

  // żywe sekundy na chipie czasu, tylko gdy jakiś timer chodzi
  const anyTracking = todos.some((t) => trackingSince(t))
  useEffect(() => {
    if (!anyTracking) return
    const i = setInterval(() => setClockTick((n) => n + 1), 1000)
    return () => clearInterval(i)
  }, [anyTracking])

  const add = async (): Promise<void> => {
    if (!text.trim()) return
    await window.api.addTodo({
      text: text.trim(),
      date,
      urgency,
      url: normalizeUrl(url.trim()) || undefined
    })
    setText('')
    setUrl('')
    onChange()
  }

  const toggle = async (t: Todo): Promise<void> => {
    if (!t.done) {
      setBurstId(t.id)
      setTimeout(() => setBurstId(null), 700)
    }
    await window.api.updateTodo(t.id, { done: !t.done })
    onChange()
  }

  return (
    <section className="todos" aria-label="Todosy">
      <div className="todo-add card">
        <div className="todo-add-row">
          <input
            className="todo-input"
            placeholder="Co jest do zrobienia?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <input
            className="todo-input todo-input-url"
            placeholder="🔗 link (opcjonalnie)"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
          />
          <button className="btn-primary" onClick={add}>
            Dodaj
          </button>
        </div>
        <div className="urgency-group" role="radiogroup" aria-label="Poziom pilności">
          {URGENCIES.map((u) => (
            <button
              key={u.value}
              role="radio"
              aria-checked={urgency === u.value}
              className={`urgency-btn ${urgency === u.value ? 'urgency-active' : ''}`}
              style={urgency === u.value ? { background: u.color, borderColor: u.color } : {}}
              onClick={() => setUrgency(u.value)}
            >
              <span className="ember-dot" style={{ background: u.color }} />
              {u.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="todo-list">
        <AnimatePresence initial={false}>
          {todos.map((t) => {
            const u = URGENCIES.find((x) => x.value === t.urgency)!
            const pickerOpen = pickerFor?.id === t.id
            const running = !!trackingSince(t)
            const secs = trackedSeconds(t)
            const edge = { borderLeftColor: taskColor(t) }
            // duch: todos przeszedł przez ten dzień rolloverem — pokazujemy ślad, edycja na dniu docelowym
            if (t.date !== date) {
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={edge}
                  className="todo card todo-ghost"
                >
                  <span className="todo-ghost-mark" style={{ color: u.color }}>
                    ○
                  </span>
                  {t.num != null && <span className="todo-num">#{t.num}</span>}
                  <span className="todo-text">{t.text}</span>
                  <span className="todo-rolled" title={`Przeniesione na ${t.date}`}>
                    ↻ {dayLabel(t.date)}
                  </span>
                </motion.li>
              )
            }
            return (
              <motion.li
                key={t.id}
                layout
                initial={{ opacity: 0, y: -12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.9 }}
                transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                style={pickerOpen ? { ...edge, zIndex: 5 } : edge}
                className={`todo card ${t.done ? 'todo-done' : ''} ${running ? 'todo-tracking' : ''} ${highlightId === t.id ? 'todo-flash' : ''} ${noteFor === t.id ? 'todo-expanded' : ''}`}
              >
                <button
                  className="todo-check"
                  aria-label={t.done ? 'Odznacz' : 'Zrobione'}
                  onClick={() => toggle(t)}
                >
                  {t.done && '✓'}
                  {burstId === t.id && <Sparks />}
                </button>
                {t.num != null && <span className="todo-num">#{t.num}</span>}
                <span className="todo-text">{t.text}</span>
                {t.rolledFrom && (
                  <span className="todo-rolled" title={`Niezrobione od ${t.rolledFrom}`}>
                    ↻ {dayLabel(t.rolledFrom)}
                  </span>
                )}
                {(secs > 0 || running) && (
                  <span className={`todo-time ${running ? 'todo-time-live' : ''}`}>
                    ⏱ {fmtClock(secs)}
                  </span>
                )}
                {t.url && (
                  <button
                    className="todo-note-link todo-url"
                    title={t.url}
                    onClick={() => window.open(t.url)}
                  >
                    ⌁ {hostname(t.url)}
                  </button>
                )}
                {t.noteId && (
                  <button className="todo-note-link" onClick={() => onOpenNote?.(t.noteId!)}>
                    ▤ {notes.find((n) => n.id === t.noteId)?.title ?? 'notatka'}
                  </button>
                )}
                <button
                  className="ember"
                  title={u.label}
                  aria-label={`Pilność: ${u.label}`}
                  style={{ color: u.color }}
                  onClick={() =>
                    setPickerFor(pickerOpen && pickerFor.kind === 'urgency' ? null : { id: t.id, kind: 'urgency' })
                  }
                >
                  <span className="ember-dot ember-glow" style={{ background: u.color }} />
                </button>
                <button
                  className={`todo-icon todo-note-btn ${ticketNotes.some((n) => n.id === `todo-${t.id}`) ? 'todo-note-btn-has' : ''}`}
                  title="Notatka ticketa"
                  onClick={() => setNoteFor(noteFor === t.id ? null : t.id)}
                >
                  ✎
                </button>
                <button
                  className="todo-icon todo-color"
                  title="Kolor zadania"
                  onClick={() =>
                    setPickerFor(pickerOpen && pickerFor.kind === 'color' ? null : { id: t.id, kind: 'color' })
                  }
                >
                  <span className="color-dot" style={{ background: taskColor(t) }} />
                </button>
                {!t.done && (
                  <button
                    className={`todo-icon todo-track ${running ? 'todo-track-on' : ''}`}
                    title={running ? 'Zatrzymaj licznik' : 'Licz czas'}
                    onClick={async () => {
                      if (running) await window.api.stopTracking()
                      else await window.api.startTracking(t.id)
                      onChange()
                    }}
                  >
                    {running ? '⏸' : '▶'}
                  </button>
                )}
                <button
                  className="todo-icon"
                  title="Podepnij link lub notatkę"
                  onClick={() =>
                    setPickerFor(pickerOpen && pickerFor.kind === 'link' ? null : { id: t.id, kind: 'link' })
                  }
                >
                  🔗
                </button>
                <button
                  className="todo-icon todo-delete"
                  title="Usuń"
                  onClick={async () => {
                    await window.api.deleteTodo(t.id)
                    onChange()
                  }}
                >
                  ✕
                </button>
                {pickerOpen && pickerFor.kind === 'urgency' && (
                  <div className="picker" role="radiogroup" aria-label="Pilność">
                    {URGENCIES.map((opt) => (
                      <button
                        key={opt.value}
                        role="radio"
                        aria-checked={t.urgency === opt.value}
                        title={opt.label}
                        className="picker-option"
                        onClick={async () => {
                          await window.api.updateTodo(t.id, { urgency: opt.value })
                          setPickerFor(null)
                          onChange()
                        }}
                      >
                        <span className="ember-dot" style={{ background: opt.color }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
                {noteFor === t.id && (
                  <div className="todo-note-inline">
                    <TodoNote todoId={t.id} />
                  </div>
                )}
                {pickerOpen && pickerFor.kind === 'color' && (
                  <div className="picker picker-colors" role="radiogroup" aria-label="Kolor zadania">
                    <div className="picker-swatches">
                      {TASK_COLORS.map((c) => (
                        <button
                          key={c}
                          role="radio"
                          aria-checked={taskColor(t) === c}
                          className="color-swatch"
                          style={{ background: c }}
                          onClick={async () => {
                            await window.api.updateTodo(t.id, { color: c })
                            setPickerFor(null)
                            onChange()
                          }}
                        />
                      ))}
                    </div>
                    {t.color && (
                      <button
                        className="picker-option"
                        onClick={async () => {
                          await window.api.updateTodo(t.id, { color: '' })
                          setPickerFor(null)
                          onChange()
                        }}
                      >
                        ↺ Automatyczny
                      </button>
                    )}
                  </div>
                )}
                {pickerOpen && pickerFor.kind === 'link' && (
                  <div className="picker">
                    <input
                      className="picker-url"
                      placeholder="https://…  (Enter zapisuje)"
                      defaultValue={t.url ?? ''}
                      autoFocus
                      onKeyDown={async (e) => {
                        if (e.key !== 'Enter') return
                        await window.api.updateTodo(t.id, {
                          url: normalizeUrl(e.currentTarget.value.trim())
                        })
                        setPickerFor(null)
                        onChange()
                      }}
                    />
                    {t.noteId ? (
                      <button
                        className="picker-option"
                        onClick={async () => {
                          await window.api.updateTodo(t.id, { noteId: '' })
                          setPickerFor(null)
                          onChange()
                        }}
                      >
                        ✕ Odepnij notatkę
                      </button>
                    ) : (
                      <>
                        {notes.length === 0 && (
                          <span className="muted picker-empty">Brak notatek</span>
                        )}
                        {notes.map((n) => (
                          <button
                            key={n.id}
                            className="picker-option"
                            onClick={async () => {
                              await window.api.updateTodo(t.id, { noteId: n.id })
                              setPickerFor(null)
                              onChange()
                            }}
                          >
                            ▤ {n.title}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {todos.length === 0 && (
        <div className="empty">
          <span className="empty-ember" />
          <p>Czysty dzień. Zapisz pierwsze zadanie, zanim zrobi to ktoś za Ciebie.</p>
        </div>
      )}
    </section>
  )
}
