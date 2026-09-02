import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Todo, NoteMeta, todayStr } from './core'

function closeOpenSession(t: Todo, end: string): boolean {
  const s = t.sessions?.at(-1)
  if (s && !s.end) {
    s.end = end
    return true
  }
  return false
}

// bez zależności od Electrona — używane przez main proces i serwer MCP
let dir = process.env.TOODOOLOO_DATA_DIR || ''

export function setDataDir(d: string): void {
  dir = d
}

export function dataDir(): string {
  if (!dir) throw new Error('data dir not set — call setDataDir() first')
  return dir
}
const todosFile = () => path.join(dataDir(), 'todos.json')
const notesDir = () => path.join(dataDir(), 'notes')

function ensureDirs(): void {
  fs.mkdirSync(notesDir(), { recursive: true })
}

// --- todos ---

export function loadTodos(): Todo[] {
  try {
    return JSON.parse(fs.readFileSync(todosFile(), 'utf8'))
  } catch {
    return []
  }
}

function saveTodos(todos: Todo[]): void {
  ensureDirs()
  fs.writeFileSync(todosFile(), JSON.stringify(todos, null, 2))
}

/** Nieodznaczone todosy z przeszłości przechodzą na dziś. Przy okazji backfill numerków #N. */
export function rollover(): void {
  const today = todayStr()
  const todos = loadTodos()
  let changed = false
  let next = Math.max(0, ...todos.map((t) => t.num ?? 0)) + 1
  for (const t of [...todos].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (t.num == null) {
      t.num = next++
      changed = true
    }
  }
  for (const t of todos) {
    if (!t.done && t.date < today) {
      t.rolledFrom ??= t.date // pamiętamy najstarszy dzień, kolejne rollovery go nie nadpisują
      t.date = today
      changed = true
    }
  }
  if (changed) saveTodos(todos)
}

export function addTodo(input: Pick<Todo, 'text' | 'date' | 'urgency'> & { url?: string }): Todo {
  const todos = loadTodos()
  const todo: Todo = {
    id: randomUUID(),
    num: Math.max(0, ...todos.map((t) => t.num ?? 0)) + 1,
    done: false,
    createdAt: new Date().toISOString(),
    ...input
  }
  saveTodos([...todos, todo])
  return todo
}

export function updateTodo(id: string, patch: Partial<Todo>): Todo | null {
  const todos = loadTodos()
  const todo = todos.find((t) => t.id === id)
  if (!todo) return null
  Object.assign(todo, patch, { id: todo.id })
  if (todo.done) closeOpenSession(todo, new Date().toISOString()) // zrobione = timer staje
  // tytuł notatki ticketa podąża za tekstem todosa
  if (patch.text && getNote(`todo-${todo.id}`)) saveNote(`todo-${todo.id}`, { title: todo.text })
  if (!todo.url) delete todo.url
  if (!todo.noteId) delete todo.noteId
  if (!todo.color) delete todo.color
  saveTodos(todos)
  return todo
}

/** Startuje timer na todosie; jedyny otwarty w systemie — inne sesje zamyka. */
export function startTracking(id: string): Todo | null {
  const now = new Date().toISOString()
  const todos = loadTodos()
  const todo = todos.find((t) => t.id === id)
  if (!todo || todo.done) return null
  for (const t of todos) closeOpenSession(t, now)
  ;(todo.sessions ??= []).push({ start: now })
  saveTodos(todos)
  return todo
}

/** Zamyka otwartą sesję, gdziekolwiek jest; endIso pozwala ciąć wstecznie (checkpoint zaspany). */
export function stopTracking(endIso: string = new Date().toISOString()): void {
  const todos = loadTodos()
  let changed = false
  for (const t of todos) changed = closeOpenSession(t, endIso) || changed
  if (changed) saveTodos(todos)
}

/** Edycja sesji z timeline'u. Koniec otwartej sesji jest nietykalny; start zawsze przed końcem. */
export function updateSession(
  todoId: string,
  idx: number,
  patch: { start?: string; end?: string }
): boolean {
  const todos = loadTodos()
  const s = todos.find((t) => t.id === todoId)?.sessions?.[idx]
  if (!s) return false
  const open = !s.end
  if (open && patch.end) return false
  const start = patch.start ?? s.start
  const end = open ? undefined : (patch.end ?? s.end)
  if (end && Date.parse(start) >= Date.parse(end)) return false
  if (open && Date.parse(start) > Date.now()) return false
  s.start = start
  if (end) s.end = end
  saveTodos(todos)
  return true
}

/** Usuwa zalogowaną sesję. Sesji w toku nie ruszamy — najpierw stop. */
export function deleteSession(todoId: string, idx: number): boolean {
  const todos = loadTodos()
  const t = todos.find((x) => x.id === todoId)
  const s = t?.sessions?.[idx]
  if (!t || !s || !s.end) return false
  t.sessions!.splice(idx, 1)
  if (t.sessions!.length === 0) delete t.sessions
  saveTodos(todos)
  return true
}

