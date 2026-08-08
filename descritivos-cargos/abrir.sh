#!/usr/bin/env sh
# Descritivos de Cargos — inicia o servidor local e abre o navegador.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js não encontrado. Abrindo o index.html direto (sem gravação)."
  (xdg-open index.html || open index.html) >/dev/null 2>&1
  exit 0
fi

echo "Iniciando em http://localhost:3000 — deixe este terminal aberto."
(sleep 1; (xdg-open http://localhost:3000 || open http://localhost:3000) >/dev/null 2>&1) &

node build.js
node server.js
