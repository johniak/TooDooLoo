import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Todo, NoteMeta, Urgency, URGENCIES } from '../../../shared/core'

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
  const [urgency, setUrgency] = useState<Urgency>('medium')
  const [burstId, setBurstId] = useState<string | null>(null)
  const [pickerFor, setPickerFor] = useState<{ id: string; kind: 'link' | 'urgency' } | null>(null)

  const add = async (): Promise<void> => {
    if (!text.trim()) return
    await window.api.addTodo({ text: text.trim(), date, urgency })
    setText('')
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
                {!t.noteId && (
                  <button
                    className="todo-icon"
                    title="Powiąż z notatką"
                    onClick={() =>
                      setPickerFor(pickerOpen && pickerFor.kind === 'link' ? null : { id: t.id, kind: 'link' })
                    }
                  >
                    🔗
                  </button>
                )}
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
                    {notes.length === 0 && <span className="muted picker-empty">Brak notatek</span>}
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
