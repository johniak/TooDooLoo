import { test, expect } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { dueReminders, nextCheckpoint, todayStr, Todo } from '../src/shared/core'
import { addTodo, loadTodos, resumeSession, setDataDir, startTracking, stopTracking } from '../src/shared/store'

const base = (over: Partial<Todo>): Todo => ({
  id: 'x',
  text: 't',
  date: todayStr(),
  done: false,
  urgency: 'immediate',
  createdAt: '',
  ...over
})

test('dueReminders: interwały wg pilności', () => {
  // dzisiaj w południe — todosy z base() mają dzisiejszą datę
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const todos = [
    base({ id: 'a', urgency: 'immediate' }),
    base({ id: 'b', urgency: 'high' }),
    base({ id: 'c', urgency: 'low' })
  ]
  // nigdy nie powiadamiane -> wszystkie due
  expect(dueReminders(todos, now, new Map()).map((t) => t.id)).toEqual(['a', 'b', 'c'])

  // 5 minut po powiadomieniu: tylko immediate (3 min) znów due
  const last = new Map(todos.map((t) => [t.id, now.getTime() - 5 * 60_000]))
  expect(dueReminders(todos, now, last).map((t) => t.id)).toEqual(['a'])
})

test('nextCheckpoint: koniec dnia; start po końcu → jutro; potwierdzenie → +5 min', () => {
  const at = (h: number, m: number): Date => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d
  }
  // start w godzinach pracy → dzisiejszy koniec dnia
  expect(nextCheckpoint({ start: at(16, 0).toISOString() }, '17:00')).toBe(at(17, 0).getTime())
  // start po końcu dnia → jutrzejszy koniec (wieczorna praca bez pingów)
  const tomorrow = at(17, 0)
  tomorrow.setDate(tomorrow.getDate() + 1)
  expect(nextCheckpoint({ start: at(20, 0).toISOString() }, '17:00')).toBe(tomorrow.getTime())
  // po „tak, pracuję" → ping za 5 min
  expect(
    nextCheckpoint({ start: at(16, 0).toISOString(), confirmedUntil: at(17, 0).toISOString() }, '17:00')
  ).toBe(at(17, 5).getTime())
})

test('resumeSession: wymazuje pauzę checkpointu bez szwu, ale nie ręczny stop', () => {
  setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'toodooloo-resume-')))
  const t = addTodo({ text: 'x', date: todayStr(), urgency: 'medium' })
  startTracking(t.id)
  const cut = new Date().toISOString()
  stopTracking(cut)
  resumeSession(t.id, cut)
  const s = loadTodos()[0].sessions![0]
  expect(s.end).toBeUndefined() // sesja znowu biegnie, jakby pauzy nie było
  expect(s.confirmedUntil).toBe(cut)
  // stop z innym timestampem (ręczny/done) nie daje się wymazać starym checkpointem
  stopTracking()
  resumeSession(t.id, cut)
  expect(loadTodos()[0].sessions![0].end).toBeTruthy()
})

test('dueReminders: pomija zrobione i inne dni', () => {
  const now = new Date()
  const todos = [base({ done: true }), base({ id: 'y', date: '2000-01-01' })]
  expect(dueReminders(todos, now, new Map())).toEqual([])
})

test('dueReminders: before-work tylko raz, w oknie 30 min przed pracą', () => {
  const todo = base({ urgency: 'before-work' })
  const at = (h: number, m: number): Date => {
    const d = new Date()
    d.setHours(h, m, 0, 0)
    return d
  }
  expect(dueReminders([todo], at(8, 45), new Map(), '09:00')).toHaveLength(1)
  expect(dueReminders([todo], at(8, 0), new Map(), '09:00')).toHaveLength(0) // za wcześnie
  expect(dueReminders([todo], at(9, 30), new Map(), '09:00')).toHaveLength(0) // po starcie
  expect(dueReminders([todo], at(8, 45), new Map([['x', 1]]), '09:00')).toHaveLength(0) // już było
})
