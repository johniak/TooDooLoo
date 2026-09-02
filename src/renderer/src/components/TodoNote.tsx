import { useEffect, useRef, useState } from 'react'
import { VisualEditor } from './Notes'

/** Notatka ticketa — rozwijana pod wierszem todosa, tworzona przy pierwszym wpisie. */
export default function TodoNote({ todoId }: { todoId: string }): React.JSX.Element {
  const [body, setBody] = useState<string | null>(null) // null = ładowanie
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pendingMd = useRef<string | null>(null)

  useEffect(() => {
    setBody(null)
    window.api.getNote(`todo-${todoId}`).then((n) => setBody(n?.body ?? ''))
    return () => {
      // flush niedokończonego zapisu przy zwinięciu/zmianie todosa
      clearTimeout(saveTimer.current)
      if (pendingMd.current !== null) {
        window.api.saveTodoNote(todoId, pendingMd.current)
        pendingMd.current = null
      }
    }
  }, [todoId])

  const save = (md: string): void => {
    pendingMd.current = md
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      pendingMd.current = null
      window.api.saveTodoNote(todoId, md)
    }, 300)
  }

  if (body === null) return <></>
  return (
    <div className="todo-note-editor">
      <VisualEditor
        key={todoId}
        body={body}
        onSave={(md) => {
          setBody(md)
          save(md)
        }}
        placeholder="Szybka notatka do ticketa…"
      />
    </div>
  )
}
