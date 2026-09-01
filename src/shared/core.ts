export type Urgency = 'immediate' | 'high' | 'medium' | 'low' | 'before-work'

export type Session = { start: string; end?: string } // ISO; brak end = timer chodzi

export type Todo = {
  id: string
  text: string
  date: string // YYYY-MM-DD
  done: boolean
  urgency: Urgency
  noteId?: string
  url?: string // link http(s) podpięty do todosa
  rolledFrom?: string // YYYY-MM-DD — pierwotny dzień, z którego todos się przeturlał
  sessions?: Session[] // sesje trackingu czasu; max jedna otwarta w całym systemie
  createdAt: string
}

export type NoteMeta = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  parentId?: string
}

export type DaySummary = { todos: number; done: number; notes: number }

// paleta „żaru": im pilniej, tym goręcej; „przed pracą" = świt
export const URGENCIES: { value: Urgency; label: string; color: string }[] = [
  { value: 'immediate', label: 'Natychmiast', color: '#FF5F3D' },
  { value: 'high', label: 'Pilne', color: '#FF9950' },
  { value: 'medium', label: 'Średnie', color: '#E5B963' },
  { value: 'low', label: 'Luźne', color: '#9BA88B' },
  { value: 'before-work', label: 'Przed pracą', color: '#86A8C8' }
]

export const WEEKDAYS = ['Nd', 'Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So']

export function dayLabel(date: string): string {
  if (date === todayStr()) return 'Dzisiaj'
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${WEEKDAYS[dt.getDay()]} ${d}.${String(m).padStart(2, '0')}`
}

export function todayStr(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// --- tracking czasu ---

/** ISO startu otwartej sesji albo null. */
export function trackingSince(t: Todo): string | null {
  const s = t.sessions?.at(-1)
  return s && !s.end ? s.start : null
}

/** Łączny czas todosa w sekundach (otwarta sesja liczona do teraz). */
export function trackedSeconds(t: Todo, now: number = Date.now()): number {
  return (t.sessions ?? []).reduce(
    (sum, s) => sum + ((s.end ? Date.parse(s.end) : now) - Date.parse(s.start)) / 1000,
    0
  )
}

/** Czas todosa przypadający na dany dzień (sesje cięte granicami doby). */
export function secondsOnDay(t: Todo, date: string, now: number = Date.now()): number {
  const [y, m, d] = date.split('-').map(Number)
  const dayStart = new Date(y, m - 1, d).getTime()
  const dayEnd = dayStart + 24 * 3600_000
  return (t.sessions ?? []).reduce((sum, s) => {
    const from = Math.max(Date.parse(s.start), dayStart)
    const to = Math.min(s.end ? Date.parse(s.end) : now, dayEnd)
    return sum + Math.max(0, to - from) / 1000
  }, 0)
}

/** 1:23:45 / 4:56 */
export function fmtClock(sec: number): string {
  const s = Math.floor(sec)
  const p = (n: number): string => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  return h > 0 ? `${h}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}` : `${Math.floor(s / 60)}:${p(s % 60)}`
}

/** 1h 24m / 12m */
export function fmtDur(sec: number): string {
  const m = Math.round(sec / 60)
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`
}

// kolor tożsamości zadania: stały hash z id na przygaszoną paletę pasującą do atramentu
const TASK_COLORS = ['#C96F4A', '#B08B4F', '#8FA05C', '#5F9E83', '#5C8FA8', '#7B7FB5', '#A06E9E', '#A8656B']

export function taskColor(id: string): string {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 997
  return TASK_COLORS[h % TASK_COLORS.length]
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
