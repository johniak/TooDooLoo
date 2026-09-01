import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launch, daysAgo } from './helpers'
import { dayLabel, TASK_COLORS } from '../src/shared/core'

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

test('tracking czasu: start/stop, jeden timer naraz, done stopuje', async () => {
  const { app, page, dataDir } = await launch({
    seedTodos: [
      { text: 'Alfa', date: daysAgo(0) },
      { text: 'Beta', date: daysAgo(0) }
    ]
  })
  const read = (): { text: string; sessions?: { start: string; end?: string }[] }[] =>
    JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))
  const alfa = page.locator('.todo', { hasText: 'Alfa' })
  const beta = page.locator('.todo', { hasText: 'Beta' })

  await alfa.locator('.todo-track').click()
  await expect(alfa).toHaveClass(/todo-tracking/)
  await expect(alfa.locator('.todo-time')).toBeVisible()
  await expect.poll(() => read().find((t) => t.text === 'Alfa')?.sessions?.length).toBe(1)

  // start na Becie zamyka sesję Alfy — jeden timer w systemie
  await beta.locator('.todo-track').click()
  await expect.poll(() => read().find((t) => t.text === 'Alfa')?.sessions?.[0].end).toBeTruthy()
  await expect(beta).toHaveClass(/todo-tracking/)

  // odhaczenie stopuje timer
  await beta.locator('.todo-check').click()
  await expect.poll(() => read().find((t) => t.text === 'Beta')?.sessions?.[0].end).toBeTruthy()
  await expect(page.locator('.todo-tracking')).toHaveCount(0)
  await app.close()
})

test('checkpoint na żywo: sesja pauzuje o koniec pracy i pyta „pracujesz jeszcze?"', async () => {
  const now = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  const workEnd = `${p(now.getHours())}:${p(now.getMinutes())}` // koniec pracy = teraz → checkpoint w oknie „na żywo"
  const due = new Date(now)
  due.setSeconds(0, 0)
  const start = new Date(now.getTime() - 3 * 3600_000)
  const notifyFile = path.join(
    fs.mkdtempSync(path.join(require('os').tmpdir(), 'toodooloo-cp-')),
    'notify.log'
  )
  const { app, dataDir } = await launch({
    seedTodos: [
      { text: 'Wieczorny', date: daysAgo(0), sessions: [{ start: start.toISOString() }] }
    ],
    settings: { workStart: '09:00', workEnd, showDock: true },
    env: { TOODOOLOO_TICK_MS: '200', TOODOOLOO_NOTIFY_FILE: notifyFile }
  })
  await expect
    .poll(() => (fs.existsSync(notifyFile) ? fs.readFileSync(notifyFile, 'utf8') : ''), {
      timeout: 10_000
    })
    .toContain('checkpoint:Wieczorny')
  expect(
    JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))[0].sessions[0].end
  ).toBe(due.toISOString())
  await app.close()
})

test('checkpoint zaspany: sesja ucięta wstecznie o koniec dnia, bez pytania', async () => {
  const start = new Date()
  start.setDate(start.getDate() - 1)
  start.setHours(10, 0, 0, 0)
  const cut = new Date(start)
  cut.setHours(17, 0, 0, 0) // domyślny workEnd
  const notifyFile = path.join(
    fs.mkdtempSync(path.join(require('os').tmpdir(), 'toodooloo-cpr-')),
    'notify.log'
  )
  const { app, dataDir } = await launch({
    seedTodos: [{ text: 'Nocny', date: daysAgo(1), sessions: [{ start: start.toISOString() }] }],
    env: { TOODOOLOO_TICK_MS: '200', TOODOOLOO_NOTIFY_FILE: notifyFile }
  })
  await expect
    .poll(
      () => JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))[0].sessions[0].end,
      { timeout: 10_000 }
    )
    .toBe(cut.toISOString())
  // zaspany checkpoint nie pyta — play jest zawsze manualny
  expect(fs.existsSync(notifyFile) ? fs.readFileSync(notifyFile, 'utf8') : '').not.toContain(
    'checkpoint:'
  )
  await app.close()
})

