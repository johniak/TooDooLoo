import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Todo, NoteMeta, DaySummary, todayStr } from '../../shared/core'
import Todos from './components/Todos'
import Notes from './components/Notes'

const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']

// dni robocze: 7 wstecz, 5 wprzód; weekendy tylko gdy mają dane
function dayList(summary: Record<string, DaySummary>): string[] {
  const dates = new Set(Object.keys(summary))
  dates.add(todayStr())
  const addWorkdays = (dir: 1 | -1, count: number): void => {
    const d = new Date()
    for (let n = 0; n < count; ) {
      d.setDate(d.getDate() + dir)
      if (d.getDay() !== 0 && d.getDay() !== 6) {
        dates.add(todayStr(d))
        n++
      }
    }
  }
  addWorkdays(-1, 7)
  addWorkdays(1, 5)
  return [...dates].sort().reverse()
}

function dayLabel(date: string): string {
  const today = todayStr()
  if (date === today) return 'Dzisiaj'
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${WEEKDAYS[dt.getDay()]} ${d}.${String(m).padStart(2, '0')}`
}

export default function App(): React.JSX.Element {
  const [selected, setSelected] = useState(todayStr())
  const [summary, setSummary] = useState<Record<string, DaySummary>>({})
  const [todos, setTodos] = useState<Todo[]>([])
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [workStart, setWorkStart] = useState('09:00')

  useEffect(() => {
    window.api.getSettings().then((s) => setWorkStart(s.workStart))
    return window.api.onOpenTodo(({ id, date }) => {
      setSelected(date)
      setOpenNoteId(null)
      setHighlightId(id)
      setTimeout(() => setHighlightId(null), 2500)
    })
  }, [])

  const reload = useCallback(async () => {
    const [s, t, n] = await Promise.all([
      window.api.daysSummary(),
      window.api.listTodos(selected),
      window.api.listNotes()
    ])
    setSummary(s)
    setTodos(t)
    setNotes(n)
  }, [selected])

  useEffect(() => {
    reload()
  }, [reload])

  const today = todayStr()

  return (
    <div className="app">
      <aside className="sidebar">
        <h1 className="logo">TooDooLoo</h1>
        <div className="days">
          {dayList(summary).map((date) => {
            const s = summary[date]
            return (
              <motion.button
                key={date}
                layout
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className={`day ${date === selected ? 'day-active' : ''} ${date === today ? 'day-today' : ''}`}
                onClick={() => setSelected(date)}
                data-date={date}
              >
                <span className="day-label">{dayLabel(date)}</span>
                <span className="day-badges">
                  {s && s.todos > 0 && (
                    <span className="badge badge-todos">
                      {s.done}/{s.todos}
                    </span>
                  )}
                  {s && s.notes > 0 && <span className="badge badge-notes">{s.notes} ✎</span>}
                </span>
              </motion.button>
            )
          })}
        </div>
        <label className="settings">
          Start pracy
          <input
            type="time"
            value={workStart}
            onChange={(e) => {
              setWorkStart(e.target.value)
              window.api.setSettings({ workStart: e.target.value })
            }}
          />
        </label>
      </aside>
      <main className="panel">
        <AnimatePresence mode="wait">
          <motion.div
            key={selected}
            className="panel-inner"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.18 }}
          >
            <h2 className="panel-title">{dayLabel(selected)}</h2>
            <Todos
              date={selected}
              todos={todos}
              notes={notes}
              onChange={reload}
              onOpenNote={setOpenNoteId}
              highlightId={highlightId}
            />
            <Notes
              date={selected}
              notes={notes}
              openNoteId={openNoteId}
              onOpen={setOpenNoteId}
              onChange={reload}
            />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
