#!/usr/bin/env python3
"""
Monta a ferramenta em um único arquivo HTML autocontido.

    python3 build.py

Junta os fontes de src/ com os arquivos de assets/ (planilha, modelos
Word, logotipo e JSZip) codificados em base64. O resultado abre com
duplo clique, sem servidor e sem internet.

Sobre o "shell"
---------------
O arquivo gerado carrega uma cópia do próprio esqueleto (HTML + CSS +
JS, sem os dados) numa constante. É isso que permite à ferramenta
gerar, pelo navegador, uma nova cópia já configurada — com os modelos
e o mapeamento que a pessoa montou. Como a cópia embutida mantém os
marcadores intactos, a ferramenta gerada também consegue se regerar.
"""

import base64
import json
import pathlib
import sys

RAIZ = pathlib.Path(__file__).parent
SRC = RAIZ / "src"
ASSETS = RAIZ / "assets"
SAIDA = RAIZ / "Gerador_Mapas_Carreira.html"

MARCADOR_FONTES = "/*__GMC_FONTES__*/"
MARCADOR_SHELL = '"__SHELL__"'

# Modelos que acompanham a ferramenta. A ordem importa: cada cargo usa o
# primeiro modelo cuja regra combinar.
MODELOS_PADRAO = [
    {
        "id": "carreira",
        "nome": "Mapa de carreira (JR/PL/SR)",
        "arquivo": "TEMPLATE OFICIAL_TÉC.ADMINISTRATIVO- SAP 4.docx",
        "asset": "template-carreira.docx",
        "regra": {"tipo": "familia", "coluna": "", "operador": "igual",
                  "valor": "", "exigeFamilia": False},
    },
    {
        "id": "individual",
        "nome": "Descritivo de cargo individual",
        "arquivo": "DESCRITIVOS DE CARGOS TÉC ADM GESTÃO - COM MOD.docx",
        "asset": "template-individual.docx",
        "regra": {"tipo": "sempre", "coluna": "", "operador": "igual",
                  "valor": "", "exigeFamilia": False},
    },
]


def b64(nome: str) -> str:
    caminho = ASSETS / nome
    if not caminho.exists():
        sys.exit(f"Asset ausente: {caminho}")
    return base64.b64encode(caminho.read_bytes()).decode("ascii")


def texto(caminho: pathlib.Path) -> str:
    if not caminho.exists():
        sys.exit(f"Fonte ausente: {caminho}")
    return caminho.read_text(encoding="utf-8")


def compor_shell() -> str:
    """Esqueleto completo, com os dois marcadores intactos."""
    estilos = texto(SRC / "styles.css")
    corpo = texto(SRC / "body.html")
    app = texto(SRC / "app.js")
    jszip = texto(ASSETS / "jszip.min.js")

    if MARCADOR_SHELL not in app:
        sys.exit(f"src/app.js precisa conter o marcador {MARCADOR_SHELL}")

    return f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta name="color-scheme" content="light">
<title>Gerador de Mapas de Carreira</title>
<style>
{estilos}
</style>
</head>
<body>
{corpo}
<script>{jszip}</script>
<script>
{MARCADOR_FONTES}
</script>
<script>
{app}
</script>
</body>
</html>
"""


def literal_shell(shell: str) -> str:
    """
    Serializa o shell como literal JS.

    O escape de "</" evita que um </script> dentro da string encerre o
    bloco <script> que a contém. Em JS, "<\\/" e "</" são a mesma coisa.
    """
    return json.dumps(shell).replace("</", "<\\/")


def fontes_embutidas() -> str:
    modelos = []
    for m in MODELOS_PADRAO:
        modelos.append({
            "id": m["id"], "nome": m["nome"], "arquivo": m["arquivo"],
            "regra": m["regra"], "origem": "padrao",
            "tipo": "base64", "dados": b64(m["asset"]),
        })
    fontes = {
        "logo": "data:image/png;base64," + b64("logo.png"),
        "base": {"tipo": "base64", "nome": "Base incorporada", "dados": b64("base.xlsx")},
        "modelos": modelos,
    }
    return "window.GMC=" + json.dumps(fontes, ensure_ascii=False) + ";"


def montar(fontes_js: str) -> str:
    shell = compor_shell()
    html = shell.replace(MARCADOR_FONTES, fontes_js, 1)
    return html.replace(MARCADOR_SHELL, literal_shell(shell), 1)


def main() -> None:
    html = montar(fontes_embutidas())
    SAIDA.write_text(html, encoding="utf-8")
    mb = SAIDA.stat().st_size / 1_048_576
    print(f"Gerado: {SAIDA.name} ({mb:.1f} MB)")
    print(f"  modelos embutidos: {len(MODELOS_PADRAO)}")
    print(f"  shell para autogeração: {len(compor_shell()) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
