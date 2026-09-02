// Serwer MCP (stdio) — pełny dostęp do todosów i notatek TooDooLoo.
// Działa na tych samych plikach co appka; appka nie musi być uruchomiona.
// Rejestracja: claude mcp add --scope user toodooloo -- node <repo>/out/main/mcp.js
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { homedir } from 'os'
import { join } from 'path'
import * as store from '../shared/store'
import { todayStr } from '../shared/core'

store.setDataDir(
  process.env.TOODOOLOO_DATA_DIR ||
    join(homedir(), 'Library', 'Application Support', 'TooDooLoo', 'data')
)

const urgency = z
  .enum(['immediate', 'high', 'medium', 'low', 'before-work'])
  .describe('Pilność: immediate (co 3 min), high (30 min), medium (1h), low (4h), before-work')
const dateArg = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Dzień YYYY-MM-DD')

const json = (x: unknown): { content: { type: 'text'; text: string }[] } => ({
  content: [{ type: 'text', text: JSON.stringify(x, null, 2) }]
})
const fail = (msg: string): { content: { type: 'text'; text: string }[]; isError: true } => ({
  content: [{ type: 'text', text: msg }],
  isError: true
})

const server = new McpServer({ name: 'toodooloo', version: '1.0.0' })

// --- todosy ---

server.registerTool(
  'list_todos',
  {
    description:
      'Listuje todosy. Bez date zwraca wszystkie. Nieodznaczone todosy z przeszłości rollują się na dziś.',
    inputSchema: { date: dateArg.optional() }
  },
  async ({ date }) => {
    store.rollover()
    return json(store.loadTodos().filter((t) => !date || t.date === date))
  }
)

server.registerTool(
  'add_todo',
  {
    description: 'Dodaje todo. Domyślnie na dziś, pilność medium.',
    inputSchema: {
      text: z.string().min(1),
      date: dateArg.optional(),
      urgency: urgency.optional(),
      noteId: z.string().optional().describe('Id notatki do powiązania'),
      url: z.string().optional().describe('Link http(s) podpięty do todosa')
    }
  },
  async ({ text, date, urgency: u, noteId, url }) => {
    let todo = store.addTodo({ text, date: date ?? todayStr(), urgency: u ?? 'medium' })
    if (noteId || url) todo = store.updateTodo(todo.id, { noteId, url })!
    return json(todo)
  }
)

server.registerTool(
  'update_todo',
  {
    description: 'Zmienia todo: treść, done (odznaczenie), pilność, dzień, powiązaną notatkę.',
    inputSchema: {
      id: z.string(),
      text: z.string().optional(),
      done: z.boolean().optional(),
      urgency: urgency.optional(),
      date: dateArg.optional(),
      noteId: z.string().optional().describe('Pusty string odpina notatkę'),
      url: z.string().optional().describe('Link http(s); pusty string odpina'),
      color: z.string().optional().describe('Kolor tożsamości (hex); pusty przywraca automatyczny')
    }
  },
  async ({ id, ...patch }) => {
    const updated = store.updateTodo(
      id,
      Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))
    )
    return updated ? json(updated) : fail(`Nie ma todosa o id ${id}`)
  }
)

server.registerTool(
  'delete_todo',
  { description: 'Usuwa todo.', inputSchema: { id: z.string() } },
  async ({ id }) => {
    store.deleteTodo(id)
    return json({ deleted: id })
  }
)

// --- tracking czasu ---

server.registerTool(
  'start_tracking',
  {
    description:
      'Startuje timer na todosie (jak w Timematorze). Jedyny timer w systemie — otwarta sesja na innym todosie jest zamykana.',
    inputSchema: { id: z.string() }
  },
  async ({ id }) => {
    const todo = store.startTracking(id)
    return todo ? json(todo) : fail(`Nie ma todosa o id ${id} (albo jest zrobiony)`)
  }
)

server.registerTool(
  'stop_tracking',
  { description: 'Zatrzymuje chodzący timer (gdziekolwiek jest).', inputSchema: {} },
  async () => {
    store.stopTracking()
    return json({ stopped: true })
  }
)

// --- notatki ---

server.registerTool(
  'list_notes',
  {
    description:
      'Listuje metadane wszystkich notatek (markdown). Notatki dnia mają id day-YYYY-MM-DD; parentId wskazuje podstronę.',
    inputSchema: {}
  },
  async () => json(store.listNotes())
)

server.registerTool(
  'get_note',
  { description: 'Pobiera notatkę (metadane + treść markdown).', inputSchema: { id: z.string() } },
  async ({ id }) => {
    const note = store.getNote(id)
    return note ? json(note) : fail(`Nie ma notatki o id ${id}`)
  }
)

server.registerTool(
  'create_note',
  {
    description: 'Tworzy notatkę. parentId robi z niej podstronę innej notatki.',
    inputSchema: {
      title: z.string().min(1),
      date: dateArg.optional(),
      parentId: z.string().optional(),
      body: z.string().optional().describe('Treść markdown')
    }
  },
  async ({ title, date, parentId, body }) => {
    const meta = store.createNote({ title, date: date ?? todayStr(), parentId })
    if (body) store.saveNote(meta.id, { body })
    return json(meta)
  }
)

server.registerTool(
  'update_note',
  {
    description: 'Zmienia tytuł, treść (markdown) i/lub rodzica notatki.',
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      body: z.string().optional(),
      parentId: z.string().optional().describe('Przenosi pod inną notatkę; pusty string odpina na top-level')
    }
  },
  async ({ id, title, body, parentId }) => {
    if (!store.getNote(id)) return fail(`Nie ma notatki o id ${id}`)
    store.saveNote(id, { title, body, parentId })
    return json(store.getNote(id))
  }
)

server.registerTool(
  'delete_note',
  { description: 'Usuwa notatkę.', inputSchema: { id: z.string() } },
  async ({ id }) => {
    store.deleteNote(id)
    return json({ deleted: id })
  }
)

// --- notatka dnia ---

server.registerTool(
  'get_day_note',
  {
    description: 'Pobiera notatkę dnia (dziennik pod todosami). Domyślnie dzisiejszą.',
    inputSchema: { date: dateArg.optional() }
  },
  async ({ date }) => {
    const d = date ?? todayStr()
    return json({ date: d, body: store.getNote(`day-${d}`)?.body ?? '' })
  }
)

server.registerTool(
  'set_day_note',
  {
    description: 'Ustawia treść (markdown) notatki dnia. Domyślnie dzisiejszej. Nadpisuje całość.',
    inputSchema: { body: z.string(), date: dateArg.optional() }
  },
  async ({ body, date }) => {
    const d = date ?? todayStr()
    store.saveDayNote(d, body)
    return json({ date: d, saved: true })
  }
)

server.connect(new StdioServerTransport())