test('oś czasu: bloki sesji, cięcie przez północ, nakładki w slotach, klik → todos', async () => {
  const iso = (date: string, h: number, m = 0): string => {
    const [y, mo, d] = date.split('-').map(Number)
    return new Date(y, mo - 1, d, h, m).toISOString()
  }
  // sesja przez północ w obrębie bieżącego tygodnia (niedziela → bierzemy sobotę jako start)
  const spanDay = new Date().getDay() === 0 ? daysAgo(1) : daysAgo(0)
  const nextDay = ((): string => {
    const [y, m, d] = spanDay.split('-').map(Number)
    const n = new Date(y, m - 1, d + 1)
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`
  })()
  const { app, page, dataDir } = await launch({
    seedTodos: [
      { text: 'Nocny marek', date: daysAgo(0), sessions: [{ start: iso(spanDay, 22), end: iso(nextDay, 1, 30) }] },
      { text: 'Ranny A', date: daysAgo(0), sessions: [{ start: iso(daysAgo(0), 10), end: iso(daysAgo(0), 11) }] },
      { text: 'Ranny B', date: daysAgo(0), sessions: [{ start: iso(daysAgo(0), 10, 30), end: iso(daysAgo(0), 11, 30) }] }
    ]
  })
  await page.locator('.timeline-link').click()

  await expect(page.locator('.tl-block')).toHaveCount(4)
  await expect(page.locator('.tl-block[title*="Nocny marek"]')).toHaveCount(2) // pocięty północą
  await expect(page.locator('.tl-total')).toContainText('h') // suma tygodnia

  // nakładka: dwa sloty obok siebie, ta sama szerokość, inne x
  const a = (await page.locator('.tl-block[title*="Ranny A"]').boundingBox())!
  const b = (await page.locator('.tl-block[title*="Ranny B"]').boundingBox())!
  expect(a.x).not.toBe(b.x)
  expect(Math.abs(a.width - b.width)).toBeLessThan(2)

  // klik w blok otwiera modal edycji sesji; zmiana startu zapisuje się
  await page.locator('.tl-block[title*="Ranny A"]').click()
  await expect(page.locator('.tl-modal')).toBeVisible()
  await page.locator('.tl-start-time').fill('09:30')
  await page.getByRole('button', { name: 'Zapisz' }).click()
  await expect(page.locator('.tl-modal')).toHaveCount(0)
  await expect
    .poll(() => {
      const todos = JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))
      return todos.find((t: { text: string }) => t.text === 'Ranny A').sessions[0].start
    })
    .toBe(iso(daysAgo(0), 9, 30))
  // link w modalu prowadzi do todosa
  await page.locator('.tl-block[title*="Ranny A"]').click()
  await page.getByRole('button', { name: '▤ Pokaż todosa' }).click()
  await expect(page.locator('.todo-flash')).toContainText('Ranny A')
  await app.close()
})

test('oś czasu: przeciągnięcie bloku przesuwa sesję o godzinę (snap 5 min)', async () => {
  const iso = (h: number, m = 0): string => {
    const [y, mo, d] = daysAgo(0).split('-').map(Number)
    return new Date(y, mo - 1, d, h, m).toISOString()
  }
  const { app, page, dataDir } = await launch({
    seedTodos: [
      { text: 'Przesuwany', date: daysAgo(0), sessions: [{ start: iso(10), end: iso(11) }] }
    ]
  })
  await page.locator('.timeline-link').click()
  const box = (await page.locator('.tl-block[title*="Przesuwany"]').boundingBox())!
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx, cy + 56, { steps: 6 }) // 56px = 1h
  await page.mouse.up()
  await expect
    .poll(() => {
      const todos = JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))
      return todos[0].sessions[0]
    })
    .toMatchObject({ start: iso(11), end: iso(12) })
  await app.close()
})

test('kolor zadania: ręczny wybór z palety i powrót do automatu', async () => {
  const { app, page, dataDir } = await launch({
    seedTodos: [{ text: 'Malowany', date: daysAgo(0) }]
  })
  const read = (): { color?: string }[] =>
    JSON.parse(fs.readFileSync(path.join(dataDir, 'todos.json'), 'utf8'))
  const todo = page.locator('.todo', { hasText: 'Malowany' })

  await todo.locator('.todo-color').click()
  await page.locator('.color-swatch').first().click()
  await expect.poll(() => read()[0].color).toBe(TASK_COLORS[0])

  // powrót do koloru automatycznego
  await todo.locator('.todo-color').click()
  await page.getByRole('button', { name: '↺ Automatyczny' }).click()
  await expect.poll(() => read()[0].color).toBeUndefined()
  await app.close()
})

test('kolor tożsamości: ten sam na todosie dziś i na jego duchu', async () => {
  const origin = prevWorkday()
  const { app, page } = await launch({ seedTodos: [{ text: 'Kameleon', date: origin }] })
  const color = await page
    .locator('.todo', { hasText: 'Kameleon' })
    .evaluate((el) => getComputedStyle(el).borderLeftColor)
  await page.locator('.day', { hasText: dayLabel(origin) }).click()
  const ghostColor = await page
    .locator('.todo-ghost', { hasText: 'Kameleon' })
    .evaluate((el) => getComputedStyle(el).borderLeftColor)
  expect(ghostColor).toBe(color)
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
  await page.locator('.settings-link').click()
  await page.locator('.settings-start input').fill('07:30')
  await page.locator('.settings-end input').fill('16:30')
  await expect
    .poll(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
      } catch {
        return {}
      }
    })
    .toMatchObject({ workStart: '07:30', workEnd: '16:30' })
  await app.close()
})

test('ukrycie w Docku: checkbox chowa ikonę i zapisuje ustawienie', async () => {
  const { app, page, dataDir } = await launch()
  await page.locator('.settings-link').click()
  await page.locator('.settings-dock input').uncheck()
  await expect
    .poll(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).showDock
      } catch {
        return null
      }
    })
    .toBe(false)
  // dock.isVisible() w Electronie kłamie po hide() (znany bug), więc bez asserta na widoczność
  await page.locator('.settings-dock input').check()
  await expect
    .poll(() => {
      try {
        return JSON.parse(fs.readFileSync(path.join(dataDir, 'settings.json'), 'utf8')).showDock
      } catch {
        return null
      }
    })
    .toBe(true)
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
