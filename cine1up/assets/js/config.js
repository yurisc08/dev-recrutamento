/* ============================================================
   CINE 1UP — config.js
   Único arquivo que você precisa editar para conectar o Supabase.
   As chaves "anon" do Supabase são públicas por design (a proteção
   real vem das policies de RLS em supabase/schema.sql).
   ============================================================ */

window.CINE1UP = {
  /* Cole aqui os dados do seu projeto:
     Supabase → Project Settings → API */
  SUPABASE_URL: '',          // ex.: 'https://xxxxxxxx.supabase.co'
  SUPABASE_ANON_KEY: '',     // ex.: 'eyJhbGciOi...'

  /* TMDB — de onde vêm "em cartaz", estreias e séries em alta.
     Crie a chave grátis em themoviedb.org → Configurações → API.
     O ideal é NÃO colocar a chave aqui: guarde em TMDB_KEY nas
     variáveis de ambiente da Cloudflare, que a função em
     functions/api/tmdb.js usa no servidor. Este campo é o plano B,
     para quem hospeda em outro lugar. */
  TMDB_KEY: '',

  /* Deixe true na Cloudflare (usa a função /api/tmdb e esconde a chave).
     Coloque false se hospedar em outro lugar, para o site ir direto na
     API com a TMDB_KEY acima. */
  TMDB_PROXY: true,

  /* Bucket público criado pelo schema.sql */
  BUCKET: 'midia',

  /* ---------------------------------------------------------
     GOOGLE ADSENSE
     Preencha depois que a conta for aprovada. Enquanto `cliente`
     estiver vazio, nenhum script de anúncio é carregado e os
     espaços simplesmente não aparecem.

     cliente  → seu ID de editor: 'ca-pub-0000000000000000'
     slots    → o ID de cada bloco criado no painel do AdSense
     semConsentimento → o que fazer quando a pessoa recusa cookies:
                'nada' (não carrega anúncio nenhum) ou
                'nao-personalizado' (carrega sem personalização)
     --------------------------------------------------------- */
  ADSENSE: {
    cliente: '',
    slots: {
      artigo: '',     // dentro da matéria
      rodape: '',     // fim da matéria
      lista: '',      // entre as seções de listagem
      home: ''        // meio da home
    },
    semConsentimento: 'nada'
  },

  /* Identidade */
  SITE: {
    nome: 'CINE 1UP',
    tagline: 'Aperte start',
    descricao: 'Notícias, críticas e estreias de cinema e séries — com fliperama na casa.',
    url: 'https://cine1up.com.br',
    email: 'contato@cine1up.com.br'
  },

  /* Categorias editoriais (aparecem nos filtros e no painel) */
  CATEGORIAS: ['Notícia', 'Crítica', 'Estreia', 'Série', 'Ensaio', 'Entrevista', 'Lista', 'Clássico'],

  /* Quantidade de posts por página no arquivo */
  PAGE_SIZE: 9
};
