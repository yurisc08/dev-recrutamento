#!/usr/bin/env python3
"""Gera os diagramas do fluxo de controle de atestados (SVG -> PNG via Chromium).

Uso:
    python3 gerar_diagramas.py           # gera os .svg
    ./renderizar.sh                      # gera os .svg e converte para .png
"""
from __future__ import annotations

import html
import os
from dataclasses import dataclass, field

# --------------------------------------------------------------------------- #
# Paleta
# --------------------------------------------------------------------------- #
TINTA = "#0f172a"
TINTA_2 = "#475569"
TINTA_3 = "#64748b"
FUNDO = "#ffffff"
LINHA = "#94a3b8"

ACENTOS = {
    "colaborador": ("#2563eb", "#eff6ff"),
    "controle": ("#4f46e5", "#eef2ff"),
    "plataforma": ("#7c3aed", "#f5f3ff"),
    "enfermaria": ("#059669", "#ecfdf5"),
    "integracao": ("#ea580c", "#fff7ed"),
    "governanca": ("#be123c", "#fff1f2"),
}

FONTE = "'DejaVu Sans', 'Segoe UI', Arial, sans-serif"

# --------------------------------------------------------------------------- #
# Utilitários de texto
# --------------------------------------------------------------------------- #
# Larguras aproximadas da DejaVu Sans, em fração do font-size.
_ESTREITOS = "iljt.,;:!|'\"()[]{}/\\ "
_LARGOS = "mwMW—–"


def largura(texto: str, tamanho: float, negrito: bool = False) -> float:
    total = 0.0
    for c in texto:
        if c == " ":
            total += 0.318
        elif c in _ESTREITOS:
            total += 0.36
        elif c in _LARGOS:
            total += 0.94
        elif c.isdigit():
            total += 0.636
        elif c.isupper():
            total += 0.70
        else:
            total += 0.62
    return total * tamanho * (1.07 if negrito else 1.0)


def quebrar(texto: str, disponivel: float, tamanho: float, negrito: bool = False) -> list[str]:
    linhas: list[str] = []
    atual = ""
    for palavra in texto.split():
        teste = f"{atual} {palavra}".strip()
        if largura(teste, tamanho, negrito) <= disponivel or not atual:
            atual = teste
        else:
            linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas


def esc(t: str) -> str:
    return html.escape(t, quote=False)


# --------------------------------------------------------------------------- #
# Primitivas de desenho
# --------------------------------------------------------------------------- #
@dataclass
class Tela:
    largura: int
    altura: int
    partes: list[str] = field(default_factory=list)
    cores_seta: set[str] = field(default_factory=set)

    def add(self, s: str) -> None:
        self.partes.append(s)

    # -- formas ------------------------------------------------------------- #
    def retangulo(self, x, y, w, h, **kw) -> None:
        attrs = {
            "fill": kw.get("fill", "#ffffff"),
            "stroke": kw.get("stroke", "none"),
            "stroke-width": kw.get("stroke_width", 1.5),
            "rx": kw.get("rx", 10),
        }
        if kw.get("dash"):
            attrs["stroke-dasharray"] = kw["dash"]
        if kw.get("opacity"):
            attrs["opacity"] = kw["opacity"]
        self.add(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" '
            + " ".join(f'{k}="{v}"' for k, v in attrs.items())
            + "/>"
        )

    def texto(self, x, y, conteudo, tamanho=15, cor=TINTA, negrito=False,
              ancora="start", italico=False, espacamento=0.0) -> None:
        peso = ' font-weight="700"' if negrito else ""
        it = ' font-style="italic"' if italico else ""
        ls = f' letter-spacing="{espacamento}"' if espacamento else ""
        self.add(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONTE}" font-size="{tamanho}" '
            f'fill="{cor}" text-anchor="{ancora}"{peso}{it}{ls}>{esc(conteudo)}</text>'
        )

    def paragrafo(self, x, y, texto, disponivel, tamanho=15, cor=TINTA_2,
                  altura_linha=21, negrito=False, ancora="start") -> float:
        for i, linha in enumerate(quebrar(texto, disponivel, tamanho, negrito)):
            self.texto(x, y + i * altura_linha, linha, tamanho, cor, negrito, ancora)
        return y + len(quebrar(texto, disponivel, tamanho, negrito)) * altura_linha

    def linha(self, pontos, cor=LINHA, largura_traco=2.2, dash=None, seta=True) -> None:
        d = " ".join(f"{'M' if i == 0 else 'L'} {p[0]:.1f} {p[1]:.1f}" for i, p in enumerate(pontos))
        marcador = ""
        if seta:
            self.cores_seta.add(cor)
            marcador = f' marker-end="url(#seta-{cor.strip("#")})"'
        traco = f' stroke-dasharray="{dash}"' if dash else ""
        self.add(
            f'<path d="{d}" fill="none" stroke="{cor}" stroke-width="{largura_traco}" '
            f'stroke-linejoin="round" stroke-linecap="round"{traco}{marcador}/>'
        )

    def rotulo_linha(self, x, y, texto, cor=TINTA_3, tamanho=13.5) -> None:
        w = largura(texto, tamanho, True) + 16
        self.retangulo(x - w / 2, y - 12, w, 24, fill="#ffffff", rx=6, stroke="none")
        self.texto(x, y + 5, texto, tamanho, cor, negrito=True, ancora="middle")

    # -- saída -------------------------------------------------------------- #
    def svg(self) -> str:
        defs = "".join(
            f'<marker id="seta-{c.strip("#")}" viewBox="0 0 12 12" refX="9" refY="6" '
            f'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M 1 1 L 10 6 L 1 11 z" fill="{c}"/></marker>'
            for c in sorted(self.cores_seta)
        )
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.largura}" '
            f'height="{self.altura}" viewBox="0 0 {self.largura} {self.altura}">'
            f"<defs>{defs}</defs>"
            f'<rect width="{self.largura}" height="{self.altura}" fill="{FUNDO}"/>'
            + "".join(self.partes)
            + "</svg>"
        )


