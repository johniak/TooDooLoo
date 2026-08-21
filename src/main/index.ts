import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import * as storage from './storage'
import { startReminders } from './reminders'
import { DaySummary, Todo } from '../shared/core'

// w testach izolujemy też userData (localStorage itd.), nie tylko pliki danych
if (process.env.TOODOOLOO_DATA_DIR) {
  app.setPath('userData', join(process.env.TOODOOLOO_DATA_DIR, 'electron'))
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('todos:list', (_e, date: string) =>
    storage.loadTodos().filter((t) => t.date === date)
  )
  ipcMain.handle('todos:add', (_e, input) => storage.addTodo(input))
  ipcMain.handle('todos:update', (_e, id: string, patch) => storage.updateTodo(id, patch))
  ipcMain.handle('todos:delete', (_e, id: string) => storage.deleteTodo(id))
  ipcMain.handle('days:summary', () => {
    const summary: Record<string, DaySummary> = {}
    const day = (d: string): DaySummary =>
      (summary[d] ??= { todos: 0, done: 0, notes: 0 })
    for (const t of storage.loadTodos() as Todo[]) {
      day(t.date).todos++
      if (t.done) day(t.date).done++
    }
    for (const n of storage.listNotes()) day(n.date).notes++
    return summary
  })
  ipcMain.handle('settings:get', () => storage.loadSettings())
  ipcMain.handle('settings:set', (_e, s) => storage.saveSettings(s))
  ipcMain.handle('notes:list', () => storage.listNotes())
  ipcMain.handle('notes:get', (_e, id: string) => storage.getNote(id))
  ipcMain.handle('notes:create', (_e, input) => storage.createNote(input))
  ipcMain.handle('notes:save', (_e, id: string, patch) => storage.saveNote(id, patch))
  ipcMain.handle('notes:delete', (_e, id: string) => storage.deleteNote(id))
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.toodooloo')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  storage.rollover()
  registerIpc()
  startReminders()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
