export type Urgency = 'immediate' | 'high' | 'medium' | 'low' | 'before-work'

export type Todo = {
  id: string
  text: string
  date: string // YYYY-MM-DD
  done: boolean
  urgency: Urgency
  noteId?: string
  createdAt: string
}

export type NoteMeta = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  parentId?: string
}

export type DaySummary = { todos: number; done: number; notes: number }

export const URGENCIES: { value: Urgency; label: string; color: string }[] = [
  { value: 'immediate', label: 'Natychmiast', color: '#ff4d6d' },
  { value: 'high', label: 'Pilne', color: '#ff9f43' },
  { value: 'medium', label: 'Średnie', color: '#feca57' },
  { value: 'low', label: 'Luźne', color: '#1dd1a1' },
  { value: 'before-work', label: 'Przed pracą', color: '#54a0ff' }
]

export function todayStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

const INTERVAL_MIN: Record<Exclude<Urgency, 'before-work'>, number> = {
  immediate: 3,
  high: 30,
  medium: 60,
  low: 240
}

/** Todosy, o których trzeba teraz przypomnieć. lastNotified: id -> epoch ms. */
export function dueReminders(
  todos: Todo[],
  now: Date,
  lastNotified: Map<string, number>,
  workStart = '09:00'
): Todo[] {
  const today = todayStr(now)
  return todos.filter((t) => {
    if (t.done || t.date !== today) return false
    const last = lastNotified.get(t.id)
    if (t.urgency === 'before-work') {
      const [h, m] = workStart.split(':').map(Number)
      const start = new Date(now)
      start.setHours(h, m, 0, 0)
      const diff = start.getTime() - now.getTime()
      // ponytail: "raz" trzymane w pamięci procesu — po restarcie appki może przypomnieć ponownie
      return diff > 0 && diff <= 30 * 60_000 && last === undefined
    }
    if (last === undefined) return true
    return now.getTime() - last >= INTERVAL_MIN[t.urgency] * 60_000
  })
}