@dataclass
class Caixa:
    x: float
    y: float
    w: float
    h: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    @property
    def direita(self) -> float:
        return self.x + self.w

    @property
    def base(self) -> float:
        return self.y + self.h


def cartao(t: Tela, x, y, w, titulo, corpo, acento, minimo=0.0, marcador=True) -> Caixa:
    """Cartão branco com barra colorida à esquerda. Altura calculada pelo conteúdo."""
    cor, _ = ACENTOS[acento]
    pad = 16
    disp = w - 2 * pad - 8
    linhas_titulo = quebrar(titulo, disp, 17, True)
    linhas_corpo = quebrar(corpo, disp, 14.5) if corpo else []
    h = max(minimo, pad + len(linhas_titulo) * 22 + (6 if linhas_corpo else 0)
            + len(linhas_corpo) * 19.5 + pad)

    t.retangulo(x + 3, y + 4, w, h, fill="#0f172a", opacity="0.05", rx=12, stroke="none")
    t.retangulo(x, y, w, h, fill="#ffffff", stroke=cor + "55", stroke_width=1.5, rx=12)
    if marcador:
        t.add(
            f'<path d="M {x + 1:.1f} {y + 13:.1f} q 0 -12 12 -12 l 0 {h - 2:.1f} '
            f'q -12 0 -12 -12 z" fill="{cor}"/>'
        )
    tx = x + pad + 8
    ty = y + pad + 15
    for i, linha in enumerate(linhas_titulo):
        t.texto(tx, ty + i * 22, linha, 17, TINTA, negrito=True)
    cy = ty + len(linhas_titulo) * 22 + 4
    for i, linha in enumerate(linhas_corpo):
        t.texto(tx, cy + i * 19.5, linha, 14.5, TINTA_2)
    return Caixa(x, y, w, h)


def cabecalho(t: Tela, titulo: str, subtitulo: str, etiqueta: str) -> None:
    t.retangulo(0, 0, t.largura, 6, fill=ACENTOS["plataforma"][0], rx=0, stroke="none")
    t.texto(60, 62, etiqueta.upper(), 15, ACENTOS["plataforma"][0], negrito=True, espacamento=2.6)
    t.texto(60, 106, titulo, 38, TINTA, negrito=True)
    t.paragrafo(60, 140, subtitulo, t.largura - 120, 19, TINTA_3, 26)


def rodape(t: Tela, texto: str) -> None:
    t.texto(60, t.altura - 26, texto, 14, TINTA_3, italico=True)


