import { test, expect } from '@playwright/test'
import { weekBlocks, Todo } from '../src/shared/core'

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
  expect(blocks[0]).toMatchObject({ date: D1, startMin: 22 * 60, endMin: 24 * 60 })
  expect(blocks[1]).toMatchObject({ date: D2, startMin: 0, endMin: 90 })
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