/** „Tak, pracuję": wymazuje pauzę checkpointu — sesja biegnie dalej bez szwu. */
export function resumeSession(id: string, checkpointIso: string): void {
  const todos = loadTodos()
  const session = todos.find((t) => t.id === id)?.sessions?.at(-1)
  if (!session || session.end !== checkpointIso) return // w międzyczasie stop/done — nie ruszamy
  delete session.end
  session.confirmedUntil = checkpointIso
  saveTodos(todos)
}

export function deleteTodo(id: string): void {
  saveTodos(loadTodos().filter((t) => t.id !== id))
}

// --- settings ---

export type Settings = {
  workStart: string
  workEnd: string
  showDock: boolean
  azureBase: string // baza linków AB#123 (np. https://dev.azure.com/org/proj/_workitems/edit)
  githubBase: string // baza linków GH#123 (np. https://github.com/owner/repo)
}
const DEFAULT_SETTINGS: Settings = {
  workStart: '09:00',
  workEnd: '17:00',
  showDock: true,
  azureBase: '',
  githubBase: ''
}
const settingsFile = (): string => path.join(dataDir(), 'settings.json')

export function loadSettings(): Settings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(s: Settings): void {
  ensureDirs()
  fs.writeFileSync(settingsFile(), JSON.stringify(s))
}

// --- notes: pliki md z frontmatterem ---

function parseNote(id: string, raw: string): { meta: NoteMeta; body: string } {
  const meta: NoteMeta = { id, title: '', date: todayStr() }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/)
  let body = raw
  if (m) {
    body = raw.slice(m[0].length)
    for (const line of m[1].split('\n')) {
      const [key, ...rest] = line.split(':')
      const value = rest.join(':').trim()
      if (key === 'title') meta.title = value
      else if (key === 'date') meta.date = value
      else if (key === 'parentId' && value) meta.parentId = value
    }
  }
  return { meta, body }
}

function serializeNote(meta: NoteMeta, body: string): string {
  const parent = meta.parentId ? `\nparentId: ${meta.parentId}` : ''
  return `---\ntitle: ${meta.title}\ndate: ${meta.date}${parent}\n---\n${body}`
}

const noteFile = (id: string): string => path.join(notesDir(), `${id}.md`)

export function listNotes(): NoteMeta[] {
  ensureDirs()
  return fs
    .readdirSync(notesDir())
    .filter((f) => f.endsWith('.md'))
    .map((f) => parseNote(f.slice(0, -3), fs.readFileSync(path.join(notesDir(), f), 'utf8')).meta)
}

export function getNote(id: string): { meta: NoteMeta; body: string } | null {
  try {
    return parseNote(id, fs.readFileSync(noteFile(id), 'utf8'))
  } catch {
    return null
  }
}

export function createNote(input: Pick<NoteMeta, 'title' | 'date'> & { parentId?: string }): NoteMeta {
  ensureDirs()
  const meta: NoteMeta = { id: randomUUID(), ...input }
  fs.writeFileSync(noteFile(meta.id), serializeNote(meta, ''))
  return meta
}

/** Czy `candidate` leży w poddrzewie notatki `ancestorId` (włącznie z nią samą). */
function inSubtree(candidate: string, ancestorId: string): boolean {
  let cur: string | undefined = candidate
  for (let i = 0; cur && i < 100; i++) {
    if (cur === ancestorId) return true
    cur = getNote(cur)?.meta.parentId
  }
  return false
}

export function saveNote(
  id: string,
  patch: { title?: string; body?: string; parentId?: string }
): void {
  const note = getNote(id)
  if (!note) return
  if (patch.title !== undefined) note.meta.title = patch.title
  if (patch.parentId !== undefined) {
    if (!patch.parentId) {
      delete note.meta.parentId // '' odpina — notatka wraca na top-level
    } else if (!inSubtree(patch.parentId, id)) {
      note.meta.parentId = patch.parentId // guard: nie wpinamy pod własne poddrzewo
    }
  }
  const body = patch.body !== undefined ? patch.body : note.body
  fs.writeFileSync(noteFile(id), serializeNote(note.meta, body))
}

export function deleteNote(id: string): void {
  fs.rmSync(noteFile(id), { force: true })
}

/** Notatka ticketa: jedna na todosa, id todo-<todoId>, tworzona przy pierwszym zapisie. */
export function saveTodoNote(todoId: string, body: string): void {
  ensureDirs()
  const todo = loadTodos().find((t) => t.id === todoId)
  fs.writeFileSync(
    noteFile(`todo-${todoId}`),
    serializeNote(
      { id: `todo-${todoId}`, title: todo?.text ?? 'Ticket', date: todo?.date ?? todayStr() },
      body
    )
  )
}

/** Notatka dnia: jedna na dzień, id deterministyczne, tworzona przy pierwszym zapisie. */
export function saveDayNote(date: string, body: string): void {
  ensureDirs()
  fs.writeFileSync(noteFile(`day-${date}`), serializeNote({ id: `day-${date}`, title: 'Notatka dnia', date }, body))
}
