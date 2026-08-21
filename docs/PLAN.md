# Plan implementacji

Każda faza kończy się działającą appką + testami e2e dla nowych feature'ów.

## Faza 1 — szkielet ✅ gdy: appka się odpala, e2e smoke test przechodzi
- Scaffold electron-vite (React + TS), framer-motion, Playwright
- Okno, layout: sidebar dni + pusty panel
- Storage w main (todos.json, notes/), IPC, `TOODOOLOO_DATA_DIR` dla testów
- e2e: appka startuje, widać dzisiejszą datę w sidebarze

## Faza 2 — todosy
- Dodawanie/odznaczanie/usuwanie todosa dla wybranego dnia
- Segmented control urgency (5 poziomów)
- Rollover nieodznaczonych na dziś przy starcie
- e2e: dodaj todo, odznacz, zmień urgency, rollover (todo z wczoraj widoczny dziś)

## Faza 3 — notatki
- Notatka markdown przypisana do dnia, edytor + podgląd
- Podstrony (parentId), globalna lista notatek
- Link todo → notatka
- e2e: utwórz notatkę, edytuj, podstrona, link z todosa otwiera notatkę

## Faza 4 — przypomnienia
- Scheduler w main: tick co minutę, interwały wg urgency, before-work przed 9:00
- e2e: (scheduler z wstrzykiwanym zegarem — test jednostkowy logiki + e2e, że powiadomienie jest wysyłane; Notification mockowane przez env testowy)

## Faza 5 — wodotryski
- Animacje list (framer-motion layout), confetti przy odhaczeniu, przejścia między dniami
- Dopieszczenie stylu: glassmorphism/gradienty, dark mode
- e2e: bez zmian funkcjonalnych — regresja istniejących
