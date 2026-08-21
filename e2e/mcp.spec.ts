import { test, expect } from '@playwright/test'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { daysAgo } from './helpers'

// minimalny klient JSON-RPC po stdio (format newline-delimited JSON)
function mcpClient(dataDir: string): {
  proc: ChildProcess
  call: (toolName: string, args: Record<string, unknown>) => Promise<string>
  close: () => void
} {
  const proc = spawn('node', ['out/main/mcp.js'], {
    env: { ...process.env, TOODOOLOO_DATA_DIR: dataDir }
  })
  let nextId = 1
  const pending = new Map<number, (text: string) => void>()
  let buf = ''
  proc.stdout!.on('data', (chunk) => {
    buf += chunk.toString()
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      if (!line.trim()) continue
      const msg = JSON.parse(line)
      if (msg.id && pending.has(msg.id)) {
        pending.get(msg.id)!(JSON.stringify(msg.result ?? msg.error))
        pending.delete(msg.id)
      }
    }
  })
  const send = (obj: Record<string, unknown>): void => {
    proc.stdin!.write(JSON.stringify(obj) + '\n')
  }
  send({
    jsonrpc: '2.0',
    id: nextId++,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'e2e', version: '0' }
    }
  })
  send({ jsonrpc: '2.0', method: 'notifications/initialized' })
  return {
    proc,
    call: (name, args) =>
      new Promise((resolve) => {
        const id = nextId++
        pending.set(id, resolve)
        send({ jsonrpc: '2.0', id, method: 'tools/call', params: { name, arguments: args } })
      }),
    close: () => proc.kill()
  }
}

test('MCP: pełny cykl todosów i notatek przez stdio', async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'toodooloo-mcp-'))
  const mcp = mcpClient(dataDir)

  // todo: dodaj → listuj → odznacz → zmień pilność
  const added = JSON.parse(await mcp.call('add_todo', { text: 'Z MCP', urgency: 'high' }))
  const todoId = JSON.parse(added.content[0].text).id
  expect(await mcp.call('list_todos', {})).toContain('Z MCP')
  await mcp.call('update_todo', { id: todoId, done: true, urgency: 'low' })
  const onDisk = JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))
  expect(onDisk[0]).toMatchObject({ text: 'Z MCP', done: true, urgency: 'low' })

  // notatka: utwórz z treścią → pobierz → zmień → wylistuj
  const created = JSON.parse(await mcp.call('create_note', { title: 'Specyfikacja', body: '# Hej' }))
  const noteId = JSON.parse(created.content[0].text).id
  expect(await mcp.call('get_note', { id: noteId })).toContain('# Hej')
  await mcp.call('update_note', { id: noteId, body: '# Nowa treść' })
  expect(fs.readFileSync(path.join(dataDir, 'notes', `${noteId}.md`), 'utf8')).toContain(
    '# Nowa treść'
  )
  expect(await mcp.call('list_notes', {})).toContain('Specyfikacja')

  // notatka dnia
  await mcp.call('set_day_note', { body: 'Log z MCP' })
  expect(
    fs.readFileSync(path.join(dataDir, 'notes', `day-${daysAgo(0)}.md`), 'utf8')
  ).toContain('Log z MCP')
  expect(await mcp.call('get_day_note', {})).toContain('Log z MCP')

  // sprzątanie
  await mcp.call('delete_todo', { id: todoId })
  await mcp.call('delete_note', { id: noteId })
  expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))).toHaveLength(0)

  // błędne id -> isError, nie crash
  const bad = JSON.parse(await mcp.call('get_note', { id: 'nie-ma' }))
  expect(bad.isError).toBe(true)

  mcp.close()
})
