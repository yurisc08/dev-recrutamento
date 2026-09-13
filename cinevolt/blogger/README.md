# CINEVOLT no Blogger

Mesmo visual do site, publicando pelo editor do Google.

## Instalar

1. Abra [blogger.com](https://www.blogger.com) e crie o blog (ou use um existente).
2. Menu lateral → **Tema** → seta ao lado de *Personalizar* → **Restaurar**.
3. **Fazer upload** → escolha `cinevolt-blogger.xml` → **Fazer upload**.
4. Pronto. Abra o blog: o hero da tempestade já está lá.

> Guarde uma cópia do tema anterior antes (mesmo menu → **Fazer backup**).

## Publicar

Escreva normalmente em **Nova postagem**. O tema cuida do resto:

- **Marcadores** viram a editoria do card (`Crítica`, `Ensaio`, `Estreia`…).
  O marcador também define a paleta da ilustração gerada.
- **Primeira imagem do post** vira a capa do card automaticamente.
- **Sem imagem nenhuma?** O tema desenha uma **ilustração exclusiva em SVG** a
  partir do endereço do post — a mesma arte generativa do site principal.
- A matéria mais recente vira o destaque do hero sozinha.

## O que muda em relação à versão Cloudflare + Supabase

| | Site próprio | Blogger |
|---|---|---|
| Publicar | painel em `/admin.html` | editor do Blogger |
| Ilustração gerada | sim | sim |
| Raios, manto, trovão, grão | sim | sim |
| Jogo Cine Runner | sim, com placar online | sim, sem placar (veja abaixo) |
| Comentários | — | nativos do Blogger |
| Controle do design | total | limitado ao que o tema expõe |

## Colocar o jogo no Blogger

1. **Páginas** → *Nova página* → título `Jogo`.
2. Mude o editor para **Visualização HTML**.
3. Cole:

```html
<div class="jogo-palco">
  <canvas id="jogo" width="900" height="300"></canvas>
</div>
<script src="URL_DO_GAME_JS"></script>
```

`URL_DO_GAME_JS` precisa ser um link público para `assets/js/game.js` — dá para
hospedar o arquivo grátis em [jsdelivr](https://www.jsdelivr.com/github) apontando
para o repositório do GitHub onde este projeto está.

O placar online (Top 10) depende do Supabase e das policies em
`supabase/schema.sql`; sem ele, o jogo ainda guarda o recorde pessoal no navegador.

## Domínio próprio no Blogger

**Configurações → Publicação → Domínio personalizado** → digite `www.seudominio.com.br`.
O Blogger mostra dois registros CNAME; cadastre-os no painel do seu domínio
(registro.br ou Cloudflare) e volte para salvar.

## Regerar o tema

Mexeu no CSS ou no JS do site principal? Rode na raiz do projeto:

```bash
node blogger/build.js
```

O tema é montado a partir dos mesmos arquivos, então as duas versões nunca
ficam diferentes.
