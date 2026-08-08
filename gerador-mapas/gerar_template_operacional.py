#!/usr/bin/env python3
"""
Gera assets/template-operacional.docx a partir do template de carreira.

    python3 gerar_template_operacional.py

O modelo operacional (ex.: OPERADOR DE MÁQUINAS) tem QUATRO níveis —
I, II, III e ESPECIALIZADO — enquanto o de carreira tem três (JR/PL/SR).
Em vez de montar um .docx do zero, este script reaproveita o arquivo
oficial como recipiente: ficam preservados o cabeçalho com o logotipo,
o rodapé, as fontes, os estilos e a configuração de página. Só o corpo
(word/document.xml) e reescrito, com as tabelas do mapa operacional.

Os campos saem como MERGEFIELD de verdade, iguais aos dos outros
modelos, para que a ferramenta os reconheca e proponha o mapeamento.
"""

import pathlib
import re
import shutil
import sys
import zipfile

RAIZ = pathlib.Path(__file__).parent
ASSETS = RAIZ / "assets"
ORIGEM = ASSETS / "template-carreira.docx"
DESTINO = ASSETS / "template-operacional.docx"

LARGURA = 10490                      # largura total da tabela, em dxa
NIVEIS = ["NÍVEL I", "NÍVEL II", "NÍVEL III", "ESPECIALIZADO"]


def esc(t: str) -> str:
    return t.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def pPr(negrito: bool, centro: bool) -> str:
    rpr = '<w:rPr><w:rFonts w:cstheme="minorHAnsi"/>' + ('<w:b/>' if negrito else '') \
        + '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
    jc = '<w:jc w:val="center"/>' if centro else ''
    return ('<w:pPr><w:widowControl w:val="0"/><w:autoSpaceDE w:val="0"/>'
            '<w:autoSpaceDN w:val="0"/>' + jc + rpr + '</w:pPr>')


def rPr(negrito: bool) -> str:
    return '<w:rPr><w:rFonts w:cstheme="minorHAnsi"/>' + ('<w:b/>' if negrito else '') \
        + '<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'


def paragrafo_texto(texto: str, negrito: bool, centro: bool) -> str:
    return ('<w:p>' + pPr(negrito, centro)
            + '<w:r>' + rPr(negrito) + '<w:t xml:space="preserve">' + esc(texto) + '</w:t></w:r>'
            + '</w:p>')


def paragrafo_campo(campo: str, negrito: bool, centro: bool) -> str:
    """Campo de mesclagem completo, como o Word grava."""
    r = rPr(negrito)
    return ('<w:p>' + pPr(negrito, centro)
            + '<w:r>' + r + '<w:fldChar w:fldCharType="begin"/></w:r>'
            + '<w:r>' + r + '<w:instrText xml:space="preserve"> MERGEFIELD '
            + esc(campo) + ' \\* MERGEFORMAT </w:instrText></w:r>'
            + '<w:r>' + r + '<w:fldChar w:fldCharType="separate"/></w:r>'
            + '<w:r>' + r + '<w:t>«' + esc(campo) + '»</w:t></w:r>'
            + '<w:r>' + r + '<w:fldChar w:fldCharType="end"/></w:r>'
            + '</w:p>')


def celula(conteudo: str, largura: int, span: int = 1) -> str:
    gs = f'<w:gridSpan w:val="{span}"/>' if span > 1 else ''
    return (f'<w:tc><w:tcPr><w:tcW w:w="{largura}" w:type="dxa"/>{gs}'
            f'<w:vAlign w:val="center"/></w:tcPr>{conteudo}</w:tc>')


def linha(celulas: str) -> str:
    return '<w:tr><w:trPr><w:trHeight w:val="454"/></w:trPr>' + celulas + '</w:tr>'


def tabela(colunas: list, linhas: str) -> str:
    grid = ''.join(f'<w:gridCol w:w="{c}"/>' for c in colunas)
    return ('<w:tbl><w:tblPr><w:tblStyle w:val="Tabelacomgrade"/>'
            f'<w:tblW w:w="{LARGURA}" w:type="dxa"/>'
            '<w:tblInd w:w="-5" w:type="dxa"/>'
            '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1"'
            ' w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>'
            f'<w:tblGrid>{grid}</w:tblGrid>{linhas}</w:tbl>')


def espaco() -> str:
    return '<w:p><w:pPr><w:rPr><w:sz w:val="12"/></w:rPr></w:pPr></w:p>'


# ---------------------------------------------------------------- blocos

