# TooDooLoo — baza wiedzy

Codzienna lista todo do pracy. Electron + React. Nowoczesny, ładny UI z animacjami.

## Stack

- **Electron** + **React 19** + **TypeScript**, budowane przez **electron-vite**
- **framer-motion** — animacje (jedyna biblioteka do wodotrysków)
- **Playwright** (`_electron`) — testy e2e; każdy feature ma test e2e
- Brak bazy danych: dane na dysku w `userData/data/` (JSON + pliki .md)

## Model danych

Katalog danych: `app.getPath('userData')/data/` (w testach nadpisywany przez env `TOODOOLOO_DATA_DIR`).

- `todos.json` — wszystkie todosy:
  ```ts
  type Urgency = 'immediate' | 'high' | 'medium' | 'low' | 'before-work'
  type Todo = {
    id: string          // crypto.randomUUID()
    text: string
    date: string        // 'YYYY-MM-DD' — dzień, do którego należy
    done: boolean
    urgency: Urgency
    noteId?: string     // link do notatki
    rolledFrom?: string // 'YYYY-MM-DD' — pierwotny dzień, z którego się przeturlał
    createdAt: string
  }
  ```
- `notes/<id>.md` — treść notatki (markdown), frontmatter z `title`, `date`, `parentId?`
  - `parentId` daje podstrony jak w Notion
  - notatka przypisana do dnia (`date`), ale lista wszystkich dostępna globalnie

## Reguły biznesowe

