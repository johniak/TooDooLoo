#!/bin/bash
# Buduje release TooDooLoo i (nad)instalowuje w ~/Applications — Alfred znajdzie po nazwie.
# ponytail: ~/Applications zamiast /Applications, bo /Applications wymaga admina na zarządzanym Macu
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="$HOME/Applications"

echo "▸ Buduję release…"
npm run build:unpack

APP=$(ls -d dist/mac*/TooDooLoo.app | head -1)

echo "▸ Ubijam działającą instancję (jeśli jest)…"
pkill -x TooDooLoo 2>/dev/null && sleep 1 || true

echo "▸ Kopiuję do ${DEST}…"
mkdir -p "$DEST"
rm -rf "$DEST/TooDooLoo.app"
cp -R "$APP" "$DEST/"

echo "▸ Startuję…"
open "$DEST/TooDooLoo.app"
echo "✓ Gotowe."