# --------------------------------------------------------------------------- #
# Diagrama 1 — fluxo em raias
# --------------------------------------------------------------------------- #
def diagrama_fluxo() -> Tela:
    L, A = 2560, 1740
    t = Tela(L, A)
    cabecalho(
        t,
        "Fluxo ideal do controle de atestados",
        "Da entrega pelo colaborador até a baixa no RSData — desenhado para operar com muita gente em paralelo "
        "e para tratar atestado como dado pessoal sensível (LGPD, art. 11).",
        "Protótipo · Supabase + Cloudflare",
    )

    x0, x1 = 250, 2500
    col_w = (x1 - x0) / 7
    cx = [x0 + col_w * i + col_w / 2 for i in range(7)]
    cw = col_w - 30

    etapas = [
        "1 · Entrega",
        "2 · Protocolo e triagem",
        "3 · Fila e atribuição",
        "4 · Análise clínica",
        "5 · Decisão",
        "6 · Integração",
        "7 · Encerramento",
    ]
    y_etapa = 214
    for i, nome in enumerate(etapas):
        t.retangulo(cx[i] - cw / 2, y_etapa - 24, cw, 34, fill="#f1f5f9", rx=17, stroke="none")
        t.texto(cx[i], y_etapa, nome, 15.5, TINTA_2, negrito=True, ancora="middle")

    raias = [
        ("colaborador", "Colaborador\ne liderança", 258, 176),
        ("controle", "Controle\n(setor gestor)", 434, 206),
        ("plataforma", "Plataforma\n(automações)", 640, 250),
        ("enfermaria", "Enfermaria\nSESMT", 890, 236),
        ("integracao", "Sistemas\nde destino", 1126, 214),
        ("governanca", "RH, gestão\ne auditoria", 1340, 196),
    ]
    pos = {}
    for chave, rotulo, y, h in raias:
        cor, tint = ACENTOS[chave]
        t.retangulo(60, y, L - 120, h, fill=tint, rx=14, stroke="none")
        t.retangulo(60, y, 176, h, fill=cor, opacity="0.10", rx=14, stroke="none")
        t.retangulo(60, y, 6, h, fill=cor, rx=3, stroke="none")
        for i, linha in enumerate(rotulo.split("\n")):
            t.texto(86, y + h / 2 - 6 + i * 21, linha, 16, cor, negrito=True)
        pos[chave] = (y, h)

    def por(chave, col, titulo, corpo, minimo=0.0):
        y, h = pos[chave]
        provisoria = cartao(Tela(1, 1), 0, 0, cw, titulo, corpo, chave, minimo)
        return cartao(t, cx[col] - cw / 2, y + (h - provisoria.h) / 2, cw,
                      titulo, corpo, chave, minimo)

    # ---- raia 1: colaborador ------------------------------------------------
    a0 = por("colaborador", 0, "Entrega em até 48 h",
             "Foto pelo link seguro no celular ou papel entregue à liderança. O protocolo sai na hora.")
    a6 = por("colaborador", 6, "Recebe o desfecho",
             "Aviso com protocolo, período abonado e resultado. Sem CID, sem imagem do documento.")

    # ---- raia 2: controle ---------------------------------------------------
    b0 = por("controle", 0, "Digitalização única",
             "Escaneia, confere matrícula e identidade, anexa o original. O papel para de circular aqui.")
    b4 = por("controle", 4, "Pendência tratada",
             "Ilegível ou dado divergente volta para 2ª via, com prazo contando no próprio protocolo.")

    # ---- raia 3: plataforma -------------------------------------------------
    c1 = por("plataforma", 1, "Protocolo e crítica automática",
             "Numera (ATT-AAAAMM-000000) com carimbo de tempo, roda OCR, bloqueia duplicidade por hash "
             "e critica datas, matrícula e tipo. Arquivo cifrado em bucket privado.")
    c2 = por("plataforma", 2, "Prioriza e distribui",
             "Ordena por dias de afastamento, reincidência e acidente. Marca o SLA e avisa antes de estourar.")
    c5 = por("plataforma", 5, "Outbox idempotente",
             "Um job por destino, com chave única. Repete com espera crescente e isola a falha sem travar o resto.")
    c6 = por("plataforma", 6, "Guarda e expurgo",
             "Trilha imutável de quem viu e quem decidiu. Retenção de 20 anos (NR-07) e descarte programado.")

    # ---- raia 4: enfermaria -------------------------------------------------
    d2 = por("enfermaria", 2, "Assume o caso",
             "Trava exclusiva: dois profissionais nunca analisam o mesmo atestado. Fila compartilhada, "
             "nunca caixa de e-mail pessoal.")
    d3 = por("enfermaria", 3, "Análise clínica",
             "Confere emitente e registro no conselho, coerência do período, CID e restrição funcional. "
             "Registra o parecer.")
    y_d, h_d = pos["enfermaria"]
    d4 = Caixa(cx[4] - cw / 2, y_d + 46, cw, h_d - 92)
    cor_e = ACENTOS["enfermaria"][0]
    t.add(
        f'<path d="M {d4.x + 34:.1f} {d4.y:.1f} L {d4.direita - 34:.1f} {d4.y:.1f} '
        f'L {d4.direita:.1f} {d4.cy:.1f} L {d4.direita - 34:.1f} {d4.base:.1f} '
        f'L {d4.x + 34:.1f} {d4.base:.1f} L {d4.x:.1f} {d4.cy:.1f} Z" '
        f'fill="#ffffff" stroke="{cor_e}" stroke-width="2"/>'
    )
    t.texto(d4.cx, d4.cy - 16, "Decisão registrada", 17, TINTA, negrito=True, ancora="middle")
    t.texto(d4.cx, d4.cy + 10, "validar · pendência · rejeitar", 14.5, TINTA_2, ancora="middle")
    t.texto(d4.cx, d4.cy + 32, "sempre com autor, data e motivo", 13, TINTA_3, ancora="middle")

    # ---- raia 5: integrações ------------------------------------------------
    y_i, h_i = pos["integracao"]
    destinos = [
        ("RSData", "prontuário ocupacional"),
        ("Folha e ponto", "abono e desconto"),
        ("BI / eSocial", "absenteísmo e obrigações"),
    ]
    alt = 44
    topo = y_i + (h_i - (len(destinos) * alt + (len(destinos) - 1) * 8)) / 2
    cor_i = ACENTOS["integracao"][0]
    for i, (nome, desc) in enumerate(destinos):
        yy = topo + i * (alt + 8)
        t.retangulo(cx[5] - cw / 2, yy, cw, alt, fill="#ffffff", stroke=cor_i + "55", rx=10)
        t.retangulo(cx[5] - cw / 2, yy, 5, alt, fill=cor_i, rx=2, stroke="none")
        t.texto(cx[5] - cw / 2 + 18, yy + 20, nome, 15.5, TINTA, negrito=True)
        t.texto(cx[5] - cw / 2 + 18, yy + 36, desc, 13, TINTA_3)
    e5 = Caixa(cx[5] - cw / 2, topo, cw, len(destinos) * alt + (len(destinos) - 1) * 8)
    e6 = por("integracao", 6, "Recibo confirmado",
             "Só vira Integrado quando todos os destinos respondem. Falha isolada fica em Erro de integração.")

    # ---- raia 6: governança -------------------------------------------------
    f4 = por("governanca", 4, "Gatilhos legais",
             "A partir de 15 dias, encaminha ao INSS. Acidente de trabalho abre CAT em 1 dia útil. "
             "Suspeita de fraude vai para auditoria.")
    f6 = por("governanca", 6, "Visão por papel",
             "Gestor vê ausência e período; auditoria vê a trilha. O CID não sai do SESMT.")

    # ---- conexões -----------------------------------------------------------
    az, ind, vio, ver, lar, ros = (ACENTOS[k][0] for k in
                                   ("colaborador", "controle", "plataforma",
                                    "enfermaria", "integracao", "governanca"))

    t.linha([(a0.cx, a0.base), (a0.cx, b0.y - 6)], az)
    t.linha([(b0.direita, b0.cy), (cx[1] - cw / 2 - 26, b0.cy),
             (cx[1] - cw / 2 - 26, c1.cy), (c1.x - 6, c1.cy)], ind)
    t.linha([(c1.direita, c1.cy), (c2.x - 6, c2.cy)], vio)
    t.linha([(c2.cx, c2.base), (c2.cx, d2.y - 6)], vio)
    t.linha([(d2.direita, d2.cy), (d3.x - 6, d3.cy)], ver)
    t.linha([(d3.direita, d3.cy), (d4.x - 6, d4.cy)], ver)

    # decisão -> validado -> outbox
    t.linha([(d4.direita, d4.cy - 26), (cx[5] - cw / 2 - 24, d4.cy - 26),
             (cx[5] - cw / 2 - 24, c5.cy), (c5.x - 6, c5.cy)], ver)
    t.rotulo_linha((d4.direita + cx[5] - cw / 2 - 24) / 2, d4.cy - 26, "validado", ver)

    # decisão -> pendência (sobe)
    t.linha([(d4.cx, d4.y), (d4.cx, b4.base + 6)], ver)
    t.rotulo_linha(d4.cx, (d4.y + b4.base) / 2, "pendência", ver)

    # pendência -> reentra na triagem
    t.linha([(b4.x - 6, b4.cy), (c1.cx, b4.cy), (c1.cx, c1.y - 6)], ind, dash="7 6")
    t.rotulo_linha(c1.cx + 150, b4.cy, "reentra na triagem", ind, 12.5)

    # decisão -> gatilhos legais (desce)
    t.linha([(d4.cx, d4.base), (d4.cx, f4.y - 6)], ros, dash="7 6")
    t.rotulo_linha(d4.cx, (d4.base + f4.y) / 2, "≥ 15 dias · acidente", ros, 12.5)

    # decisão -> rejeitado -> encerramento
    y_rej = d4.base - 18
    t.linha([(d4.direita, y_rej), (c6.cx - 78, y_rej), (c6.cx - 78, c6.base + 6)], ver, dash="7 6")
    t.rotulo_linha((d4.direita + c6.cx - 78) / 2, y_rej, "rejeitado (com motivo)", ver, 12.5)

    t.linha([(c5.cx - 40, c5.base), (c5.cx - 40, e5.y - 6)], vio)
    t.linha([(e5.x + e5.w, e5.cy), (e6.x - 6, e6.cy)], lar)
    t.linha([(e6.cx + 60, e6.y), (e6.cx + 60, c6.base + 6)], lar)
    t.linha([(c6.cx, c6.y), (c6.cx, a6.base + 6)], vio)
    t.linha([(e6.direita - 40, e6.base), (e6.direita - 40, f6.y - 6)], lar)

    # ---- faixa de controles transversais -----------------------------------
    y_ctrl = 1570
    t.retangulo(60, y_ctrl, L - 120, 112, fill="#0f172a", rx=16, stroke="none")
    t.texto(88, y_ctrl + 36, "ATRAVESSA TODAS AS ETAPAS", 13.5, "#94a3b8",
            negrito=True, espacamento=2.2)
    controles = [
        "Base legal: obrigação legal e tutela da saúde",
        "Minimização: CID só onde é indispensável",
        "Cifragem em repouso + link assinado de 5 min",
        "MFA para quem abre dado clínico",
        "Trilha imutável de acesso e decisão",
        "Nada por WhatsApp ou e-mail pessoal",
    ]
    x = 88
    for texto in controles:
        w = largura(texto, 14, False) + 46
        t.retangulo(x, y_ctrl + 54, w, 40, fill="#1e293b", rx=20, stroke="none")
        t.add(f'<circle cx="{x + 22:.1f}" cy="{y_ctrl + 74:.1f}" r="5" fill="#38bdf8"/>')
        t.texto(x + 36, y_ctrl + 79, texto, 14, "#e2e8f0")
        x += w + 14

    rodape(t, "Estados do registro: rascunho · aguardando_validacao · em_analise · pendente_informacao · "
              "validado · rejeitado · integrado · erro_integracao")
    return t