- **Rollover**: nieodznaczone todosy z dni poprzednich przechodzą na dziś (przy starcie appki i o północy). Pierwszy rollover zapisuje `rolledFrom` (pierwotna data, kolejne rollovery jej nie nadpisują) — na todosie widać chip `↻ <dzień>`. W widoku dnia, przez który todos przeszedł (`rolledFrom <= dzień < date`), IPC `todos:list` zwraca go jako „ducha" (wyszarzony, bez checkboxa, chip `↻ <dzień docelowy>`).
- **Tracking czasu** (à la Timemator): `sessions: {start, end?}[]` na todosie (ISO, brak `end` = timer chodzi), **jeden otwarty timer w całym systemie** — `startTracking` w store zamyka inne sesje; inwariant tylko tam. Odhaczenie todosa stopuje timer; **uśpienie nie tnie w ogóle**. Rollover nie rusza sesji — todos to samo `id`, czas jedzie z nim przez dni; czas per dzień tnie się z timestampów (`secondsOnDay`). UI: przycisk ▶/⏸ na wierszu (zawsze widoczny), chip `⏱ h:mm:ss` (ember + żywe sekundy gdy chodzi), karta z emberową poświatą, suma dnia w labelu lontu; tray pokazuje `▶ czas bieżącej sesji` (tick 1s tylko podczas trackingu, odświeżany też przez fs.watch po zmianach z MCP). MCP: `start_tracking`/`stop_tracking`.
- **Checkpoint końca pracy** („pracujesz jeszcze?"): `workEnd` w settings (ekran ustawień, domyślnie 17:00) wyznacza koniec lontu dnia i checkpointy trackingu. Gdy timer dożyje `workEnd`: sesja jest **pauzowana timestampem checkpointu w momencie wyświetlenia pytania** (natywna notyfikacja); klik = „tak, pracuję" → `resumeSession` wymazuje `end` (sesja biegnie bez szwu) i zapisuje `confirmedUntil` na sesji → następny ping za 5 min. Brak kliku = pauza zostaje. Checkpoint **zaspany** (sen/wyłączona appka) jest aplikowany wstecznie przy najbliższym ticku — cięcie timestampem checkpointu, **bez pytania** (play zawsze manualny). Start sesji po `workEnd` nie pinguje aż do jutrzejszego `workEnd` (`nextCheckpoint` w core.ts). Logika w ticku reminders (`checkWorkEnd`); okno „na żywo" = 90 s od checkpointu. Wymaga działającej appki (sesje z MCP przy zgaszonej appce potną się dopiero po jej starcie).
- **Kolor tożsamości zadania**: hash z `id` na 8-kolorową przygaszoną paletę (`taskColor` w core.ts) → lewa krawędź karty todosa (3px), ta sama na duchu — po kolorze widać, że to to samo zadanie przez wszystkie dni. Pilność (ember-dot) zostaje osobnym wymiarem koloru.
- **Przypomnienia** (natywne `Notification` z main procesu, tick co minutę):
  - `immediate` → co 3 min
  - `high` → co 30 min
  - `medium` → co 1h
  - `low` → co 4h
  - `before-work` → raz, w oknie 30 min przed godziną startu pracy (konfigurowalna w sidebarze, `settings.json`, domyślnie 9:00)
  - przypominamy tylko o niezrobionych todosach z dnia dzisiejszego
  - klik w powiadomienie fokusuje appkę, przełącza na dzień todosa i podświetla go (event IPC `open-todo`)

## Serwer MCP

`src/main/mcp.ts` → budowany do `out/main/mcp.js` (drugi entry w electron.vite.config). Stdio, SDK `@modelcontextprotocol/sdk` + zod. Operuje wprost na plikach danych (appka nie musi działać); appka łapie zmiany z zewnątrz przez `fs.watch` → IPC `data-changed` → reload UI.

- Narzędzia: `list/add/update/delete_todo`, `start/stop_tracking`, `list/get/create/update/delete_note`, `get/set_day_note`.
- Ścieżka danych: `TOODOOLOO_DATA_DIR` lub kanoniczna `~/Library/Application Support/TooDooLoo/data` (main proces migruje ze starej `toodooloo/data` przy starcie).
- Rejestracja globalna: `claude mcp add --scope user toodooloo -- node <repo>/out/main/mcp.js` (już zrobiona na tej maszynie).

## Architektura

- `src/shared/store.ts` — cały storage na plikach (bez Electrona), używany przez main i MCP; `setDataDir()` na starcie każdego entry
- `src/main/` — main proces: okno, scheduler przypomnień, IPC handlers, fs.watch
- `src/preload/` — `contextBridge` → `window.api` (typowane)
- `src/renderer/` — React: lewy sidebar (dni po datach), prawy panel (todosy + notatki)
- Cały stan trzyma main proces (pliki), renderer pobiera przez IPC i odświeża po zmianach.

## Design „Ink & Ember"

Ciepła atramentowa czerń, pilność jako temperatura żaru. Tokeny w `:root` w `main.css`:
- Kolory: bg `#17130E`, surface `#211B15`, tekst `#F4EDE3`, muted `#A08F7C`, akcent ember `#FF7847`; rampa urgency (gorąco→zimno) w `URGENCIES` w `core.ts`, „przed pracą" = świt `#86A8C8`.
- Typografia: Space Grotesk (`@fontsource`, offline) dla dat/tytułów/logo, system stack dla UI, mono w edytorze.
- Skala odstępów: `--s1..--s5` (8/12/16/24/40); między sekcjami `--s5`, wewnątrz `--s3`; tytuły licują z tekstem kart przez `--card-pad`.
- **Sygnatura — lont dnia**: linia pod tytułem dnia wypala się w czasie pracy (start z ustawień, 8h), todosy to punkty na osi, licznik done/total; ukryta gdy inny dzień bez todosów.
- `prefers-reduced-motion` respektowane; focus-visible ember.

## Layout UI

- Lewa kolumna: lista dni — tylko dni robocze (7 wstecz, 5 wprzód; weekendy pokazywane tylko, gdy mają dane), aktywny dzień z ember insetem, badge = liczba niezrobionych, kropka = są notatki; stopka: „▤ Notatki" i „⚙ Ustawienia".
- **Ekran ustawień**: trzeci widok panelu (`view: 'day' | 'notes' | 'settings'`), komponent `Settings.tsx` — karta z sekcjami „Dzień pracy" (start/koniec, `input type="time"`) i „Aplikacja" (checkbox Docka), każda opcja z opisem `<small>`. Wiersze mają klasy `.settings-start/.settings-end/.settings-dock` (używane w e2e). Stan settings trzyma App (bo lont potrzebuje workStart/workEnd), zapis od razu przy zmianie.
- **Tray + Dock**: appka ma tray w pasku menu (tekstowe „✓" — bez pliku ikony, `nativeImage.createEmpty()` + `setTitle`). Klik w tray otwiera okno, prawy przycisk → menu Pokaż / Zakończ (`popUpContextMenu`, nie `setContextMenu` — to drugie zjada eventy kliku). Klik w tray nie jest testowalny z Playwrighta (interakcja z paskiem menu OS) — bez testu e2e. Ustawienie `showDock` w `settings.json` (checkbox w sidebarze) chowa/pokazuje ikonę w Docku (`app.dock.hide/show`, aplikowane przy starcie i przy zmianie); przy schowanym Docku appka żyje w trayu. Uwaga: `app.dock.isVisible()` po `hide()` potrafi kłamać — nie assertować na nim w testach.
- Prawa część, widok dnia: todosy + **notatka dnia** inline pod nimi (id `day-<data>`, plik `notes/day-YYYY-MM-DD.md`, tworzona przy pierwszym wpisie przez IPC `notes:saveDay`; nie liczy się do badge'y i nie występuje w eksploratorze).
- Eksplorator notatek: pozycja „▤ Notatki" na dole sidebara — osobny widok panelu (`view: 'day' | 'notes' | 'settings' | 'timeline'` w App) z siatką wszystkich notatek, edytorem i podstronami. Link z todosa przełącza na ten widok.
- **Oś czasu** („▦ Oś czasu" w stopce sidebara, `Timeline.tsx`): tygodniowy kalendarz sesji trackingu à la Timemator. `weekBlocks(todos, dates, now)` w core.ts tnie sesje granicami dób i układa **nakładki klasycznym algorytmem kalendarzowym** (klastry przecinających się bloków → sloty `lane/lanes`, szerokość bloku = 1/n klastra); sesja otwarta = blok do „teraz" z flagą `running` (emberowa poświata). Blok: przezroczysty fill `taskColor` + 3px lewa krawędź + tytuł w kolorze + czas trwania; tekst znika poniżej ~24 min (zostaje tooltip). Oś godzin adaptacyjna (workStart−1h → workEnd+2h, rozciągana przez sesje), kolumny Pn–Pt + weekend gdy ma bloki, emberowa linia „teraz" w dzisiejszej kolumnie, suma tygodnia w nagłówku, nawigacja ‹ ● ›. Klik w blok → widok dnia todosa z podświetleniem. Read-only, bez zoomu i widoku dziennego. IPC `todos:all`; komponent sam się karmi (`listAllTodos` + `onDataChanged`, tick 60 s).
- Edytor notatki ma dwa tryby (przełącznik w toolbarze, zapamiętywany w localStorage `note-mode`): **Md** (surowy textarea) i **Wizualnie** (WYSIWYG na TipTap v3 + `@tiptap/markdown`, `getMarkdown()` przy zapisie — na dysku zawsze markdown). W testach `TOODOOLOO_DATA_DIR` przestawia też `userData` (izolacja localStorage).
- Urgency na todosie: jeden „żar" (kolor = poziom), klik otwiera popover z 5 opcjami (`.picker`); w formularzu dodawania segmented control z pigułkami.

## Komendy

- `npm run dev` — dev z HMR
- `npm run build` — build produkcyjny
- `npm run test:e2e` — Playwright e2e (buduje i odpala appkę z `TOODOOLOO_DATA_DIR` w tempie)

## Konwencje

- Każdy nowy feature = test e2e w `e2e/`.
- Notatki zawsze zapisywane jako markdown na dysku — żadnych blobów w JSON.
- Daty zawsze jako `YYYY-MM-DD` lokalnie (bez UTC-przesunięć).
