#!/usr/bin/env bash
# ============================================================
# CINE 1UP — empacotar.sh
# Gera os pacotes de entrega, um para cada destino:
#
#   dist/cine1up-cloudflare.zip          para Git ou Wrangler (com functions/)
#   dist/cine1up-cloudflare-arrastar.zip  para arrastar no painel (sem functions/)
#   dist/cine1up-supabase.zip     o banco: schema.sql e o passo a passo
#   dist/cine1up-blogger.zip      o tema do Blogger e as páginas
#
# Uso:  bash empacotar.sh
# ============================================================
set -e
cd "$(dirname "$0")"

echo "· regerando o tema do Blogger a partir dos arquivos do site"
node blogger/build.js
node blogger/validar.js
node blogger/previa.js
node blogger/diagnostico.js
echo

rm -rf dist && mkdir -p dist/tmp

# ---------- Pacote 1: Cloudflare Pages ----------
echo "· pacote da Cloudflare"
A=dist/tmp/cine1up-cloudflare
mkdir -p "$A"
cp -r assets functions *.html *.txt *.xml _headers _redirects README.md "$A"/
rm -f "$A/assets/js/blogger.js"          # só serve ao tema do Blogger
cp entrega/LEIA-ME-CLOUDFLARE.md "$A/LEIA-ME.md"
(cd dist/tmp && zip -qr ../cine1up-cloudflare.zip cine1up-cloudflare)

# ---------- Pacote 1b: Cloudflare por upload direto ----------
# Arrastar arquivos no painel não compila a pasta functions/ — o
# Cloudflare avisa "As funções Pages não são suportadas". Esta versão
# sai sem functions/ e já vem com TMDB_PROXY: false, para o site ir
# direto na API em vez de procurar uma rota que não existe.
echo "· pacote da Cloudflare (upload direto)"
D=dist/tmp/cine1up-cloudflare-arrastar
mkdir -p "$D"
cp -r "$A"/* "$D"/
rm -rf "$D/functions"
sed -i "s/  TMDB_PROXY: true,/  TMDB_PROXY: false,/" "$D/assets/js/config.js"
cp entrega/LEIA-ME-CLOUDFLARE-ARRASTAR.md "$D/LEIA-ME.md"
(cd dist/tmp && zip -qr ../cine1up-cloudflare-arrastar.zip cine1up-cloudflare-arrastar)

# ---------- Pacote 2: Supabase ----------
echo "· pacote do Supabase"
B=dist/tmp/cine1up-supabase
mkdir -p "$B"
cp supabase/schema.sql "$B"/
cp entrega/LEIA-ME-SUPABASE.md "$B/LEIA-ME.md"
(cd dist/tmp && zip -qr ../cine1up-supabase.zip cine1up-supabase)

# ---------- Pacote 3: Blogger ----------
echo "· pacote do Blogger"
C=dist/tmp/cine1up-blogger
mkdir -p "$C/paginas" "$C/previa"
cp blogger/tema-cine1up.xml blogger/tema-cine1up-v3.xml "$C"/
cp blogger/README.md "$C/LEIA-ME.md"
cp blogger/fliperama.html blogger/privacidade.html "$C/paginas"/
cp blogger/previa-capa.html blogger/previa-fliperama.html "$C/previa"/
cp -r blogger/diagnostico "$C"/
(cd dist/tmp && zip -qr ../cine1up-blogger.zip cine1up-blogger)

rm -rf dist/tmp
echo
ls -lh dist/
echo
echo "Pronto."
