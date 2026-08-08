#!/usr/bin/env python3
"""
Monta a versão para hospedagem web, na pasta web/.

    python3 build_web.py              # com a base de cargos embutida
    python3 build_web.py --sem-base   # sem a base; quem usa carrega o .xlsx

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
import pathlib
import shutil
import sys

RAIZ = pathlib.Path(__file__).parent
SRC = RAIZ / "src"
ASSETS = RAIZ / "assets"
WEB = RAIZ / "web"

NOME_CARREIRA = "TEMPLATE OFICIAL_TÉC.ADMINISTRATIVO- SAP 4.docx"
NOME_INDIVIDUAL = "Descritivo de cargo individual"

# arquivos copiados para web/assets/
ESTATICOS = [
    "jszip.min.js",
    "logo.png",
    "template-carreira.docx",
    "template-individual.docx",
]


def texto(caminho: pathlib.Path) -> str:
    if not caminho.exists():
        sys.exit(f"Fonte ausente: {caminho}")
    return caminho.read_text(encoding="utf-8")


def js_string(valor: str) -> str:
    return "'" + valor.replace("\\", "\\\\").replace("'", "\\'") + "'"


def hash_curto(caminho: pathlib.Path) -> str:
    h = hashlib.sha256(caminho.read_bytes()).hexdigest()
    return h[:8]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-base", action="store_true",
                    help="não publica a planilha; quem usa carrega o .xlsx")
    ap.add_argument("--saida", default="web", metavar="PASTA",
                    help="pasta de saída (padrão: web). Use docs para GitHub Pages.")
    args = ap.parse_args()

    global WEB
    WEB = RAIZ / args.saida
    destino_assets = WEB / "assets"
    if WEB.exists():
        shutil.rmtree(WEB)
    destino_assets.mkdir(parents=True)

    # ---- assets estáticos ----
    incluir = list(ESTATICOS)
    if not args.sem_base:
        incluir.append("base.xlsx")

    versoes = {}
    for nome in incluir:
        origem = ASSETS / nome
        if not origem.exists():
            sys.exit(f"Asset ausente: {origem}")
        shutil.copy2(origem, destino_assets / nome)
        versoes[nome] = hash_curto(origem)

    # css e js do app viram arquivos próprios
    (destino_assets / "styles.css").write_text(texto(SRC / "styles.css"), encoding="utf-8")
    (destino_assets / "app.js").write_text(texto(SRC / "app.js"), encoding="utf-8")
    versoes["styles.css"] = hash_curto(destino_assets / "styles.css")
    versoes["app.js"] = hash_curto(destino_assets / "app.js")

    def url(nome: str) -> str:
        return f"assets/{nome}?v={versoes[nome]}"

    # ---- descritor de fontes ----
    def remoto(arquivo: str, nome: str) -> str:
        return ("{tipo:'url',nome:" + js_string(nome)
                + ",url:" + js_string(url(arquivo)) + "}")

    linhas = []
    linhas.append("  base:" + ("null" if args.sem_base
                               else remoto("base.xlsx", "Base publicada no servidor")))
    linhas.append("  carreira:" + remoto("template-carreira.docx", NOME_CARREIRA))
    linhas.append("  individual:" + remoto("template-individual.docx", NOME_INDIVIDUAL))
    linhas.append("  logo:" + js_string(url("logo.png")))
    fontes = "window.GMC={\n" + ",\n".join(linhas) + "\n};"

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
{fontes}
</script>
<script src="{url('app.js')}"></script>
</body>
</html>
"""
    (WEB / "index.html").write_text(html, encoding="utf-8")

    # ---- arquivos de apoio para hospedagem ----
    (WEB / ".nojekyll").write_text("", encoding="utf-8")

    (WEB / "_headers").write_text(
        "# Netlify / Cloudflare Pages\n"
        "/index.html\n"
        "  Cache-Control: no-cache\n"
        "/assets/*\n"
        "  Cache-Control: public, max-age=31536000\n",
        encoding="utf-8")

    (WEB / "web.config").write_text(
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

    total = sum(f.stat().st_size for f in WEB.rglob("*") if f.is_file())
    primeiro = (WEB / "index.html").stat().st_size \
        + (destino_assets / "styles.css").stat().st_size \
        + (destino_assets / "app.js").stat().st_size \
        + (destino_assets / "jszip.min.js").stat().st_size \
        + (destino_assets / "logo.png").stat().st_size

    print(f"Gerado: {WEB.name}/  ({total / 1_048_576:.1f} MB no total)")
    print(f"  interface (html+css+js+logo): {primeiro / 1024:.0f} KB")
    print(f"  modelos Word ................: "
          f"{(ASSETS / 'template-carreira.docx').stat().st_size / 1_048_576 * 2:.1f} MB")
    if args.sem_base:
        print("  base de cargos .............: NÃO publicada (--sem-base)")
        print("\nO site não expõe dados de cargos. Cada pessoa carrega a planilha no navegador.")
    else:
        print(f"  base de cargos .............: "
              f"{(ASSETS / 'base.xlsx').stat().st_size / 1_048_576:.1f} MB")
        print("\nATENÇÃO: web/assets/base.xlsx contém a base de cargos e ficará acessível")
        print("a quem alcançar a URL. Publique apenas em rede interna ou com autenticação.")
        print("Para um site público, gere com: python3 build_web.py --sem-base")


if __name__ == "__main__":
    main()
