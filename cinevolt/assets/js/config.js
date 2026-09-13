/* ============================================================
   CINEVOLT — config.js
   Único arquivo que você precisa editar para conectar o Supabase.
   As chaves "anon" do Supabase são públicas por design (a proteção
   real vem das policies de RLS em supabase/schema.sql).
   ============================================================ */

window.CINEVOLT = {
  /* Cole aqui os dados do seu projeto:
     Supabase → Project Settings → API */
  SUPABASE_URL: '',          // ex.: 'https://xxxxxxxx.supabase.co'
  SUPABASE_ANON_KEY: '',     // ex.: 'eyJhbGciOi...'

  /* Bucket público criado pelo schema.sql */
  BUCKET: 'midia',

  /* Identidade */
  SITE: {
    nome: 'CINEVOLT',
    tagline: 'Cinema em alta voltagem',
    descricao: 'Críticas, ensaios e estreias com a energia que o cinema merece.',
    url: 'https://cinevolt.com.br',
    email: 'contato@cinevolt.com.br'
  },

  /* Categorias editoriais (aparecem nos filtros e no painel) */
  CATEGORIAS: ['Crítica', 'Estreia', 'Ensaio', 'Entrevista', 'Lista', 'Clássico', 'Streaming'],

  /* Quantidade de posts por página no arquivo */
  PAGE_SIZE: 9
};
