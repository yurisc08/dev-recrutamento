# Como hospedar

Guia para colocar a ferramenta no ar de forma que **todas as pessoas usem a
mesma base** — C&R cadastra, o gestor preenche da máquina dele, o aprovador
aprova da dele.

Requisito único: **Node.js 18 ou mais novo**. Não há `npm install`, banco de
dados para instalar, nem qualquer outra dependência. Os dados ficam em dois
arquivos JSON dentro da pasta `data/`.

Escolha **uma** das opções abaixo. A ordem é da mais simples para a mais robusta.

---

## Opção A — Um computador da empresa (Windows)

A mais simples, e suficiente para uma área de RH. Escolha uma máquina que fique
ligada durante o expediente.

**1. Instale o Node.js**
Baixe a versão LTS em <https://nodejs.org> e instale com as opções padrão.
Confira abrindo o Prompt de Comando e digitando `node -v`.

**2. Copie a pasta**
Coloque a pasta `descritivos-cargos` em algum lugar estável, por exemplo
`C:\Ferramentas\descritivos-cargos`. Evite Área de Trabalho e OneDrive.

**3. Teste**
Duplo clique em `abrir.bat`. Deve abrir o navegador em
<http://localhost:3000>. Feche a janela preta para parar.

**4. Descubra o endereço da máquina**
No Prompt de Comando: `ipconfig`. Anote o "Endereço IPv4"
(algo como `192.168.0.42`). O endereço das outras pessoas será
`http://192.168.0.42:3000`.

> Peça ao TI para reservar esse IP no DHCP. Se o IP mudar, o endereço muda.

**5. Libere a porta no firewall**
Prompt de Comando **como administrador**:

```bat
netsh advfirewall firewall add rule name="Descritivos de Cargos" dir=in action=allow protocol=TCP localport=3000
```

**6. Deixe subindo sozinho junto com o Windows**
Abra o **Agendador de Tarefas** → *Criar Tarefa*:

- **Geral**: nome `Descritivos de Cargos`; marque *Executar estando o usuário
  conectado ou não* e *Executar com privilégios mais altos*.
- **Disparadores**: novo → *Ao iniciar o computador*.
- **Ações**: novo → *Iniciar um programa*
  - Programa: `C:\Program Files\nodejs\node.exe`
  - Argumentos: `server.js`
  - Iniciar em: `C:\Ferramentas\descritivos-cargos`
- **Configurações**: marque *Se a tarefa falhar, reiniciar a cada 1 minuto*.

Reinicie e confira acessando de outro computador.

---

## Opção B — Servidor Linux (VPS ou máquina interna)

Para uso contínuo, com reinício automático e a possibilidade de HTTPS.

**1. Instale o Node e copie os arquivos**

```bash
sudo apt update && sudo apt install -y nodejs npm
sudo mkdir -p /opt/descritivos && sudo chown $USER /opt/descritivos
# copie o conteúdo da pasta para /opt/descritivos (scp, rsync, git…)
cd /opt/descritivos && node build.js && node server.js   # teste rápido
```

**2. Crie o serviço** em `/etc/systemd/system/descritivos.service`:

```ini
[Unit]
Description=Descritivos de Cargos
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/descritivos
Environment=PORT=3000
ExecStart=/usr/bin/node /opt/descritivos/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo chown -R www-data /opt/descritivos
sudo systemctl daemon-reload
sudo systemctl enable --now descritivos
sudo systemctl status descritivos     # conferir
journalctl -u descritivos -f          # acompanhar os logs
```

**3. (Opcional) Nginx na frente, com HTTPS**

Necessário se a ferramenta for acessível fora da rede interna.

```nginx
server {
    listen 80;
    server_name descritivos.suaempresa.com.br;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d descritivos.suaempresa.com.br
```

---

## Opção C — Plataforma de hospedagem (Render, Railway, Fly…)

Funciona, com **uma atenção importante**: nessas plataformas o sistema de
arquivos costuma ser apagado a cada nova implantação ou reinício. Sem um disco
persistente, **os descritivos seriam perdidos**.

- **Comando de início**: `node server.js`
- **Porta**: a plataforma define a variável `PORT` e o servidor a respeita.
- **Disco persistente**: crie um volume (no Render, *Disk*) e aponte a variável
  de ambiente **`DATA_DIR`** para ele, por exemplo `DATA_DIR=/var/data`.
  Sem isso, não use esta opção.

Um bom sinal de que está correto: reiniciar a aplicação e os cargos continuarem lá.

---

## Opção D — Hospedagem estática (só o `index.html`)

Serve para **demonstrar**, não para operar. Suba apenas o `index.html` em
qualquer hospedagem de site (IIS, Apache, GitHub Pages, Netlify). Cada pessoa
que abrir terá a própria cópia dos dados no navegador dela — o gestor não vê o
cargo que C&R cadastrou. O fluxo entre pessoas exige o servidor das opções
A, B ou C.

---

## Depois de instalar

1. Entre como C&R com `CR-00001`.
2. **Configurações** → preencha o **endereço da ferramenta** (o mesmo que as
   pessoas digitam no navegador) e os dados do **servidor de e-mail**; use
   *Enviar e-mail de teste* para confirmar.
3. **Códigos de acesso** → crie o seu código de C&R e os dos aprovadores;
   depois **revogue os de demonstração** (`CR-00001` e `AP-00001`).
4. **Administração** → *Restaurar dados de teste* apaga os cargos de exemplo.
   Faça isso **antes** do passo 3, porque também recria os códigos de teste.

## Rotina

| Assunto | O que fazer |
| --- | --- |
| **Backup** | Copiar a pasta `data/` (ou o caminho do `DATA_DIR`). São dois arquivos JSON; um agendamento diário resolve. |
| **Atualizar a ferramenta** | Parar o serviço, substituir os arquivos **preservando a pasta `data/`**, iniciar de novo. |
| **Trocar a porta** | Variável `PORT` (ex.: `PORT=8080 node server.js`). |
| **Ver o que aconteceu** | Cada cargo guarda histórico e comentários na própria tela; falhas de e-mail aparecem marcadas em Administração. |

## Segurança, em uma linha cada

- O **código de acesso é a credencial inteira**: quem tem o código entra. Trate
  como senha ao enviar e revogue quando alguém sair da função.
- Os códigos criados são sorteados (`CR-XXXX-XXXX`), nunca sequenciais.
- Em rede interna, HTTP resolve. **Exposto à internet, use HTTPS** (opção B).
- O arquivo `data/db.json` contém os códigos em texto — é o que permite a C&R
  consultá-los. Proteja a pasta com as permissões do sistema operacional.
- A senha do SMTP fica em `data/config.json`, porque o envio exige a senha
  original. Prefira uma conta de e-mail dedicada a envios automáticos.
