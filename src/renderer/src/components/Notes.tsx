import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { marked } from 'marked'
import { NoteMeta } from '../../../shared/core'

type Props = {
  date: string
  notes: NoteMeta[]
  openNoteId: string | null
  onOpen: (id: string | null) => void
  onChange: () => void
}

function Editor({ id, notes, onOpen, onChange }: Omit<Props, 'date' | 'openNoteId'> & { id: string }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<{ title?: string; body?: string }>({})
  const note = notes.find((n) => n.id === id)
  const children = notes.filter((n) => n.parentId === id)

  useEffect(() => {
    setLoaded(false)
    setPreview(false)
    window.api.getNote(id).then((n) => {
      if (n) {
        setTitle(n.meta.title)
        setBody(n.body)
        setLoaded(true)
      }
    })
    return () => {
      // flush niedokończonego zapisu przy zmianie notatki
      clearTimeout(saveTimer.current)
      const p = pending.current
      pending.current = {}
      if (Object.keys(p).length) window.api.saveNote(id, p).then(onChange)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const save = (patch: { title?: string; body?: string }): void => {
    Object.assign(pending.current, patch)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const p = pending.current
      pending.current = {}
      await window.api.saveNote(id, p)
      onChange()
    }, 300)
  }

  if (!loaded) return <div className="muted">…</div>

  return (
    <motion.div
      className="note-editor glass"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="note-toolbar">
        <button className="btn-ghost" onClick={() => onOpen(note?.parentId ?? null)}>
          ← Wróć
        </button>
        <input
          className="note-title"
          value={title}
          placeholder="Tytuł notatki"
          onChange={(e) => {
            setTitle(e.target.value)
            save({ title: e.target.value })
          }}
        />
        <button className="btn-ghost" onClick={() => setPreview(!preview)}>
          {preview ? 'Edycja' : 'Podgląd'}
        </button>
        <button
          className="btn-ghost todo-delete"
          onClick={async () => {
            await window.api.deleteNote(id)
            onOpen(null)
            onChange()
          }}
        >
          Usuń
        </button>
      </div>
      {preview ? (
        <div className="note-preview" dangerouslySetInnerHTML={{ __html: marked.parse(body) as string }} />
      ) : (
        <textarea
          className="note-body"
          value={body}
          placeholder="Pisz w markdownie…"
          onChange={(e) => {
            setBody(e.target.value)
            save({ body: e.target.value })
          }}
        />
      )}
      <div className="note-children">
        {children.map((c) => (
          <button key={c.id} className="note-chip" onClick={() => onOpen(c.id)}>
            📄 {c.title}
          </button>
        ))}
        <button
          className="note-chip note-chip-add"
          onClick={async () => {
            const meta = await window.api.createNote({
              title: 'Podstrona',
              date: note?.date ?? '',
              parentId: id
            })
            onChange()
            onOpen(meta.id)
          }}
        >
          ＋ podstrona
        </button>
      </div>
    </motion.div>
  )
}

export default function Notes({ date, notes, openNoteId, onOpen, onChange }: Props): React.JSX.Element {
  const [scope, setScope] = useState<'day' | 'all'>('day')

  if (openNoteId) {
    return (
      <section className="notes" aria-label="Notatki">
        <Editor id={openNoteId} notes={notes} onOpen={onOpen} onChange={onChange} />
      </section>
    )
  }

  const visible = notes.filter((n) => !n.parentId && (scope === 'all' || n.date === date))

  return (
    <section className="notes" aria-label="Notatki">
      <div className="notes-header">
        <h3>Notatki</h3>
        <div className="scope-toggle">
          <button className={scope === 'day' ? 'scope-active' : ''} onClick={() => setScope('day')}>
            Dzień
          </button>
          <button className={scope === 'all' ? 'scope-active' : ''} onClick={() => setScope('all')}>
            Wszystkie
          </button>
        </div>
        <button
          className="btn-primary"
          onClick={async () => {
            const meta = await window.api.createNote({ title: 'Nowa notatka', date })
            onChange()
            onOpen(meta.id)
          }}
        >
          ＋ Notatka
        </button>
      </div>
      <div className="note-grid">
        <AnimatePresence initial={false}>
          {visible.map((n) => (
            <motion.button
              key={n.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              whileHover={{ y: -3 }}
              className="note-card glass"
              onClick={() => onOpen(n.id)}
            >
              <span className="note-card-title">{n.title}</span>
              <span className="muted">{n.date}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
      {visible.length === 0 && <p className="muted empty">Brak notatek</p>}
    </section>
  )
}
