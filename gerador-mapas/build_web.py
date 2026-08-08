#!/usr/bin/env python3
"""
Monta a versão para hospedagem web, na pasta web/.

    python3 build_web.py              # com a base de cargos embutida
    python3 build_web.py --sem-base   # sem a base; quem usa carrega o .xlsx
    python3 build_web.py --saida docs # para publicar no GitHub Pages

Diferente do arquivo único, aqui os assets ficam em arquivos separados e
são baixados pelo navegador. Isso deixa o primeiro carregamento menor,
permite cache entre visitas e permite trocar a planilha no servidor sem
regerar nada.

--sem-base é a opção indicada quando o site fica exposto na internet:
o HTML publicado não carrega nenhum dado de cargos, e cada pessoa
seleciona a planilha no próprio navegador.
"""

import argparse
import hashlib
import json
import pathlib
import shutil
import sys

import build

RAIZ = pathlib.Path(__file__).parent
SRC = RAIZ / "src"
ASSETS = RAIZ / "assets"

ESTATICOS = ["jszip.min.js", "logo.png"]


def texto(caminho: pathlib.Path) -> str:
    if not caminho.exists():
        sys.exit(f"Fonte ausente: {caminho}")
    return caminho.read_text(encoding="utf-8")


def hash_curto(caminho: pathlib.Path) -> str:
    return hashlib.sha256(caminho.read_bytes()).hexdigest()[:8]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-base", action="store_true",
                    help="não publica a planilha; quem usa carrega o .xlsx")
    ap.add_argument("--saida", default="web", metavar="PASTA",
                    help="pasta de saída (padrão: web). Use docs para GitHub Pages.")
    args = ap.parse_args()

    web = RAIZ / args.saida
    destino = web / "assets"
    if web.exists():
        shutil.rmtree(web)
    destino.mkdir(parents=True)

    # ---- assets copiados ----
    incluir = list(ESTATICOS) + [m["asset"] for m in build.MODELOS_PADRAO]
    if not args.sem_base:
        incluir.append("base.xlsx")

    versoes = {}
    for nome in incluir:
        origem = ASSETS / nome
        if not origem.exists():
            sys.exit(f"Asset ausente: {origem}")
        shutil.copy2(origem, destino / nome)
        versoes[nome] = hash_curto(origem)

    # ---- css e app ----
    # o app.js publicado leva o shell do arquivo único embutido, para que a
    # ferramenta consiga gerar cópias configuradas mesmo servida pela web
    shell = build.compor_shell()
    app = texto(SRC / "app.js").replace(build.MARCADOR_SHELL, build.literal_shell(shell), 1)
    (destino / "app.js").write_text(app, encoding="utf-8")
    (destino / "styles.css").write_text(texto(SRC / "styles.css"), encoding="utf-8")
    versoes["app.js"] = hash_curto(destino / "app.js")
    versoes["styles.css"] = hash_curto(destino / "styles.css")

    def url(nome: str) -> str:
        return f"assets/{nome}?v={versoes[nome]}"

    # ---- descritor de fontes ----
    modelos = [{
        "id": m["id"], "nome": m["nome"], "arquivo": m["arquivo"],
        "regra": m["regra"], "origem": "padrao",
        "tipo": "url", "url": url(m["asset"]),
    } for m in build.MODELOS_PADRAO]

    fontes = {
        "logo": url("logo.png"),
        "base": None if args.sem_base else {
            "tipo": "url", "nome": "Base publicada no servidor", "url": url("base.xlsx")},
        "modelos": modelos,
    }
    corpo = texto(SRC / "body.html")

    html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="light">
<title>Gerador de Mapas de Carreira</title>
<link rel="icon" href="{url('logo.png')}">
<link rel="stylesheet" href="{url('styles.css')}">
</head>
<body>
{corpo}
<script src="{url('jszip.min.js')}"></script>
<script>
window.GMC={json.dumps(fontes, ensure_ascii=False)};
</script>
<script src="{url('app.js')}"></script>
</body>
</html>
"""
    (web / "index.html").write_text(html, encoding="utf-8")

    # ---- apoio para hospedagem ----
    (web / ".nojekyll").write_text("", encoding="utf-8")
    (web / "_headers").write_text(
        "# Netlify / Cloudflare Pages\n"
        "/index.html\n"
        "  Cache-Control: no-cache\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=31536000\n",
        encoding="utf-8")
    (web / "web.config").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!-- IIS: tipos MIME e cache. Coloque na raiz do site. -->\n"
        "<configuration>\n"
        "  <system.webServer>\n"
        "    <staticContent>\n"
        '      <remove fileExtension=".xlsx" />\n'
        '      <mimeMap fileExtension=".xlsx" mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />\n'
        '      <remove fileExtension=".docx" />\n'
        '      <mimeMap fileExtension=".docx" mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document" />\n'
        "    </staticContent>\n"
        "  </system.webServer>\n"
        "</configuration>\n",
        encoding="utf-8")

    total = sum(f.stat().st_size for f in web.rglob("*") if f.is_file())
    interface = sum((web / p).stat().st_size for p in
                    ["index.html", "assets/styles.css", "assets/app.js",
                     "assets/jszip.min.js", "assets/logo.png"])
    modelos_bytes = sum((destino / m["asset"]).stat().st_size for m in build.MODELOS_PADRAO)

    print(f"Gerado: {web.name}/  ({total / 1_048_576:.1f} MB no total)")
    print(f"  interface (html+css+js+logo): {interface / 1024:.0f} KB")
    print(f"  modelos Word ({len(build.MODELOS_PADRAO)}) ..............: {modelos_bytes / 1_048_576:.1f} MB")
    if args.sem_base:
        print("  base de cargos .............: NÃO publicada (--sem-base)")
        print("\nO site não expõe dados de cargos. Cada pessoa carrega a planilha no navegador.")
    else:
        print(f"  base de cargos .............: {(ASSETS / 'base.xlsx').stat().st_size / 1_048_576:.1f} MB")
        print(f"\nATENÇÃO: {web.name}/assets/base.xlsx contém a base de cargos e ficará acessível")
        print("a quem alcançar a URL. Publique apenas em rede interna ou com autenticação.")
        print("Para um site público, gere com: python3 build_web.py --sem-base")


if __name__ == "__main__":
    main()
