#!/usr/bin/env python3
"""
Monta a ferramenta em um único arquivo HTML autocontido.

    python3 build.py

Junta os fontes de src/ com os arquivos de assets/ (planilha, modelos
Word, logotipo e JSZip) codificados em base64. O resultado abre com
duplo clique, sem servidor e sem internet.
"""

import base64
import pathlib
import sys

RAIZ = pathlib.Path(__file__).parent
SRC = RAIZ / "src"
ASSETS = RAIZ / "assets"
SAIDA = RAIZ / "Gerador_Mapas_Carreira.html"

NOME_CARREIRA = "TEMPLATE OFICIAL_TÉC.ADMINISTRATIVO- SAP 4.docx"
NOME_INDIVIDUAL = "Descritivo de cargo individual"


def b64(nome: str) -> str:
    caminho = ASSETS / nome
    if not caminho.exists():
        sys.exit(f"Asset ausente: {caminho}")
    return base64.b64encode(caminho.read_bytes()).decode("ascii")


def texto(caminho: pathlib.Path) -> str:
    if not caminho.exists():
        sys.exit(f"Fonte ausente: {caminho}")
    return caminho.read_text(encoding="utf-8")


def js_string(valor: str) -> str:
    """Serializa como literal JS de aspas simples."""
    return "'" + valor.replace("\\", "\\\\").replace("'", "\\'") + "'"


def main() -> None:
    estilos = texto(SRC / "styles.css")
    corpo = texto(SRC / "body.html")
    app = texto(SRC / "app.js")
    jszip = texto(ASSETS / "jszip.min.js")

    constantes = "\n".join([
        f"const BASE={js_string(b64('base.xlsx'))};",
        f"const TPL_CARREIRA={js_string(b64('template-carreira.docx'))};",
        f"const TPL_CARREIRA_NOME={js_string(NOME_CARREIRA)};",
        f"const TPL_INDIVIDUAL={js_string(b64('template-individual.docx'))};",
        f"const TPL_INDIVIDUAL_NOME={js_string(NOME_INDIVIDUAL)};",
        f"const LOGO={js_string('data:image/png;base64,' + b64('logo.png'))};",
    ])

    html = f"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>Gerador de Mapas de Carreira</title>
<style>
{estilos}
</style>
</head>
<body>
{corpo}
<script>{jszip}</script>
<script>
{constantes}
</script>
<script>
{app}
</script>
</body>
</html>
"""

    SAIDA.write_text(html, encoding="utf-8")
    mb = SAIDA.stat().st_size / 1_048_576
    print(f"Gerado: {SAIDA.name} ({mb:.1f} MB)")


if __name__ == "__main__":
    main()
