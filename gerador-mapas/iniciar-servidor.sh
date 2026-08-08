#!/bin/sh
# Sobe o Gerador de Mapas de Carreira nesta maquina.
# Para liberar na rede local: ./iniciar-servidor.sh --rede
cd "$(dirname "$0")" || exit 1

if command -v python3 >/dev/null 2>&1; then
    exec python3 servidor.py "$@"
fi

echo "Python 3 nao encontrado."
echo "Para uso individual, abra Gerador_Mapas_Carreira.html no navegador."
exit 1
