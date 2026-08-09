#!/usr/bin/env python3
"""
Sobe a ferramenta num servidor local, sem instalar nada.

    python3 servidor.py                # só nesta máquina
    python3 servidor.py --rede         # libera para a rede local
    python3 servidor.py --porta 9000   # troca a porta

Usa apenas a biblioteca padrão do Python. Se a pasta web/ ainda não
existir, ela é gerada automaticamente.

Para uso individual não é preciso servidor nenhum: o arquivo
Gerador_Mapas_Carreira.html abre com duplo clique.
"""

import argparse
import http.server
import mimetypes
import pathlib
import socket
import subprocess
import sys
import threading
import webbrowser

RAIZ = pathlib.Path(__file__).parent
WEB = RAIZ / "web"

# O Python descobre os tipos MIME no sistema operacional, e no Windows isso
# varia conforme o que está registrado. Fixamos os que a ferramenta precisa
# para não depender da máquina.
MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
for ext, tipo in MIME.items():
    mimetypes.add_type(tipo, ext)


class Handler(http.server.SimpleHTTPRequestHandler):
    """Serve web/ com os tipos MIME corretos e cache adequado."""

    # keep-alive: a página pede 7 arquivos, e sem isso cada um abre
    # uma conexão nova. O handler já envia Content-Length em tudo.
    protocol_version = "HTTP/1.1"

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(WEB), **kw)

    def guess_type(self, path):
        ext = pathlib.Path(path).suffix.lower()
        return MIME.get(ext) or super().guess_type(path)

    def end_headers(self):
        caminho = self.path.split("?")[0]
        if caminho.startswith("/assets/"):
            # os assets carregam ?v=hash na URL: mudam de endereço quando mudam
            self.send_header("Cache-Control", "public, max-age=31536000")
        else:
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, formato, *args):
        # silencia o ruído de cada arquivo; erros continuam aparecendo
        codigo = args[1] if len(args) > 1 else ""
        if str(codigo).startswith(("4", "5")):
            sys.stderr.write(f"  {self.address_string()} {formato % args}\n")


def ip_da_rede() -> str:
    """
    IP desta máquina na rede local.

    O connect() em UDP não envia pacote nenhum: serve só para o sistema
    escolher por qual interface sairia o tráfego, e daí lemos o IP dela.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 53))
        ip = s.getsockname()[0]
        if not ip.startswith("127."):
            return ip
    except OSError:
        pass
    finally:
        s.close()
    try:
        ip = socket.gethostbyname(socket.gethostname())
        if not ip.startswith("127."):
            return ip
    except OSError:
        pass
    return "127.0.0.1"


def garantir_web() -> None:
    if (WEB / "index.html").exists():
        return
    # No pacote de hospedagem a pasta web/ já vem pronta e não há build_web.py.
    if not (RAIZ / "build_web.py").exists():
        sys.exit("Pasta web/ não encontrada ao lado deste script.\n"
                 "Descompacte o pacote inteiro, mantendo web/ e servidor.py juntos.")
    print("Pasta web/ não encontrada. Gerando...")
    r = subprocess.run([sys.executable, str(RAIZ / "build_web.py")], cwd=str(RAIZ))
    if r.returncode != 0 or not (WEB / "index.html").exists():
        sys.exit("Não foi possível gerar a pasta web/. Rode: python3 build_web.py")
    print()


def abrir_servidor(host: str, porta: int, tentativas: int = 20):
    """Sobe o servidor, avançando a porta se estiver ocupada."""
    ultimo = None
    for p in range(porta, porta + tentativas):
        try:
            servidor = http.server.ThreadingHTTPServer((host, p), Handler)
            servidor.daemon_threads = True
            return servidor, p
        except OSError as e:
            ultimo = e
            continue
    sys.exit(f"Nenhuma porta livre entre {porta} e {porta + tentativas - 1}: {ultimo}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Servidor local do Gerador de Mapas de Carreira.")
    ap.add_argument("--rede", action="store_true",
                    help="libera o acesso para outras máquinas da rede local")
    ap.add_argument("--porta", type=int, default=8080, help="porta inicial (padrão: 8080)")
    ap.add_argument("--sem-navegador", action="store_true",
                    help="não abre o navegador automaticamente")
    args = ap.parse_args()

    garantir_web()

    host = "0.0.0.0" if args.rede else "127.0.0.1"
    servidor, porta = abrir_servidor(host, args.porta)

    tem_base = (WEB / "assets" / "base.xlsx").exists()
    local = f"http://localhost:{porta}"

    print("=" * 62)
    print("  Gerador de Mapas de Carreira — servidor local")
    print("=" * 62)
    print(f"  Nesta máquina : {local}")
    if args.rede:
        print(f"  Na rede local : http://{ip_da_rede()}:{porta}")
    print(f"  Base de cargos: {'publicada pelo servidor' if tem_base else 'não publicada (cada um carrega o .xlsx)'}")
    print()

    if args.rede and tem_base:
        print("  ATENÇÃO: qualquer pessoa que alcançar este endereço na rede")
        print("  consegue baixar a base de cargos em /assets/base.xlsx.")
        print("  Para evitar, gere o site sem a base:")
        print("      python3 build_web.py --sem-base")
        print()
    elif args.rede:
        print("  O firewall do Windows costuma pedir liberação na primeira vez.")
        print()

    print("  Encerrar: Ctrl+C")
    print("=" * 62)
    print()

    if not args.sem_navegador:
        threading.Timer(0.7, lambda: webbrowser.open(local)).start()

    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