COL4 = [LARGURA // 4] * 3 + [LARGURA - 3 * (LARGURA // 4)]
COL2 = [3402, LARGURA - 3402]


def bloco_cabecalho() -> str:
    pares = [
        ("EMPRESA", "EMPRESA"), ("NOME DO CARGO", "NOME_COMPLETO"),
        ("CBO", "CBO"), ("TRILHA DE CARREIRA", "TCLC_DESC"),
        ("DATA DA CRIAÇÃO", "DT_ATIVACAO"), ("DATA DE REVISÃO", "DATA_REVISAO"),
    ]
    linhas = ''.join(
        linha(celula(paragrafo_texto(rotulo, True, False), COL2[0])
              + celula(paragrafo_campo(campo, False, False), COL2[1]))
        for rotulo, campo in pares)
    return tabela(COL2, linhas)


def bloco_por_nivel(titulo: str, campo: str) -> str:
    ls = linha(celula(paragrafo_texto(titulo, True, True), LARGURA, 4))
    ls += linha(''.join(celula(paragrafo_texto(n, True, True), COL4[i])
                        for i, n in enumerate(NIVEIS)))
    ls += linha(''.join(celula(paragrafo_campo(campo, False, True), COL4[i])
                        for i in range(4)))
    return tabela(COL4, ls)


def bloco_unico(titulo: str, campo: str) -> str:
    ls = linha(celula(paragrafo_texto(titulo, True, True), LARGURA))
    ls += linha(celula(paragrafo_campo(campo, False, False), LARGURA))
    return tabela([LARGURA], ls)


def bloco_min_desejavel(titulo: str, rotulo_min: str, campo_min,
                        rotulo_des: str, campo_des) -> str:
    """campo_* pode ser um nome de campo ou um texto fixo (tupla ('texto', valor))."""
    def faixa(rotulo, campo):
        out = linha(celula(paragrafo_texto(rotulo, True, True), LARGURA, 4))
        out += linha(''.join(celula(paragrafo_texto(n, True, True), COL4[i])
                             for i, n in enumerate(NIVEIS)))
        if isinstance(campo, tuple):
            out += linha(''.join(celula(paragrafo_texto(campo[1], False, True), COL4[i])
                                 for i in range(4)))
        else:
            out += linha(''.join(celula(paragrafo_campo(campo, False, True), COL4[i])
                                 for i in range(4)))
        return out

    ls = linha(celula(paragrafo_texto(titulo, True, True), LARGURA, 4))
    ls += faixa(rotulo_min, campo_min)
    ls += faixa(rotulo_des, campo_des)
    return tabela(COL4, ls)


def bloco_competencias() -> str:
    ls = linha(celula(paragrafo_texto("COMPETÊNCIAS MARCOPOLO DESEJÁVEIS", True, True), LARGURA))
    ls += linha(celula(paragrafo_texto("DESEJÁVEIS", True, True), LARGURA))
    ls += linha(celula(paragrafo_campo("SKILL_37", False, False), LARGURA))
    return tabela([LARGURA], ls)


def corpo() -> str:
    partes = [
        paragrafo_texto("MAPA DE CARREIRA", True, True),
        espaco(),
        bloco_cabecalho(), espaco(),
        bloco_por_nivel("CÓDIGO DOS CARGOS", "COD_DO_CARGO"), espaco(),
        bloco_por_nivel("CARACTERÍSTICAS DE ATUAÇÃO DENTRO DO NÍVEL DE MATURIDADE NA CARREIRA",
                        "TEXTO_RESULTADO_ESPERADO"), espaco(),
        bloco_unico("MISSÃO", "ATIV_DESC"), espaco(),
        bloco_por_nivel("PRINCIPAIS RESPONSABILIDADES/ATIVIDADES", "DESCRICAO_CARGO"), espaco(),
        bloco_min_desejavel("ESCOLARIDADE / FORMAÇÃO ACADÊMICA",
                            "MÍNIMA", "SKILL_30", "DESEJÁVEL", "SKILL_31"), espaco(),
        bloco_min_desejavel("COMPETÊNCIAS TÉCNICAS | CURSOS | CERTIFICAÇÕES | DEMAIS QUALIFICAÇÕES",
                            "MÍNIMA", "SKILL_34", "DESEJÁVEL", "SKILL_35"), espaco(),
        bloco_min_desejavel("EXPERIÊNCIA PROFISSIONAL",
                            "MÍNIMA", ("texto", "NÃO REQUERIDO."),
                            "DESEJÁVEL", "SKILL_36"), espaco(),
        bloco_competencias(),
    ]
    return ''.join(partes)


def main() -> None:
    if not ORIGEM.exists():
        sys.exit(f"Origem ausente: {ORIGEM}")

    original = zipfile.ZipFile(ORIGEM).read("word/document.xml").decode("utf-8")

    # preserva a configuração de página, que carrega cabeçalho e rodapé
    m = re.search(r"<w:sectPr\b.*?</w:sectPr>", original, re.S)
    if not m:
        sys.exit("sectPr não encontrado no modelo de origem.")
    sect = m.group(0)

    abertura = original[:original.index("<w:body>") + len("<w:body>")]
    novo = abertura + corpo() + sect + "</w:body></w:document>"

    shutil.copy2(ORIGEM, DESTINO)
    # regrava o zip trocando apenas o corpo
    origem_zip = zipfile.ZipFile(ORIGEM)
    with zipfile.ZipFile(DESTINO, "w", zipfile.ZIP_DEFLATED) as saida:
        for item in origem_zip.infolist():
            dados = origem_zip.read(item.filename)
            if item.filename == "word/document.xml":
                dados = novo.encode("utf-8")
            saida.writestr(item, dados)

    kb = DESTINO.stat().st_size / 1024
    print(f"Gerado: {DESTINO.name} ({kb:.0f} KB)")
    print(f"  níveis: {', '.join(NIVEIS)}")


if __name__ == "__main__":
    main()
