# Como hospedar o Gerador de Mapas de Carreira

A ferramenta é um site estático: só HTML, CSS, JavaScript e arquivos.
Não existe back-end, banco de dados nem processamento no servidor — tudo roda
no navegador de quem acessa. Na prática, hospedar é copiar uma pasta para
qualquer servidor web.

---

## Antes de tudo: a base vai junto ou não?

Esta é a única decisão que realmente importa, e ela é de segurança, não de técnica.

O arquivo `assets/base.xlsx` tem **3.550 cargos** com missão, responsabilidades,
formação, idiomas e competências. Publicado num site sem controle de acesso, ele
fica acessível a quem descobrir a URL — inclusive por download direto de
`.../assets/base.xlsx`, sem passar pela interface.

Por isso existem dois modos de geração:

| Modo | Comando | Base publicada? | Quando usar |
| --- | --- | --- | --- |
| **Com base** | `python3 build_web.py` | Sim, 4,5 MB no servidor | Rede interna, intranet ou site com login |
| **Sem base** | `python3 build_web.py --sem-base` | Não | Internet aberta, GitHub Pages, demonstração |

No modo **sem base** o site abre direto na tela *Base de dados* pedindo a planilha.
A pessoa seleciona o `.xlsx` do próprio computador, o arquivo é lido no navegador e
nada é enviado a servidor nenhum. A ferramenta funciona igual — mapeamento,
sugestão automática, Word e PDF.

> Se hoje o pessoal já troca a planilha por e-mail ou pasta de rede, o modo
> **sem base** costuma ser o caminho: o site vira só a ferramenta, e o dado
> continua no controle de acesso que vocês já têm.

---

## 1. Gerar a pasta

```bash
cd gerador-mapas
python3 build_web.py             # ou --sem-base
```

Resultado em `web/`:

```
web/
├── index.html          18 KB
├── assets/
│   ├── styles.css      19 KB
│   ├── app.js          56 KB
│   ├── jszip.min.js    95 KB
│   ├── logo.png         3 KB
│   ├── template-carreira.docx     1,0 MB
│   ├── template-individual.docx   1,0 MB
│   └── base.xlsx                  4,5 MB   (ausente com --sem-base)
├── _headers            regras de cache (Netlify / Cloudflare)
├── web.config          tipos MIME (IIS)
└── .nojekyll           evita o Jekyll no GitHub Pages
```

A interface carrega em **189 KB**. Os modelos e a base vêm depois, com barra de
progresso, e ficam em cache do navegador nas visitas seguintes.

## 2. Testar antes de publicar

Não abra o `index.html` com duplo clique: o navegador bloqueia `fetch` em
`file://` e a ferramenta avisa que precisa de um servidor. Suba um local:

```bash
python3 servidor.py
```

Ele abre o navegador em `http://localhost:8080` — o mesmo script serve para testar
antes de publicar e para hospedar localmente de forma definitiva.

Para uso individual, sem servidor, use o outro formato: o
`Gerador_Mapas_Carreira.html` gerado por `build.py` abre com duplo clique porque
tem tudo embutido.

## 3. Escolher onde hospedar

### Local, sem servidor nenhum

Se é só você usando, não hospede nada: o `Gerador_Mapas_Carreira.html` gerado por
`build.py` abre com duplo clique e funciona sem Python, sem servidor e sem internet.

### Local, com servidor — para a equipe acessar por um endereço

Quando várias pessoas precisam usar a mesma versão sem publicar em lugar nenhum,
deixe uma máquina servindo:

```bash
python3 servidor.py            # só nesta máquina  -> http://localhost:8080
python3 servidor.py --rede     # libera na rede    -> http://192.168.x.x:8080
python3 servidor.py --porta 9000
```

No Windows dá para usar os atalhos, sem terminal:

- **`Iniciar-servidor.bat`** — abre só nesta máquina
- **`Iniciar-servidor-rede.bat`** — libera para a rede local

O script usa apenas a biblioteca padrão do Python, gera a pasta `web/` sozinho se
ela não existir, aplica os tipos MIME corretos, avança de porta se a escolhida
estiver ocupada e abre o navegador. Atende vários acessos ao mesmo tempo.

Ao usar `--rede`, ele mostra o endereço que os colegas devem digitar e avisa se a
base estiver sendo publicada. Duas coisas a esperar:

- o **firewall do Windows** pede liberação na primeira execução;
- o endereço vale enquanto a máquina estiver ligada e com o script aberto. Para
  algo permanente, use IIS ou nginx abaixo.

### Rede interna permanente — IIS, nginx ou Apache

