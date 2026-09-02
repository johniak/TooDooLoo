import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence, MotionConfig } from 'framer-motion'
import { Todo, NoteMeta, DaySummary, todayStr, dayLabel, secondsOnDay, fmtDur } from '../../shared/core'
import Todos from './components/Todos'
import Notes from './components/Notes'
import DayNote from './components/DayNote'
import Settings, { SettingsValues } from './components/Settings'
import Timeline from './components/Timeline'
import Reports from './components/Reports'

// ikonki stopki sidebara — jedna kreska, currentColor, spójne z Ink & Ember
const ICON: Record<'timeline' | 'reports' | 'notes' | 'settings', React.JSX.Element> = {
  timeline: (
    <svg className="side-ico" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1.75" y="2.25" width="12.5" height="11.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="4.2" y="4.8" width="2.8" height="4.4" rx="0.8" fill="currentColor" />
      <rect x="8.9" y="6.8" width="2.8" height="4.4" rx="0.8" fill="currentColor" />
    </svg>
  ),
  reports: (
    <svg className="side-ico" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="8.2" width="3" height="5.6" rx="0.9" fill="currentColor" />
      <rect x="6.5" y="3.2" width="3" height="10.6" rx="0.9" fill="currentColor" />
      <rect x="11" y="5.8" width="3" height="8" rx="0.9" fill="currentColor" />
    </svg>
  ),
  notes: (
    <svg className="side-ico" viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2.75" y="1.75" width="10.5" height="12.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <line x1="5.4" y1="5.4" x2="10.6" y2="5.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.4" y1="8" x2="10.6" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="5.4" y1="10.6" x2="8.4" y2="10.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  ),
  settings: (
    <svg className="side-ico" viewBox="0 0 16 16" aria-hidden="true">
      <line x1="2" y1="4.2" x2="14" y2="4.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="8" x2="14" y2="8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="2" y1="11.8" x2="14" y2="11.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="10.2" cy="4.2" r="1.9" fill="var(--surface-2, #211B15)" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5.2" cy="8" r="1.9" fill="var(--surface-2, #211B15)" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="11.2" cy="11.8" r="1.9" fill="var(--surface-2, #211B15)" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

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
  const [view, setView] = useState<'day' | 'notes' | 'settings' | 'timeline' | 'reports'>('day')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [settings, setSettingsState] = useState<SettingsValues>({
    workStart: '09:00',
    workEnd: '17:00',
    showDock: true,
    azureBase: '',
    githubBase: ''
  })

  useEffect(() => {
    window.api.getSettings().then(setSettingsState)
    const flash = (id: string, date: string): void => {
      setSelected(date)
      setView('day')
      setOpenNoteId(null)
      setHighlightId(id)
      setTimeout(() => setHighlightId(null), 2500)
    }
    // #N kliknięte w notatce (dekoracja refLinks) — event zamiast wiercenia propsów przez edytory
    const byNum = async (e: Event): Promise<void> => {
      const t = (await window.api.listAllTodos()).find((x) => x.num === (e as CustomEvent).detail)
      if (t) flash(t.id, t.date)
    }
    window.addEventListener('open-todo-num', byNum)
    // [[Tytuł]] kliknięty w notatce — otwiera po tytule; nieistniejąca powstaje jako podstrona gospodarza
    const byTitle = async (e: Event): Promise<void> => {
      const detail = (e as CustomEvent).detail as { title: string; parentId?: string }
      const title = detail.title.trim()
      const all = await window.api.listNotes()
      let note = all.find(
        (n) => !n.id.startsWith('day-') && n.title.trim().toLowerCase() === title.toLowerCase()
      )
      note ??= await window.api.createNote({ title, date: todayStr(), parentId: detail.parentId })
      setView('notes')
      setOpenNoteId(note.id)
    }
    window.addEventListener('open-note-title', byTitle)
    const unsub = window.api.onOpenTodo(({ id, date }) => flash(id, date))
    return () => {
      window.removeEventListener('open-todo-num', byNum)
      window.removeEventListener('open-note-title', byTitle)
      unsub()
    }
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
            className={`day timeline-link ${view === 'timeline' ? 'day-active' : ''}`}
            onClick={() => {
              setView('timeline')
              setOpenNoteId(null)
            }}
          >
            <span className="day-label">{ICON.timeline} Oś czasu</span>
          </button>
          <button
            className={`day reports-link ${view === 'reports' ? 'day-active' : ''}`}
            onClick={() => {
              setView('reports')
              setOpenNoteId(null)
            }}
          >
            <span className="day-label">{ICON.reports} Raport</span>
          </button>
          <button
            className={`day notes-link ${view === 'notes' ? 'day-active' : ''}`}
            onClick={() => {
              setView('notes')
              setOpenNoteId(null)
            }}
          >
            <span className="day-label">{ICON.notes} Notatki</span>
            {realNotes.length > 0 && <span className="badge">{realNotes.length}</span>}
          </button>
          <button
            className={`day settings-link ${view === 'settings' ? 'day-active' : ''}`}
            onClick={() => {
              setView('settings')
              setOpenNoteId(null)
            }}
          >
            <span className="day-label">{ICON.settings} Ustawienia</span>
          </button>
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
                    <DayFuse todos={todos} workStart={settings.workStart} workEnd={settings.workEnd} date={selected} />
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
              ) : view === 'notes' ? (
                <Notes
                  notes={realNotes}
                  dayNotes={notes.filter((n) => n.id.startsWith('day-'))}
                  openNoteId={openNoteId}
                  onOpen={setOpenNoteId}
                  onOpenDay={(date) => {
                    setSelected(date)
                    setView('day')
                    setOpenNoteId(null)
                  }}
                  onChange={reload}
                />
              ) : view === 'timeline' || view === 'reports' ? (
                (() => {
                  const openTodo = (id: string, date: string): void => {
                    setSelected(date)
                    setView('day')
                    setHighlightId(id)
                    setTimeout(() => setHighlightId(null), 2500)
                  }
                  return view === 'timeline' ? (
                    <Timeline workStart={settings.workStart} workEnd={settings.workEnd} onOpenTodo={openTodo} />
                  ) : (
                    <Reports onOpenTodo={openTodo} />
                  )
                })()
              ) : (
                <Settings
                  values={settings}
                  onSave={(s: SettingsValues) => {
                    setSettingsState(s)
                    window.api.setSettings(s)
                  }}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </MotionConfig>
  )
}
