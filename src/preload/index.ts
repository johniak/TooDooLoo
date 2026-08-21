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
  getSettings: (): Promise<{ workStart: string }> => ipcRenderer.invoke('settings:get'),
  setSettings: (s: { workStart: string }): Promise<void> => ipcRenderer.invoke('settings:set', s),
  onOpenTodo: (cb: (p: { id: string; date: string }) => void): (() => void) => {
    const handler = (_e: unknown, p: { id: string; date: string }): void => cb(p)
    ipcRenderer.on('open-todo', handler)
    return () => ipcRenderer.removeListener('open-todo', handler)
  },
  onDataChanged: (cb: () => void): (() => void) => {
    ipcRenderer.on('data-changed', cb)
    return () => ipcRenderer.removeListener('data-changed', cb)
  },
  listNotes: (): Promise<NoteMeta[]> => ipcRenderer.invoke('notes:list'),
  getNote: (id: string): Promise<{ meta: NoteMeta; body: string } | null> =>
    ipcRenderer.invoke('notes:get', id),
  createNote: (input: { title: string; date: string; parentId?: string }): Promise<NoteMeta> =>
    ipcRenderer.invoke('notes:create', input),
  saveNote: (id: string, patch: { title?: string; body?: string }): Promise<void> =>
    ipcRenderer.invoke('notes:save', id, patch),
  saveDayNote: (date: string, body: string): Promise<void> =>
    ipcRenderer.invoke('notes:saveDay', date, body),
  deleteNote: (id: string): Promise<void> => ipcRenderer.invoke('notes:delete', id)
}

contextBridge.exposeInMainWorld('api', api)
