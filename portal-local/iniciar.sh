#!/bin/sh
# Portal de Decisões — Linux e macOS
cd "$(dirname "$0")" || exit 1

if [ -x "./node/node" ]; then
  NODE="./node/node"
elif command -v node >/dev/null 2>&1; then
  NODE="node"
else
  echo
  echo "Node.js não encontrado."
  echo "Baixe em https://nodejs.org/en/download (formato tar.gz, não precisa instalar),"
  echo "extraia e copie o arquivo 'node' para a pasta node/ ao lado deste script."
  echo
  exit 1
fi

exec "$NODE" --no-warnings servidor/index.mjs
