import { contextBridge, ipcRenderer } from 'electron'
import type { Todo, NoteMeta, DaySummary, Urgency } from '../shared/core'

export const api = {
  listTodos: (date: string): Promise<Todo[]> => ipcRenderer.invoke('todos:list', date),
  addTodo: (input: { text: string; date: string; urgency: Urgency }): Promise<Todo> =>
    ipcRenderer.invoke('todos:add', input),
  updateTodo: (id: string, patch: Partial<Todo>): Promise<Todo | null> =>
    ipcRenderer.invoke('todos:update', id, patch),
  deleteTodo: (id: string): Promise<void> => ipcRenderer.invoke('todos:delete', id),
  daysSummary: (): Promise<Record<string, DaySummary>> => ipcRenderer.invoke('days:summary'),
  listNotes: (): Promise<NoteMeta[]> => ipcRenderer.invoke('notes:list'),
  getNote: (id: string): Promise<{ meta: NoteMeta; body: string } | null> =>
    ipcRenderer.invoke('notes:get', id),
  createNote: (input: { title: string; date: string; parentId?: string }): Promise<NoteMeta> =>
    ipcRenderer.invoke('notes:create', input),
  saveNote: (id: string, patch: { title?: string; body?: string }): Promise<void> =>
    ipcRenderer.invoke('notes:save', id, patch),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('notes:delete', id)
}

contextBridge.exposeInMainWorld('api', api)
