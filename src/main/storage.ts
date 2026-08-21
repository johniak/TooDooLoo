import { app } from 'electron'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { Todo, NoteMeta, todayStr } from '../shared/core'

export function dataDir(): string {
  return process.env.TOODOOLOO_DATA_DIR || path.join(app.getPath('userData'), 'data')
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

/** Nieodznaczone todosy z przeszłości przechodzą na dziś. */
export function rollover(): void {
  const today = todayStr()
  const todos = loadTodos()
  let changed = false
  for (const t of todos) {
    if (!t.done && t.date < today) {
      t.date = today
      changed = true
    }
  }
  if (changed) saveTodos(todos)
}

export function addTodo(input: Pick<Todo, 'text' | 'date' | 'urgency'>): Todo {
  const todo: Todo = { id: randomUUID(), done: false, createdAt: new Date().toISOString(), ...input }
  saveTodos([...loadTodos(), todo])
  return todo
}

export function updateTodo(id: string, patch: Partial<Todo>): Todo | null {
  const todos = loadTodos()
  const todo = todos.find((t) => t.id === id)
  if (!todo) return null
  Object.assign(todo, patch, { id: todo.id })
  saveTodos(todos)
  return todo
}

export function deleteTodo(id: string): void {
  saveTodos(loadTodos().filter((t) => t.id !== id))
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

export function saveNote(id: string, patch: { title?: string; body?: string }): void {
  const note = getNote(id)
  if (!note) return
  if (patch.title !== undefined) note.meta.title = patch.title
  const body = patch.body !== undefined ? patch.body : note.body
  fs.writeFileSync(noteFile(id), serializeNote(note.meta, body))
}

export function deleteNote(id: string): void {
  fs.rmSync(noteFile(id), { force: true })
}
