import { useEffect, useRef, useState } from 'react'
import { VisualEditor } from './Notes'

/** Notatka dnia — zawsze widoczna pod todosami, tworzona przy pierwszym wpisie. */
export default function DayNote({ date }: { date: string }): React.JSX.Element {
  const [body, setBody] = useState<string | null>(null) // null = ładowanie
  const [mode, setMode] = useState<'md' | 'visual'>(
    () => (localStorage.getItem('note-mode') as 'md' | 'visual') || 'visual'
  )
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingMd = useRef<string | null>(null)

  useEffect(() => {
    setBody(null)
    window.api.getNote(`day-${date}`).then((n) => setBody(n?.body ?? ''))
    return () => {
      // flush niedokończonego zapisu przy zmianie dnia
      clearTimeout(saveTimer.current)
      if (pendingMd.current !== null) {
        window.api.saveDayNote(date, pendingMd.current)
        pendingMd.current = null
      }
    }
  }, [date])

  const save = (md: string): void => {
    pendingMd.current = md
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pendingMd.current = null
      window.api.saveDayNote(date, md)
    }, 300)
  }

  const switchMode = (m: 'md' | 'visual'): void => {
    setMode(m)
    localStorage.setItem('note-mode', m)
  }

  return (
    <section className="day-note" aria-label="Notatka dnia">
      <div className="notes-header">
        <h3>Notatka dnia</h3>
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
      </div>
      {body !== null && (
        <div className="card day-note-card">
          {mode === 'visual' ? (
            <VisualEditor
              key={date}
              body={body}
              onSave={(md) => {
                setBody(md)
                save(md)
              }}
              placeholder="Myśli, log dnia, cokolwiek…"
            />
          ) : (
            <textarea
              className="note-body"
              value={body}
              placeholder="Pisz w markdownie…"
              onChange={(e) => {
                setBody(e.target.value)
                save(e.target.value)
              }}
            />
          )}
        </div>
      )}
    </section>
  )
}
