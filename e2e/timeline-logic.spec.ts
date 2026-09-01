import { test, expect } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { weekBlocks, todayStr, Todo } from '../src/shared/core'
import {
  addTodo,
  deleteSession,
  loadTodos,
  setDataDir,
  startTracking,
  stopTracking,
  updateSession
} from '../src/shared/store'

const D1 = '2026-01-05' // poniedziałek
const D2 = '2026-01-06'

const iso = (date: string, h: number, m = 0): string => {
  const [y, mo, d] = date.split('-').map(Number)
  return new Date(y, mo - 1, d, h, m).toISOString()
}

const todo = (id: string, sessions: Todo['sessions']): Todo => ({
  id,
  text: id,
  date: D1,
  done: false,
  urgency: 'medium',
  createdAt: '',
  sessions
})

test('weekBlocks: sesja przez północ jest cięta na dwa bloki', () => {
  const blocks = weekBlocks([todo('a', [{ start: iso(D1, 22), end: iso(D2, 1, 30) }])], [D1, D2])
  expect(blocks).toHaveLength(2)
  expect(blocks[0]).toMatchObject({ date: D1, startMin: 22 * 60, endMin: 24 * 60, isStart: true, isEnd: false })
  expect(blocks[1]).toMatchObject({ date: D2, startMin: 0, endMin: 90, isStart: false, isEnd: true })
})

test('updateSession: chroni koniec otwartej sesji i kolejność start<koniec', () => {
  setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'toodooloo-sess-')))
  const t = addTodo({ text: 'x', date: todayStr(), urgency: 'medium' })
  startTracking(t.id)
  // otwartej sesji nie można domknąć edycją
  expect(updateSession(t.id, 0, { end: new Date().toISOString() })).toBe(false)
  // ale start można cofnąć
  const earlier = new Date(Date.now() - 3600_000).toISOString()
  expect(updateSession(t.id, 0, { start: earlier })).toBe(true)
  expect(loadTodos()[0].sessions![0].start).toBe(earlier)
  stopTracking()
  // start za końcem odrzucony
  expect(updateSession(t.id, 0, { start: new Date(Date.now() + 3600_000).toISOString() })).toBe(false)
})

test('deleteSession: usuwa zamkniętą sesję, sesji w toku nie rusza', () => {
  setDataDir(fs.mkdtempSync(path.join(os.tmpdir(), 'toodooloo-del-')))
  const t = addTodo({ text: 'x', date: todayStr(), urgency: 'medium' })
  startTracking(t.id)
  expect(deleteSession(t.id, 0)).toBe(false) // leci — nie ruszamy
  stopTracking()
  expect(deleteSession(t.id, 0)).toBe(true)
  expect(loadTodos()[0].sessions).toBeUndefined()
})

test('weekBlocks: nakładki dostają sloty, rozłączne bloki pełną szerokość', () => {
  const blocks = weekBlocks(
    [
      todo('a', [{ start: iso(D1, 10), end: iso(D1, 11) }]),
      todo('b', [{ start: iso(D1, 10, 30), end: iso(D1, 11, 30) }]),
      todo('c', [{ start: iso(D1, 12), end: iso(D1, 13) }])
    ],
    [D1]
  )
  const [a, b, c] = ['a', 'b', 'c'].map((id) => blocks.find((x) => x.todoId === id)!)
  expect(a).toMatchObject({ lane: 0, lanes: 2 })
  expect(b).toMatchObject({ lane: 1, lanes: 2 })
  expect(c).toMatchObject({ lane: 0, lanes: 1 })
})

test('weekBlocks: otwarta sesja kończy się na „teraz" i jest oznaczona jako running', () => {
  const now = new Date(2026, 0, 5, 12, 0).getTime()
  const blocks = weekBlocks([todo('a', [{ start: iso(D1, 10) }])], [D1], now)
  expect(blocks).toHaveLength(1)
  expect(blocks[0]).toMatchObject({ startMin: 600, endMin: 720, running: true })
})
