import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useEditor, useEditorState, EditorContent, Editor as TiptapEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Placeholder } from '@tiptap/extensions'
import { NoteMeta, dayLabel, todayStr } from '../../../shared/core'
import { refLinks, RefBases } from '../reflinks'

type Props = {
  notes: NoteMeta[]
  dayNotes?: NoteMeta[] // notatki dni (day-*) — w eksploratorze jako wirtualny katalog
  openNoteId: string | null
  onOpen: (id: string | null) => void
  onOpenDay?: (date: string) => void
  onChange: () => void
}

const FORMAT_BUTTONS: {
  key: string
  label: string
  title: string
  isActive: (e: TiptapEditor) => boolean
  run: (e: TiptapEditor) => void
}[] = [
  {
    key: 'bold',
    label: 'B',
    title: 'Pogrubienie',
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run()
  },
  {
    key: 'italic',
    label: 'I',
    title: 'Kursywa',
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run()
  },
  {
    key: 'strike',
    label: 'S',
    title: 'Przekreślenie',
    isActive: (e) => e.isActive('strike'),
    run: (e) => e.chain().focus().toggleStrike().run()
  },
  {
    key: 'h1',
    label: 'H1',
    title: 'Nagłówek 1',
    isActive: (e) => e.isActive('heading', { level: 1 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run()
  },
  {
    key: 'h2',
    label: 'H2',
    title: 'Nagłówek 2',
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    key: 'bullet',
    label: '•',
    title: 'Lista',
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run()
  },
  {
    key: 'ordered',
    label: '1.',
    title: 'Lista numerowana',
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run()
  },
  {
    key: 'quote',
    label: '❝',
    title: 'Cytat',
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run()
  },
  {
    key: 'code',
    label: '</>',
    title: 'Blok kodu',
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run()
  }
]

export function VisualEditor({
  body,
  onSave,
  placeholder = 'Pisz swobodnie — zapisuję jako markdown…'
}: {
  body: string
  onSave: (md: string) => void
  placeholder?: string
}): React.JSX.Element {
  const [bases, setBases] = useState<RefBases | null>(null)
  useEffect(() => {
    window.api.getSettings().then((s) => setBases({ azureBase: s.azureBase, githubBase: s.githubBase }))
  }, [])

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Markdown,
        Placeholder.configure({ placeholder }),
        refLinks(bases ?? { azureBase: '', githubBase: '' })
      ],
      content: body,
      contentType: 'markdown',
      onUpdate: ({ editor }) => onSave(editor.getMarkdown())
    },
    [bases] // po wczytaniu baz edytor odtwarza się raz, z aktywnymi linkami
  )

  const active = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor ? Object.fromEntries(FORMAT_BUTTONS.map((b) => [b.key, b.isActive(editor)])) : {}
  })

  // odnośnik [[...]] do innej notatki: picker z istniejącymi + tworzenie nowej
  const [notePicker, setNotePicker] = useState(false)
  const [noteQuery, setNoteQuery] = useState('')
  const [allNotes, setAllNotes] = useState<NoteMeta[]>([])

  if (!editor) return <></>

  const insertNoteLink = (title: string): void => {
    editor.chain().focus().insertContent(`[[${title}]]`).run()
    setNotePicker(false)
  }

  return (
    <div className="note-visual">
      <div className="rt-toolbar" role="toolbar" aria-label="Formatowanie">
        {FORMAT_BUTTONS.map((b) => (
          <button
            key={b.key}
            title={b.title}
            aria-pressed={!!active?.[b.key]}
            className={`rt-btn rt-${b.key} ${active?.[b.key] ? 'rt-active' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(b)}
          >
            {b.label}
          </button>
        ))}
        <span className="rt-notelink">
          <button
            className="rt-btn"
            title="Odnośnik do notatki"
            onMouseDown={(e) => e.preventDefault()}
            onClick={async () => {
              if (notePicker) {
                setNotePicker(false)
                return
              }
              setAllNotes((await window.api.listNotes()).filter((n) => !n.id.startsWith('day-')))
              setNoteQuery('')
              setNotePicker(true)
            }}
          >
            ▤+
          </button>
          {notePicker && (
            <div className="picker rt-note-picker">
              <input
                className="picker-url"
                placeholder="Szukaj lub nazwij nową…"
                value={noteQuery}
                autoFocus
                onChange={(e) => setNoteQuery(e.target.value)}
              />
              {allNotes
                .filter((n) => n.title.toLowerCase().includes(noteQuery.trim().toLowerCase()))
                .slice(0, 8)
                .map((n) => (
                  <button key={n.id} className="picker-option" onClick={() => insertNoteLink(n.title)}>
                    ▤ {n.title}
                  </button>
                ))}
              {noteQuery.trim() && (
                <button
                  className="picker-option"
                  onClick={async () => {
                    await window.api.createNote({ title: noteQuery.trim(), date: todayStr() })
                    insertNoteLink(noteQuery.trim())
                  }}
                >
                  ＋ Utwórz „{noteQuery.trim()}"
                </button>
              )}
            </div>
          )}
        </span>
      </div>
      <EditorContent editor={editor} />
    </div>
  )

  function run(b: (typeof FORMAT_BUTTONS)[number]): void {
    if (editor) b.run(editor)
  }
}

function Editor({
  id,
  notes,
  onOpen,
  onChange
}: Omit<Props, 'openNoteId'> & { id: string }): React.JSX.Element {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [mode, setMode] = useState<'md' | 'visual'>(
    () => (localStorage.getItem('note-mode') as 'md' | 'visual') || 'md'
  )
  const [loaded, setLoaded] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<{ title?: string; body?: string }>({})
  const note = notes.find((n) => n.id === id)
  const children = notes.filter((n) => n.parentId === id)

  useEffect(() => {
    setLoaded(false)
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

  const switchMode = (m: 'md' | 'visual'): void => {
    setMode(m)
    localStorage.setItem('note-mode', m)
  }

  if (!loaded) return <div className="muted">…</div>

  return (
    <motion.div
      className="note-editor card"
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
        <div className="scope-toggle" role="radiogroup" aria-label="Tryb edycji">
          <button
            role="radio"
            aria-checked={mode === 'md'}
            className={mode === 'md' ? 'scope-active' : ''}
            onClick={() => switchMode('md')}
          >
            Md
          </button>
          <button
            role="radio"
            aria-checked={mode === 'visual'}
            className={mode === 'visual' ? 'scope-active' : ''}
            onClick={() => switchMode('visual')}
          >
            Wizualnie
          </button>
        </div>
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
      {mode === 'visual' ? (
        <VisualEditor
          key={id}
          body={body}
          onSave={(md) => {
            setBody(md)
            save({ body: md })
          }}
        />
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
            ▤ {c.title}
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

function TreeRows({
  notes,
  parentId,
  depth,
  collapsed,
  toggle,
  onOpen
}: {
  notes: NoteMeta[]
  parentId: string | undefined
  depth: number
  collapsed: Set<string>
  toggle: (id: string) => void
  onOpen: (id: string) => void
}): React.JSX.Element {
  const level = notes.filter((n) => n.parentId === parentId)
  return (
    <>
      {level.map((n) => {
        const kids = notes.some((k) => k.parentId === n.id)
        const closed = collapsed.has(n.id)
        return (
          <div key={n.id}>
            <div className="tree-row" style={{ paddingLeft: depth * 20 }}>
              <button
                className={`tree-toggle ${kids ? '' : 'tree-toggle-empty'}`}
                aria-label={closed ? 'Rozwiń' : 'Zwiń'}
                onClick={() => kids && toggle(n.id)}
              >
                {kids ? (closed ? '▸' : '▾') : '·'}
              </button>
              <button className="tree-title" onClick={() => onOpen(n.id)}>
                ▤ {n.title}
              </button>
              <span className="tree-date">{dayLabel(n.date)}</span>
            </div>
            {kids && !closed && (
              <TreeRows
                notes={notes}
                parentId={n.id}
                depth={depth + 1}
                collapsed={collapsed}
                toggle={toggle}
                onOpen={onOpen}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

export default function Notes({
  notes,
  dayNotes = [],
  openNoteId,
  onOpen,
  onOpenDay,
  onChange
}: Props): React.JSX.Element {
  // zwinięte węzły; katalog dni domyślnie zwinięty
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['day-folder']))
  const toggle = (id: string): void =>
    setCollapsed((c) => {
      const next = new Set(c)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  if (openNoteId) {
    return (
      <section className="notes" aria-label="Notatki">
        <Editor id={openNoteId} notes={notes} onOpen={onOpen} onChange={onChange} />
      </section>
    )
  }

  const daysClosed = collapsed.has('day-folder')
  const sortedDays = [...dayNotes].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <section className="notes" aria-label="Notatki">
      <div className="notes-header">
        <h3>Wszystkie notatki</h3>
        <button
          className="btn-primary"
          onClick={async () => {
            const meta = await window.api.createNote({ title: 'Nowa notatka', date: todayStr() })
            onChange()
            onOpen(meta.id)
          }}
        >
          ＋ Notatka
        </button>
      </div>
      <div className="note-tree">
        <TreeRows
          notes={notes}
          parentId={undefined}
          depth={0}
          collapsed={collapsed}
          toggle={toggle}
          onOpen={onOpen}
        />
        {sortedDays.length > 0 && (
          <>
            <div className="tree-row tree-folder">
              <button
                className="tree-toggle"
                aria-label={daysClosed ? 'Rozwiń' : 'Zwiń'}
                onClick={() => toggle('day-folder')}
              >
                {daysClosed ? '▸' : '▾'}
              </button>
              <button className="tree-title" onClick={() => toggle('day-folder')}>
                ▦ Notatki dni
              </button>
              <span className="tree-date">{sortedDays.length}</span>
            </div>
            {!daysClosed &&
              sortedDays.map((n) => (
                <div key={n.id} className="tree-row tree-row-day" style={{ paddingLeft: 20 }}>
                  <span className="tree-toggle tree-toggle-empty">·</span>
                  <button
                    className="tree-title"
                    title="Otwórz dzień"
                    onClick={() => onOpenDay?.(n.date)}
                  >
                    {dayLabel(n.date)}
                  </button>
                </div>
              ))}
          </>
        )}
      </div>
      {notes.length === 0 && dayNotes.length === 0 && (
        <div className="empty empty-sm">
          <p>Żadnej notatki. „＋ Notatka" zaczyna nową kartkę.</p>
        </div>
      )}
    </section>
  )
}
