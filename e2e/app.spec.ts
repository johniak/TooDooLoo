import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launch, daysAgo } from './helpers'
import { dayLabel } from '../src/shared/core'

// ostatni dzień roboczy przed dzisiaj — weekendy bez danych nie są widoczne w sidebarze
const prevWorkday = (): string => {
  for (let i = 1; ; i++) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    if (d.getDay() !== 0 && d.getDay() !== 6) return daysAgo(i)
  }
}

test('appka startuje i pokazuje dzisiejszy dzień', async () => {
  const { app, page } = await launch()
  await expect(page.locator('.logo')).toHaveText('TooDooLoo')
  await expect(page.locator('.day-active .day-label')).toHaveText('Dzisiaj')
  await app.close()
})

test('dodawanie, odznaczanie i usuwanie todosa', async () => {
  const { app, page } = await launch()
  await page.getByPlaceholder('Co jest do zrobienia?').fill('Kupić kawę')
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click()

  const todo = page.locator('.todo', { hasText: 'Kupić kawę' })
  await expect(todo).toBeVisible()

  await todo.locator('.todo-check').click()
  await expect(todo).toHaveClass(/todo-done/)

  await todo.locator('.todo-delete').click()
  await expect(todo).toHaveCount(0)
  await app.close()
})

test('zmiana pilności segmented controlem na todosie', async () => {
  const { app, page, dataDir } = await launch({
    seedTodos: [{ text: 'Raport', date: daysAgo(0) }]
  })
  const todo = page.locator('.todo', { hasText: 'Raport' })
  await todo.locator('.ember').click()
  await todo.locator('.picker-option[title="Natychmiast"]').click()
  await expect(todo.locator('.ember')).toHaveAttribute('title', 'Natychmiast')
  await expect
    .poll(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))[0].urgency)
    .toBe('immediate')
  await app.close()
})

test('rollover: nieodznaczony todos z wczoraj przechodzi na dziś', async () => {
  const { app, page } = await launch({
    seedTodos: [
      { text: 'Zaległy task', date: daysAgo(1) },
      { text: 'Zrobiony wczoraj', date: daysAgo(1), done: true }
    ]
  })
  await expect(page.locator('.day-active .day-label')).toHaveText('Dzisiaj')
  const rolled = page.locator('.todo', { hasText: 'Zaległy task' })
  await expect(rolled).toBeVisible()
  // widać, z którego dnia todos się przeturlał
  await expect(rolled.locator('.todo-rolled')).toContainText('↻')
  await expect(rolled.locator('.todo-rolled')).toHaveAttribute(
    'title',
    `Niezrobione od ${daysAgo(1)}`
  )
  await expect(page.locator('.todo', { hasText: 'Zrobiony wczoraj' })).toHaveCount(0)
  await app.close()
})

test('rollover: w poprzednim dniu zostaje duch przeniesionego todosa', async () => {
  const origin = prevWorkday()
  const { app, page } = await launch({ seedTodos: [{ text: 'Uciekinier', date: origin }] })
  // po rolloverze todos jest dziś
  await expect(page.locator('.todo', { hasText: 'Uciekinier' })).toBeVisible()

  await page.locator('.day', { hasText: dayLabel(origin) }).click()
  const ghost = page.locator('.todo-ghost', { hasText: 'Uciekinier' })
  await expect(ghost).toBeVisible()
  await expect(ghost.locator('.todo-rolled')).toContainText('↻ Dzisiaj')
  // duch nie ma checkboxa — nieedytowalny ślad
  await expect(ghost.locator('.todo-check')).toHaveCount(0)
  await app.close()
})

