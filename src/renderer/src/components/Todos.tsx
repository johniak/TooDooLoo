import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Todo, NoteMeta, Urgency, URGENCIES, dayLabel } from '../../../shared/core'

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
  onChange: () => void
  onOpenNote?: (id: string) => void
  highlightId?: string | null
}

export default function Todos({
  date,
  todos,
  notes,
  onChange,
  onOpenNote,
  highlightId
}: Props): React.JSX.Element {
  const [text, setText] = useState('')
  const [url, setUrl] = useState('')
  const [urgency, setUrgency] = useState<Urgency>('medium')
  const [burstId, setBurstId] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<{ id: string; kind: 'link' | 'urgency' } | null>(null)

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
            // duch: todos przeszedł przez ten dzień rolloverem — pokazujemy ślad, edycja na dniu docelowym
            if (t.date !== date) {
              return (
                <motion.li
                  key={t.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="todo card todo-ghost"
                >
                  <span className="todo-ghost-mark" style={{ color: u.color }}>
                    ○
                  </span>
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
                style={pickerOpen ? { zIndex: 5 } : undefined}
                className={`todo card ${t.done ? 'todo-done' : ''} ${highlightId === t.id ? 'todo-flash' : ''}`}
              >
                <button
                  className="todo-check"
                  aria-label={t.done ? 'Odznacz' : 'Zrobione'}
                  onClick={() => toggle(t)}
                >
                  {t.done && '✓'}
                  {burstId === t.id && <Sparks />}
                </button>
                <span className="todo-text">{t.text}</span>
                {t.rolledFrom && (
                  <span className="todo-rolled" title={`Niezrobione od ${t.rolledFrom}`}>
                    ↻ {dayLabel(t.rolledFrom)}
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
