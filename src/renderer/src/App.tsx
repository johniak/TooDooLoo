import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { Todo, NoteMeta, DaySummary, todayStr, dayLabel, secondsOnDay, fmtDur } from '../../shared/core'
import Todos from './components/Todos'
import Notes from './components/Notes'
import DayNote from './components/DayNote'

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

// sygnatura: lont dnia — wypala się w czasie pracy, todosy to punkty na osi
function DayFuse({
  todos,
  workStart,
  workEnd,
  date
}: {
  todos: Todo[]
  workStart: string
  workEnd: string
  date: string
}): React.JSX.Element {
  const isToday = date === todayStr()
  const [, setTick] = useState(0)
  useEffect(() => {
    const i = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(i)
  }, [])
  let pct = 0
  if (isToday) {
    const toMin = (t: string): number => {
      const [h, m] = t.split(':').map(Number)
      return h * 60 + m
    }
    const now = new Date()
    const span = Math.max(1, toMin(workEnd) - toMin(workStart))
    pct = Math.min(1, Math.max(0, (now.getHours() * 60 + now.getMinutes() - toMin(workStart)) / span))
  }
  const done = todos.filter((t) => t.done).length
  if (!isToday && todos.length === 0) return <></>
  return (
    <div className="fuse">
      <div className="fuse-track">
        {isToday && <div className="fuse-burn" style={{ width: `${pct * 100}%` }} />}
        {todos.map((t, i) => (
          <span
            key={t.id}
            className={`fuse-tick ${t.done ? 'fuse-tick-done' : ''}`}
            style={{ left: `${((i + 1) / (todos.length + 1)) * 100}%` }}
          />
        ))}
      </div>
      {todos.length > 0 && (
        <span className="fuse-label">
          {done}/{todos.length}
          {(() => {
            const secs = todos.reduce((a, t) => a + secondsOnDay(t, date), 0)
            return secs >= 60 ? ` · ${fmtDur(secs)}` : ''
          })()}
        </span>
      )}
    </div>
  )
}

export default function App(): React.JSX.Element {
  const [selected, setSelected] = useState(todayStr())
  const [summary, setSummary] = useState<Record<string, DaySummary>>({})
  const [todos, setTodos] = useState<Todo[]>([])
  const [notes, setNotes] = useState<NoteMeta[]>([])
  const [openNoteId, setOpenNoteId] = useState<string | null>(null)
  const [view, setView] = useState<'day' | 'notes'>('day')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [workStart, setWorkStart] = useState('09:00')
  const [workEnd, setWorkEnd] = useState('17:00')
  const [showDock, setShowDock] = useState(true)

  useEffect(() => {
    window.api.getSettings().then((s) => {
      setWorkStart(s.workStart)
      setWorkEnd(s.workEnd)
      setShowDock(s.showDock)
    })
    return window.api.onOpenTodo(({ id, date }) => {
      setSelected(date)
      setView('day')
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
    return window.api.onDataChanged(reload)
  }, [reload])

  const today = todayStr()
  // notatki dnia (day-*) żyją inline w widoku dnia, nie w eksploratorze
  const realNotes = notes.filter((n) => !n.id.startsWith('day-'))

  return (
    <MotionConfig reducedMotion="user">
      <div className="app">
        <aside className="sidebar">
          <h1 className="logo">
            TooDooLoo<span className="logo-ember" />
          </h1>
          <div className="days">
            {dayList(summary).map((date) => {
              const s = summary[date]
              const left = s ? s.todos - s.done : 0
              return (
                <motion.button
                  key={date}
                  layout
                  whileTap={{ scale: 0.97 }}
                  className={`day ${date === selected && view === 'day' ? 'day-active' : ''} ${date === today ? 'day-today' : ''}`}
                  onClick={() => {
                    setSelected(date)
                    setView('day')
                    setOpenNoteId(null)
                  }}
                  data-date={date}
                >
                  <span className="day-label">{dayLabel(date)}</span>
                  <span className="day-badges">
                    {s && s.notes > 0 && <span className="note-dot" title={`${s.notes} notatki`} />}
                    {left > 0 && <span className="badge">{left}</span>}
                    {s && s.todos > 0 && left === 0 && <span className="badge badge-done">✓</span>}
                  </span>
                </motion.button>
              )
            })}
          </div>
          <button
            className={`day notes-link ${view === 'notes' ? 'day-active' : ''}`}
            onClick={() => {
              setView('notes')
              setOpenNoteId(null)
            }}
          >
            <span className="day-label">▤ Notatki</span>
            {realNotes.length > 0 && <span className="badge">{realNotes.length}</span>}
          </button>
          <label className="settings settings-start">
            Start pracy
            <input
              type="time"
              value={workStart}
              onChange={(e) => {
                setWorkStart(e.target.value)
                window.api.setSettings({ workStart: e.target.value, workEnd, showDock })
              }}
            />
          </label>
          <label className="settings settings-end">
            Koniec pracy
            <input
              type="time"
              value={workEnd}
              onChange={(e) => {
                setWorkEnd(e.target.value)
                window.api.setSettings({ workStart, workEnd: e.target.value, showDock })
              }}
            />
          </label>
          <label className="settings settings-dock">
            W Docku
            <input
              type="checkbox"
              checked={showDock}
              onChange={(e) => {
                setShowDock(e.target.checked)
                window.api.setSettings({ workStart, workEnd, showDock: e.target.checked })
              }}
            />
          </label>
        </aside>
        <main className="panel">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${view}:${selected}:${openNoteId ?? ''}`}
              className="panel-inner"
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.18 }}
            >
              {view === 'day' ? (
                <>
                  <header className="day-header">
                    <h2 className="panel-title">{dayLabel(selected)}</h2>
                    <DayFuse todos={todos} workStart={workStart} workEnd={workEnd} date={selected} />
                  </header>
                  <Todos
                    date={selected}
                    todos={todos}
                    notes={realNotes}
                    onChange={reload}
                    onOpenNote={(id) => {
                      setOpenNoteId(id)
                      setView('notes')
                    }}
                    highlightId={highlightId}
                  />
                  <DayNote date={selected} />
                </>
              ) : (
                <Notes
                  notes={realNotes}
                  openNoteId={openNoteId}
                  onOpen={setOpenNoteId}
                  onChange={reload}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  )
}
