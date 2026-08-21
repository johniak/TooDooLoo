import { BrowserWindow, Notification } from 'electron'
import fs from 'fs'
import { dueReminders, Todo, URGENCIES } from '../shared/core'
import { loadSettings, loadTodos, rollover } from '../shared/store'

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

export function startReminders(): void {
  const tick = Number(process.env.TOODOOLOO_TICK_MS) || 60_000
  setInterval(() => {
    rollover() // łapie też zmianę dnia o północy przy działającej appce
    const now = new Date()
    for (const todo of dueReminders(loadTodos(), now, lastNotified, loadSettings().workStart)) {
      notify(todo)
      lastNotified.set(todo.id, now.getTime())
    }
  }, tick)
}