test('notatki: tworzenie, edycja md, tryb wizualny, podstrona', async () => {
  const { app, page } = await launch()
  await page.locator('.notes-link').click()
  await page.getByRole('button', { name: '＋ Notatka' }).click()

  await page.locator('.note-title').fill('Plan sprintu')
  await page.locator('.note-body').fill('# Cele\n\n- wysyłka **v1**')
  await page.getByRole('radio', { name: 'Wizualnie' }).click()
  await expect(page.locator('.note-visual .tiptap h1')).toHaveText('Cele')
  await expect(page.locator('.note-visual .tiptap strong')).toHaveText('v1')
  await page.getByRole('radio', { name: 'Md' }).click()

  await page.getByRole('button', { name: '＋ podstrona' }).click()
  await expect(page.locator('.note-title')).toHaveValue('Podstrona') // edytor przełączył się na podstronę
  await page.locator('.note-title').fill('Szczegóły')
  await page.getByRole('button', { name: '← Wróć' }).click()
  await expect(page.locator('.note-chip', { hasText: 'Szczegóły' })).toBeVisible()

  await page.getByRole('button', { name: '← Wróć' }).click()
  await expect(page.locator('.note-card', { hasText: 'Plan sprintu' })).toBeVisible()
  // podstrona nie jest listowana jako top-level
  await expect(page.locator('.note-card', { hasText: 'Szczegóły' })).toHaveCount(0)
  await app.close()
})

test('edytor wizualny: pisanie i formatowanie zapisuje się jako markdown', async () => {
  const { app, page, dataDir } = await launch()
  await page.locator('.notes-link').click()
  await page.getByRole('button', { name: '＋ Notatka' }).click()
  await page.getByRole('radio', { name: 'Wizualnie' }).click()

  const editor = page.locator('.note-visual .tiptap')
  await editor.click()
  await page.keyboard.type('Cele sprintu')
  await page.locator('.rt-btn[title="Nagłówek 1"]').click()
  await expect(editor.locator('h1')).toHaveText('Cele sprintu')

  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('bardzo ')
  await page.locator('.rt-btn[title="Pogrubienie"]').click()
  await expect(page.locator('.rt-btn[title="Pogrubienie"]')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.type('ważne')
  await expect(editor.locator('strong')).toHaveText('ważne')

  await expect
    .poll(() => {
      const dir = path.join(dataDir, 'notes')
      const files = fs.existsSync(dir) ? fs.readdirSync(dir) : []
      return files.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n')
    })
    .toContain('# Cele sprintu')

  // w trybie Md widać wygenerowany markdown
  await page.getByRole('radio', { name: 'Md' }).click()
  await expect(page.locator('.note-body')).toHaveValue(/# Cele sprintu[\s\S]*\*\*ważne\*\*/)
  await app.close()
})

test('link z todosa do notatki otwiera notatkę', async () => {
  const { app, page } = await launch()
  await page.locator('.notes-link').click()
  await page.getByRole('button', { name: '＋ Notatka' }).click()
  await page.locator('.note-title').fill('Specyfikacja')
  await page.getByRole('button', { name: '← Wróć' }).click()

  await page.locator('.day', { hasText: 'Dzisiaj' }).click()
  await page.getByPlaceholder('Co jest do zrobienia?').fill('Przeczytać spec')
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click()

  const todo = page.locator('.todo', { hasText: 'Przeczytać spec' })
  await todo.locator('button[title="Podepnij link lub notatkę"]').click()
  await page.locator('.picker-option', { hasText: 'Specyfikacja' }).click()

  await expect(todo.locator('.todo-note-link')).toContainText('Specyfikacja')
  await todo.locator('.todo-note-link').click()
  await expect(page.locator('.note-title')).toHaveValue('Specyfikacja')
  await app.close()
})

test('notatka dnia: inline pod todosami, zapis do day-<data>.md, poza eksploratorem', async () => {
  const { app, page, dataDir } = await launch()
  const editor = page.locator('.day-note .tiptap')
  await editor.click()
  await page.keyboard.type('Log dnia: spokój')
  await expect
    .poll(() => {
      try {
        return fs.readFileSync(path.join(dataDir, 'notes', `day-${daysAgo(0)}.md`), 'utf8')
      } catch {
        return ''
      }
    })
    .toContain('Log dnia: spokój')

  // notatka dnia nie zaśmieca eksploratora
  await page.locator('.notes-link').click()
  await expect(page.locator('.note-card')).toHaveCount(0)

  // po powrocie na dzień treść jest wczytana
  await page.locator('.day', { hasText: 'Dzisiaj' }).click()
  await expect(page.locator('.day-note .tiptap')).toContainText('Log dnia: spokój')
  await app.close()
})

test('sidebar pomija weekendy bez danych', async () => {
  const { app, page } = await launch()
  await expect(page.locator('.day').first()).toBeVisible()
  expect(await page.locator('.day-label', { hasText: /^(So|Nd) / }).count()).toBe(0)
  await app.close()
})

test('godzina startu pracy jest konfigurowalna i zapisywana', async () => {
  const { app, page, dataDir } = await launch()
  await page.locator('.settings input').fill('07:30')
  await expect
    .poll(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).workStart
      } catch {
        return ''
      }
    })
    .toBe('07:30')
  await app.close()
})