# --------------------------------------------------------------------------- #
# Diagrama 2 — ciclo de vida, convivência entre times e matriz de acesso
# --------------------------------------------------------------------------- #
def diagrama_governanca() -> Tela:
    L, A = 2560, 1760
    t = Tela(L, A)
    cabecalho(
        t,
        "Ciclo de vida, convivência entre times e quem enxerga o quê",
        "As três respostas que o fluxo precisa dar quando muita gente opera ao mesmo tempo sobre dado de saúde: "
        "em que estado o caso está, como ele não fica parado, e até onde cada papel enxerga.",
        "Protótipo · Governança do fluxo",
    )

    # ---- ciclo de vida ------------------------------------------------------
    t.texto(60, 216, "1 · Ciclo de vida do atestado", 21, TINTA, negrito=True)
    t.texto(60, 244, "Toda transição grava autor, horário e motivo — o registro é a prova de que o prazo legal foi cumprido.",
            15, TINTA_3)

    estados_topo = [
        ("rascunho", "controlador digitalizando", "controle"),
        ("aguardando_validacao", "na fila do SESMT", "controle"),
        ("em_analise", "alguém assumiu", "enfermaria"),
        ("validado", "parecer emitido", "enfermaria"),
        ("integrado", "baixado nos sistemas", "integracao"),
    ]
    estados_baixo = [
        (2, "pendente_informacao", "aguarda 2ª via", "controle"),
        (3, "rejeitado", "fora do padrão, com motivo", "governanca"),
        (4, "erro_integracao", "destino recusou o envio", "governanca"),
    ]

    ew, eh = 344, 88
    ex0, gap = 60, 62
    y_top, y_bot = 302, 492

    def estado(x, y, nome, desc, acento, tracejado=False):
        cor = ACENTOS[acento][0]
        t.retangulo(x, y, ew, eh, fill="#ffffff", stroke=cor + "66", rx=12,
                    dash="6 5" if tracejado else None)
        t.retangulo(x, y, ew, 5, fill=cor, rx=2, stroke="none")
        t.texto(x + 22, y + 40, nome, 18.5, TINTA, negrito=True)
        t.texto(x + 22, y + 66, desc, 14.5, TINTA_3)
        return Caixa(x, y, ew, eh)

    topo = [estado(ex0 + i * (ew + gap), y_top, n, d, a)
            for i, (n, d, a) in enumerate(estados_topo)]
    baixo = {col: estado(ex0 + col * (ew + gap), y_bot, n, d, a, True)
             for col, n, d, a in estados_baixo}

    transicoes = [
        (0, 1, "controlador envia"),
        (1, 2, "enfermaria assume"),
        (2, 3, "parecer favorável"),
        (3, 4, "destinos confirmaram"),
    ]
    for a, b, rot in transicoes:
        t.linha([(topo[a].direita, topo[a].cy), (topo[b].x - 6, topo[b].cy)], LINHA)
        t.rotulo_linha((topo[a].direita + topo[b].x) / 2, topo[a].y - 14, rot, TINTA_3, 12.5)

    # em_analise -> pendente_informacao -> volta para a fila
    t.linha([(topo[2].cx - 70, topo[2].base), (topo[2].cx - 70, baixo[2].y - 6)], LINHA)
    t.rotulo_linha(topo[2].cx - 70, (topo[2].base + baixo[2].y) / 2, "falta documento", TINTA_3, 12.5)
    t.linha([(baixo[2].x, baixo[2].cy), (baixo[2].x - 30, baixo[2].cy),
             (baixo[2].x - 30, topo[1].cy), (topo[1].direita + 6, topo[1].cy)], LINHA, dash="6 5")
    t.rotulo_linha(baixo[2].x - 30, baixo[2].cy + 44, "2ª via anexada", TINTA_3, 12.5)

    # em_analise -> rejeitado (pelo corredor entre as duas linhas)
    corredor_a = topo[2].base + 34
    t.linha([(topo[2].cx + 90, topo[2].base), (topo[2].cx + 90, corredor_a),
             (baixo[3].cx, corredor_a), (baixo[3].cx, baixo[3].y - 6)], LINHA)
    t.rotulo_linha(baixo[3].cx, corredor_a, "recusado", TINTA_3, 12.5)

    # validado -> erro_integracao -> reprocessa
    corredor_b = topo[3].base + 68
    t.linha([(topo[3].cx + 90, topo[3].base), (topo[3].cx + 90, corredor_b),
             (baixo[4].cx, corredor_b), (baixo[4].cx, baixo[4].y - 6)], LINHA)
    t.rotulo_linha(baixo[4].cx, corredor_b, "falhou 5 vezes", TINTA_3, 12.5)
    t.linha([(baixo[4].direita, baixo[4].cy), (baixo[4].direita + 34, baixo[4].cy),
             (baixo[4].direita + 34, topo[4].cy), (topo[4].direita + 6, topo[4].cy)],
            LINHA, dash="6 5")
    t.rotulo_linha(baixo[4].direita + 34, baixo[4].y - 26, "reprocessado", TINTA_3, 12.5)

    # ---- regras de convivência ---------------------------------------------
    t.texto(60, 660, "2 · Como o fluxo não engarrafa com muita gente", 21, TINTA, negrito=True)
    regras = [
        ("Fila única, nunca e-mail",
         "O caso mora na fila do setor. Ninguém depende de quem estava de plantão ontem."),
        ("Trava ao assumir",
         "Quem abre o caso o reserva. Some o retrabalho de duas pessoas analisando o mesmo atestado."),
        ("SLA visível e escalonamento",
         "8 h úteis para o parecer. Ao estourar, o caso sobe para o coordenador automaticamente."),
        ("Devolução com prazo",
         "Pendência não vira limbo: tem prazo no protocolo e volta para a fila quando respondida."),
        ("Digitalização em lote",
         "O controlador escaneia a pilha do dia; o sistema separa por colaborador e numera cada um."),
        ("Reenvio idempotente",
         "Repetir o envio não duplica afastamento no RSData — a chave do job é atestado + destino."),
    ]
    cw2 = (L - 120 - 2 * 30) / 3
    for i, (titulo, corpo) in enumerate(regras):
        col, lin = i % 3, i // 3
        cartao(t, 60 + col * (cw2 + 30), 696 + lin * 128, cw2, titulo, corpo, "plataforma", 116)

    # ---- matriz de acesso ---------------------------------------------------
    y_m = 1024
    t.texto(60, y_m, "3 · Matriz de acesso — segregação de campo, não só de tela", 21, TINTA, negrito=True)
    t.texto(60, y_m + 28,
            "O CID é o campo mais sensível do documento e não precisa sair do SESMT para o fluxo funcionar. "
            "A RLS do Supabase aplica esta matriz no banco, não no front-end.", 15, TINTA_3)

    colunas = ["Imagem do\ndocumento", "CID e parecer\nclínico", "Período e\nstatus",
               "Cadastro do\ncolaborador", "Trilha de\nauditoria", "Papéis e\nintegrações"]
    linhas = [
        ("Colaborador", ["proprio", "nao", "proprio", "proprio", "nao", "nao"]),
        ("Liderança e gestor", ["nao", "nao", "sim", "parcial", "nao", "nao"]),
        ("Controle (setor gestor)", ["sim", "nao", "sim", "sim", "parcial", "nao"]),
        ("Enfermaria / SESMT", ["sim", "sim", "sim", "sim", "parcial", "nao"]),
        ("RH e folha", ["nao", "nao", "sim", "sim", "nao", "nao"]),
        ("Auditoria e compliance", ["nao", "nao", "sim", "parcial", "sim", "nao"]),
        ("Administrador do sistema", ["nao", "nao", "sim", "sim", "sim", "sim"]),
    ]
    simbolos = {
        "sim": ("#059669", "acesso pleno"),
        "parcial": ("#d97706", "acesso parcial"),
        "proprio": ("#2563eb", "somente os próprios"),
        "nao": ("#cbd5e1", "sem acesso"),
    }

    mx, my = 60, y_m + 56
    col_papel = 430
    largura_tabela = L - 120
    col_dado = (largura_tabela - col_papel) / len(colunas)
    alt_cab, alt_linha = 76, 62

    t.retangulo(mx, my, largura_tabela, alt_cab + len(linhas) * alt_linha, fill="#ffffff",
                stroke="#e2e8f0", rx=14)
    t.retangulo(mx, my, largura_tabela, alt_cab, fill="#f8fafc", rx=14, stroke="none")
    t.retangulo(mx, my + alt_cab - 14, largura_tabela, 14, fill="#f8fafc", rx=0, stroke="none")
    t.texto(mx + 24, my + 44, "PAPEL", 13.5, TINTA_3, negrito=True, espacamento=1.8)
    for j, nome in enumerate(colunas):
        cxx = mx + col_papel + col_dado * j + col_dado / 2
        for k, parte in enumerate(nome.split("\n")):
            t.texto(cxx, my + 32 + k * 19, parte, 14, TINTA_2, negrito=True, ancora="middle")

    for i, (papel, valores) in enumerate(linhas):
        yy = my + alt_cab + i * alt_linha
        if i % 2 == 1:
            t.retangulo(mx + 1, yy, largura_tabela - 2, alt_linha, fill="#f8fafc", rx=0, stroke="none")
        t.add(f'<line x1="{mx}" y1="{yy}" x2="{mx + largura_tabela}" y2="{yy}" stroke="#e2e8f0"/>')
        t.texto(mx + 24, yy + alt_linha / 2 + 6, papel, 16, TINTA, negrito=(i in (2, 3)))
        for j, v in enumerate(valores):
            cor, _ = simbolos[v]
            cxx = mx + col_papel + col_dado * j + col_dado / 2
            cyy = yy + alt_linha / 2
            if v == "sim":
                t.add(f'<circle cx="{cxx:.1f}" cy="{cyy:.1f}" r="11" fill="{cor}"/>')
            elif v == "parcial":
                t.add(f'<circle cx="{cxx:.1f}" cy="{cyy:.1f}" r="11" fill="#ffffff" '
                      f'stroke="{cor}" stroke-width="2.5"/>')
                t.add(f'<path d="M {cxx:.1f} {cyy - 11:.1f} A 11 11 0 0 0 {cxx:.1f} {cyy + 11:.1f} Z" fill="{cor}"/>')
            elif v == "proprio":
                t.add(f'<circle cx="{cxx:.1f}" cy="{cyy:.1f}" r="11" fill="#ffffff" '
                      f'stroke="{cor}" stroke-width="2.5"/>')
                t.add(f'<circle cx="{cxx:.1f}" cy="{cyy:.1f}" r="4.5" fill="{cor}"/>')
            else:
                t.add(f'<line x1="{cxx - 8:.1f}" y1="{cyy:.1f}" x2="{cxx + 8:.1f}" y2="{cyy:.1f}" '
                      f'stroke="{cor}" stroke-width="3.5" stroke-linecap="round"/>')

    lx = mx
    ly = my + alt_cab + len(linhas) * alt_linha + 40
    for chave, (cor, rotulo) in simbolos.items():
        if chave == "sim":
            t.add(f'<circle cx="{lx + 11:.1f}" cy="{ly - 5:.1f}" r="11" fill="{cor}"/>')
        elif chave == "parcial":
            t.add(f'<circle cx="{lx + 11:.1f}" cy="{ly - 5:.1f}" r="11" fill="#ffffff" stroke="{cor}" stroke-width="2.5"/>')
            t.add(f'<path d="M {lx + 11:.1f} {ly - 16:.1f} A 11 11 0 0 0 {lx + 11:.1f} {ly + 6:.1f} Z" fill="{cor}"/>')
        elif chave == "proprio":
            t.add(f'<circle cx="{lx + 11:.1f}" cy="{ly - 5:.1f}" r="11" fill="#ffffff" stroke="{cor}" stroke-width="2.5"/>')
            t.add(f'<circle cx="{lx + 11:.1f}" cy="{ly - 5:.1f}" r="4.5" fill="{cor}"/>')
        else:
            t.add(f'<line x1="{lx + 3:.1f}" y1="{ly - 5:.1f}" x2="{lx + 19:.1f}" y2="{ly - 5:.1f}" '
                  f'stroke="{cor}" stroke-width="3.5" stroke-linecap="round"/>')
        t.texto(lx + 32, ly, rotulo, 14.5, TINTA_2)
        lx += 32 + largura(rotulo, 14.5) + 56

    t.texto(mx, ly + 34,
            "O administrador governa papéis, integrações e retenção — e por isso mesmo não recebe acesso ao "
            "documento nem ao CID: quem configura o controle não deveria ser quem lê o dado clínico.",
            14.5, TINTA_3, italico=True)

    rodape(t, "Toda leitura de documento ou de CID gera evento na trilha — inclusive as que não mudam o estado do atestado.")
    return t


# --------------------------------------------------------------------------- #
def main() -> None:
    destino = os.path.dirname(os.path.abspath(__file__))
    for nome, gerador in (("fluxo-ideal", diagrama_fluxo),
                          ("governanca-e-acessos", diagrama_governanca)):
        caminho = os.path.join(destino, f"{nome}.svg")
        with open(caminho, "w", encoding="utf-8") as fh:
            fh.write(gerador().svg())
        print(f"gerado: {caminho}")


if __name__ == "__main__":
    main()
