#!/usr/bin/env bash
# Gera os SVGs e converte para PNG usando o Chromium headless.
set -euo pipefail

cd "$(dirname "$0")"

CHROME="${CHROME_BIN:-/opt/pw-browsers/chromium-1194/chrome-linux/chrome}"
ESCALA="${ESCALA:-2}"

python3 gerar_diagramas.py

for nome in fluxo-ideal governanca-e-acessos; do
  # a janela do Chromium precisa ter exatamente o tamanho do SVG
  read -r LARGURA ALTURA < <(
    python3 - "$nome.svg" <<'PY'
import re, sys
svg = open(sys.argv[1], encoding="utf-8").read(400)
print(re.search(r'width="(\d+)"', svg).group(1),
      re.search(r'height="(\d+)"', svg).group(1))
PY
  )
  # embrulha o SVG num HTML sem margem para o screenshot bater pixel a pixel
  cat > ".${nome}.html" <<HTML
<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#fff}img{display:block}</style>
<img src="${nome}.svg" width="${LARGURA}" height="${ALTURA}">
HTML

  "$CHROME" \
    --headless \
    --no-sandbox \
    --disable-gpu \
    --hide-scrollbars \
    --force-device-scale-factor="$ESCALA" \
    --window-size="${LARGURA},${ALTURA}" \
    --screenshot="${nome}.png" \
    "file://$(pwd)/.${nome}.html" >/dev/null 2>&1
  rm -f ".${nome}.html"
  echo "gerado: $(pwd)/${nome}.png  (${LARGURA}x${ALTURA} @${ESCALA}x)"
done
