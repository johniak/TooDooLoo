import { test, expect } from '@playwright/test'
import { dueReminders, todayStr, Todo } from '../src/shared/core'

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
