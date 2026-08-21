import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Todo, NoteMeta, Urgency, URGENCIES } from '../../../shared/core'

function Confetti(): React.JSX.Element {
  return (
    <span className="confetti">
      {[...Array(10)].map((_, i) => (
        <motion.span
          key={i}
          className="confetti-bit"
          style={{ background: URGENCIES[i % URGENCIES.length].color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{
            x: Math.cos((i / 10) * Math.PI * 2) * 42,
            y: Math.sin((i / 10) * Math.PI * 2) * 42,
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
  const [linkingId, setLinkingId] = useState<string | null>(null)

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
      <div className="todo-add glass">
        <input
          className="todo-input"
          placeholder="Co jest do zrobienia?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
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
              {u.label}
            </button>
          ))}
        </div>
        <button className="btn-primary" onClick={add}>
          Dodaj
        </button>
      </div>

      <ul className="todo-list">
        <AnimatePresence initial={false}>
          {todos.map((t) => (
            <motion.li
              key={t.id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 500, damping: 34 }}
              className={`todo glass ${t.done ? 'todo-done' : ''} ${highlightId === t.id ? 'todo-flash' : ''}`}
            >
              <button
                className="todo-check"
                aria-label={t.done ? 'Odznacz' : 'Zrobione'}
                style={{ borderColor: URGENCIES.find((u) => u.value === t.urgency)!.color }}
                onClick={() => toggle(t)}
              >
                {t.done && '✓'}
                {burstId === t.id && <Confetti />}
              </button>
              <span className="todo-text">{t.text}</span>
              <div className="urgency-group urgency-mini" role="radiogroup" aria-label="Pilność">
                {URGENCIES.map((u) => (
                  <button
                    key={u.value}
                    role="radio"
                    aria-checked={t.urgency === u.value}
                    title={u.label}
                    className={`urgency-dot ${t.urgency === u.value ? 'urgency-dot-active' : ''}`}
                    style={{ background: u.color }}
                    onClick={async () => {
                      await window.api.updateTodo(t.id, { urgency: u.value })
                      onChange()
                    }}
                  />
                ))}
              </div>
              {t.noteId ? (
                <button className="todo-note-link" onClick={() => onOpenNote?.(t.noteId!)}>
                  📝 {notes.find((n) => n.id === t.noteId)?.title ?? 'notatka'}
                </button>
              ) : (
                <button
                  className="todo-icon"
                  title="Powiąż z notatką"
                  onClick={() => setLinkingId(linkingId === t.id ? null : t.id)}
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
              {linkingId === t.id && (
                <div className="link-picker glass">
                  {notes.length === 0 && <span className="muted">Brak notatek</span>}
                  {notes.map((n) => (
                    <button
                      key={n.id}
                      className="link-option"
                      onClick={async () => {
                        await window.api.updateTodo(t.id, { noteId: n.id })
                        setLinkingId(null)
                        onChange()
                      }}
                    >
                      {n.title}
                    </button>
                  ))}
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {todos.length === 0 && <p className="muted empty">Pusto. Dodaj pierwszy todos ✨</p>}
    </section>
  )
}
