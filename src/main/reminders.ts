import { BrowserWindow, Notification } from 'electron'
import fs from 'fs'
import { dueReminders, nextCheckpoint, trackingSince, Todo, URGENCIES } from '../shared/core'
import { loadSettings, loadTodos, resumeSession, rollover, stopTracking } from '../shared/store'

const lastNotified = new Map<string, number>()

function notify(todo: Todo): void {
  const label = URGENCIES.find((u) => u.value === todo.urgency)!.label
  // ponytail: plik zamiast powiadomienia w testach e2e
  const file = process.env.TOODOOLOO_NOTIFY_FILE
  if (file) {
    fs.appendFileSync(file, `${todo.text}\n`)
    return
  }
  const n = new Notification({ title: `TooDooLoo — ${label}`, body: todo.text })
  n.on('click', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.show()
      win.focus()
      win.webContents.send('open-todo', { id: todo.id, date: todo.date })
    }
  })
  n.show()
}

/**
 * Checkpoint końca dnia pracy: pauzuje sesję timestampem checkpointu i pyta „pracujesz jeszcze?".
 * Klik = tak → pauza jest wymazywana (sesja biegnie bez szwu), następny ping za 5 min.
 * Checkpoint zaspany (sen/wyłączenie) tniemy wstecznie i NIE pytamy — play jest zawsze manualny.
 */
function checkWorkEnd(now: Date): void {
  const todo = loadTodos().find((t) => trackingSince(t))
  if (!todo) return
  const due = nextCheckpoint(todo.sessions!.at(-1)!, loadSettings().workEnd)
  if (now.getTime() < due) return
  const dueIso = new Date(due).toISOString()
  stopTracking(dueIso)
  if (now.getTime() - due >= 90_000) return // wstecznie — bez pytania
  const file = process.env.TOODOOLOO_NOTIFY_FILE
  if (file) {
    fs.appendFileSync(file, `checkpoint:${todo.text}\n`)
    return
  }
  const n = new Notification({
    title: 'TooDooLoo — koniec pracy',
    body: `Pracujesz jeszcze nad „${todo.text}"? Kliknij, żeby liczyć dalej.`
  })
  n.on('click', () => resumeSession(todo.id, dueIso))
  n.show()
}

export function startReminders(): void {
  const tick = Number(process.env.TOODOOLOO_TICK_MS) || 60_000
  setInterval(() => {
    rollover() // łapie też zmianę dnia o północy przy działającej appce
    const now = new Date()
    checkWorkEnd(now)
    for (const todo of dueReminders(loadTodos(), now, lastNotified, loadSettings().workStart)) {
      notify(todo)
      lastNotified.set(todo.id, now.getTime())
    }
  }, tick)
}