É a opção que combina com a base publicada, porque o controle de acesso é o da rede.

**IIS (Windows Server)** — copie `web/` para dentro de `C:\inetpub\wwwroot\mapas`
e crie uma aplicação apontando para a pasta. O `web.config` já vai junto e
registra os tipos MIME de `.xlsx` e `.docx`; sem ele o IIS devolve **404** para
esses arquivos, mesmo eles existindo.

**nginx**

```nginx
server {
    listen 80;
    server_name mapas.suaempresa.local;
    root /var/www/mapas;

    location / {
        try_files $uri $uri/ =404;
    }

    # a interface muda a cada publicação
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    # assets têm ?v=hash na URL: podem ser cacheados agressivamente
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000";
    }

    gzip on;
    gzip_types text/css application/javascript;
}
```

**Apache** — copie a pasta para o `DocumentRoot` e crie um `.htaccess`:

```apache
AddType application/vnd.openxmlformats-officedocument.spreadsheetml.sheet .xlsx
AddType application/vnd.openxmlformats-officedocument.wordprocessingml.document .docx

<FilesMatch "\.(css|js)$">
  Header set Cache-Control "public, max-age=31536000"
</FilesMatch>
<FilesMatch "^index\.html$">
  Header set Cache-Control "no-cache"
</FilesMatch>
```

### Netlify ou Cloudflare Pages

Rápido de publicar e permite proteger com senha.

1. Gere a pasta (`python3 build_web.py`).
2. Em Netlify, arraste `web/` na área *Deploy manually* — publica na hora.
3. Proteja o acesso: **Site settings › Access control › Password protection**
   (planos pagos) ou *Cloudflare Access* nas Pages.

O `_headers` já vai na pasta e aplica o cache correto automaticamente.

Publicando pelo Git em vez de arrastar a pasta, configure:

- Build command: `cd gerador-mapas && python3 build_web.py`
- Publish directory: `gerador-mapas/web`

### GitHub Pages

**Use apenas com `--sem-base`.** O GitHub Pages não tem proteção por senha em
repositório público, e mesmo em repositório privado o site publicado fica aberto.

```bash
python3 build_web.py --sem-base --saida docs
git add gerador-mapas/docs && git commit -m "Publica versao web" && git push
```

Depois, em **Settings › Pages**, escolha a branch e a pasta `/docs`.

O `.nojekyll` já vai junto — sem ele o Jekyll ignora arquivos e pastas iniciados
por `_`.

---

## 4. Atualizar depois

**Trocar a base de cargos:** substitua `assets/base.xlsx`, rode `build_web.py` de
novo e publique. Como as URLs levam `?v=hash`, o navegador baixa a versão nova
sozinho — ninguém precisa limpar cache.

Também dá para trocar direto no servidor, sobrescrevendo `web/assets/base.xlsx`.
Nesse caso o `?v=` continua o antigo e o navegador pode servir a cópia em cache;
force com Ctrl+F5 ou prefira regerar.

**Trocar um modelo Word:** substitua o `.docx` em `assets/`, rode o build e
publique. Ao abrir o site, confira a tela *Mapeamento* — o mapeamento é
reaproveitado, e o que não encaixar aparece como pendência.

**Mudar a ferramenta:** edite `src/`, rode os dois builds (`build.py` e
`build_web.py`) para manter os dois formatos iguais.

---

## 5. Problemas comuns

| Sintoma | Causa | Solução |
| --- | --- | --- |
| "Falha ao iniciar: esta é a versão web…" | Abriu por `file://` | Use um servidor, ou o arquivo único |
| "Não foi possível baixar … (HTTP 404)" para `.xlsx`/`.docx` | Servidor sem o tipo MIME | `web.config` no IIS, `AddType` no Apache |
| Alterações não aparecem | Cache do `index.html` | `Cache-Control: no-cache` no `index.html` |
| Barra de progresso sem avançar | Servidor não envia `Content-Length` | Cosmético; desative compressão para `.xlsx` |
| Página em branco, erro de MIME do JS | Servidor entrega `.js` como texto | Configure `application/javascript` |

---

## O que continua valendo

Hospedar **não** muda o modelo de privacidade do processamento: a planilha é lida,
o Word é montado e o PDF é gerado dentro do navegador de quem usa. O servidor só
entrega arquivos — ele nunca vê um código de cargo pesquisado nem um documento
gerado. Os mapeamentos salvos ficam no `localStorage` do navegador de cada pessoa;
para padronizar entre a equipe, exporte o perfil em `.json` na tela *Perfis* e
distribua o arquivo.
