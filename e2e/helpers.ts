import { _electron as electron, ElectronApplication, Page } from '@playwright/test'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Todo } from '../src/shared/core'

export async function launch(
  opts: { seedTodos?: Partial<Todo>[]; env?: Record<string, string> } = {}
): Promise<{ app: ElectronApplication; page: Page; dataDir: string }> {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toodooloo-'))
  if (opts.seedTodos) {
    const todos = opts.seedTodos.map((t, i) => ({
      id: `seed-${i}`,
      text: 'seed',
      done: false,
      urgency: 'medium',
      createdAt: new Date().toISOString(),
      ...t
    }))
    fs.writeFileSync(path.join(dataDir, 'todos.json'), JSON.stringify(todos))
  }
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: { ...process.env, TOODOOLOO_DATA_DIR: dataDir, ...opts.env } as Record<string, string>
  })
  const page = await app.firstWindow()
  return { app, page, dataDir }
}

export function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, '0')}`
}