test('open-todo (klik w powiadomienie) przełącza dzień i podświetla todosa', async () => {
  const { app, page } = await launch({ seedTodos: [{ text: 'Ważny task', date: daysAgo(0) }] })
  await page.locator('.day').first().click() // przejdź na inny dzień
  await expect(page.locator('.day-active .day-label')).not.toHaveText('Dzisiaj')

  await app.evaluate(({ BrowserWindow }, payload) => {
    BrowserWindow.getAllWindows()[0].webContents.send('open-todo', payload)
  }, { id: 'seed-0', date: daysAgo(0) })

  await expect(page.locator('.day-active .day-label')).toHaveText('Dzisiaj')
  await expect(page.locator('.todo-flash')).toContainText('Ważny task')
  await app.close()
})

test('link http na todosie: dodanie, chip z domeną, normalizacja https', async () => {
  const { app, page, dataDir } = await launch({
    seedTodos: [{ text: 'Przejrzeć PR', date: daysAgo(0) }]
  })
  const todo = page.locator('.todo', { hasText: 'Przejrzeć PR' })
  await todo.locator('button[title="Podepnij link lub notatkę"]').click()
  await page.locator('.picker-url').fill('github.com/johniak/TooDooLoo/pull/7')
  await page.keyboard.press('Enter')

  await expect(todo.locator('.todo-url')).toContainText('github.com')
  await expect
    .poll(() => JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))[0].url)
    .toBe('https://github.com/johniak/TooDooLoo/pull/7')

  // pusty input odpina link
  await todo.locator('button[title="Podepnij link lub notatkę"]').click()
  await page.locator('.picker-url').fill('')
  await page.keyboard.press('Enter')
  await expect(todo.locator('.todo-url')).toHaveCount(0)

  // link można dodać już przy tworzeniu todosa
  await page.getByPlaceholder('Co jest do zrobienia?').fill('Zgłosić buga')
  await page.getByPlaceholder('🔗 link (opcjonalnie)').fill('issues.example.com/42')
  await page.getByRole('button', { name: 'Dodaj', exact: true }).click()
  await expect(
    page.locator('.todo', { hasText: 'Zgłosić buga' }).locator('.todo-url')
  ).toContainText('issues.example.com')
  await app.close()
})

test('zmiany danych na dysku (np. przez MCP) odświeżają UI na żywo', async () => {
  const { app, page, dataDir } = await launch({ seedTodos: [{ text: 'Pierwszy', date: daysAgo(0) }] })
  await expect(page.locator('.todo')).toHaveCount(1)

  const file = path.join(dataDir, 'todos.json')
  const todos = JSON.parse(fs.readFileSync(file, 'utf8'))
  todos.push({
    id: 'ext-1',
    text: 'Dopisany z zewnątrz',
    date: daysAgo(0),
    done: false,
    urgency: 'medium',
    createdAt: ''
  })
  fs.writeFileSync(file, JSON.stringify(todos))

  await expect(page.locator('.todo', { hasText: 'Dopisany z zewnątrz' })).toBeVisible()
  await app.close()
})

test('przypomnienie: todos immediate generuje powiadomienie', async () => {
  const notifyFile = path.join(
    fs.mkdtempSync(path.join(require('os').tmpdir(), 'toodooloo-notify-')),
    'notify.log'
  )
  const { app } = await launch({
    seedTodos: [{ text: 'Pilna sprawa', date: daysAgo(0), urgency: 'immediate' }],
    env: { TOODOOLOO_NOTIFY_FILE: notifyFile, TOODOOLOO_TICK_MS: '200' }
  })
  await expect
    .poll(() => (fs.existsSync(notifyFile) ? fs.readFileSync(notifyFile, 'utf8') : ''), {
      timeout: 10_000
    })
    .toContain('Pilna sprawa')
  await app.close()
})
