#!/usr/bin/env bash
# ============================================================
# CINE 1UP — empacotar.sh
# Gera os dois pacotes de entrega, cada um com o que interessa
# para aquela hospedagem.
#
#   dist/cine1up-cloudflare-supabase.zip
#   dist/cine1up-blogger.zip
#
# Uso:  bash empacotar.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "· regerando o tema do Blogger a partir dos arquivos do site"
node blogger/build.js
node blogger/validar.js
node blogger/previa.js

rm -rf dist && mkdir -p dist/tmp

# ---------- Pacote A: Cloudflare Pages + Supabase ----------
echo "· montando o pacote Cloudflare + Supabase"
A=dist/tmp/cine1up
mkdir -p "$A"
cp -r assets functions supabase *.html *.txt *.xml _headers _redirects README.md "$A"/
# blogger.js só serve para o tema do Blogger
rm -f "$A/assets/js/blogger.js"
(cd dist/tmp && zip -qr ../cine1up-cloudflare-supabase.zip cine1up)

# ---------- Pacote B: Blogger ----------
echo "· montando o pacote Blogger"
B=dist/tmp/cine1up-blogger
mkdir -p "$B/paginas"
cp blogger/cine1up-blogger.xml "$B"/
cp blogger/README.md "$B/LEIA-ME.md"
cp blogger/previa.html "$B"/
cp blogger/fliperama.html blogger/privacidade.html "$B/paginas"/
(cd dist/tmp && zip -qr ../cine1up-blogger.zip cine1up-blogger)

rm -rf dist/tmp
echo
ls -lh dist/
echo
echo "Pronto."
