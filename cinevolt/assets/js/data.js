/* ============================================================
   CINEVOLT — data.js
   Camada de dados. Fala com o Supabase quando configurado e cai
   num modo DEMO (localStorage + conteúdo de exemplo) quando não.
   Assim o site nunca aparece quebrado, nem antes do deploy.
   ============================================================ */

(function () {
  'use strict';

  const CFG = window.CINEVOLT;
  const hasSupabase = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase);

  let sb = null;
  if (hasSupabase) {
    sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true }
    });
  }

  /* ---------- Capa: usa a arte do post ou gera uma ilustração
       exclusiva em SVG a partir do slug (art.js) ---------- */
  function capaDe(post, opcoes) {
    if (!post) return '';
    if (post.capa_url) return post.capa_url;
    if (window.Art) {
      return window.Art.posterURL(post.slug || post.titulo || 'cinevolt', Object.assign({
        categoria: post.categoria,
        cena: post.arte_cena != null ? Number(post.arte_cena) : undefined,
        tema: post.arte_tema || undefined
      }, opcoes || {}));
    }
    return '';
  }

  /* ---------- Conteúdo de demonstração ----------
     capa_url fica nulo de propósito: a ilustração é gerada. */

  const DEMO_POSTS = [
    {
      id: 'demo-1', slug: 'a-luz-que-nao-apaga',
      titulo: 'A luz que não apaga',
      subtitulo: 'Como a fotografia noturna virou a assinatura do cinema contemporâneo',
      categoria: 'Ensaio', tags: ['fotografia', 'noir', 'estética'],
      capa_url: null, nota: null, ano: 2026, duracao: null,
      diretor: null, autor: 'Redação CINEVOLT', destaque: true, status: 'publicado',
      publicado_em: '2026-09-02T12:00:00Z', views: 4821,
      corpo: '## O escuro como matéria-prima\n\nExiste um instante, entre o último fotograma iluminado e o primeiro plano na penumbra, em que o cinema decide o que quer ser.\n\n> "A escuridão não é ausência de imagem. É a imagem esperando a coragem do espectador."\n\nDiretores de fotografia passaram a tratar a noite como **superfície**, não como véu. O digital de alta sensibilidade permitiu filmar com a luz que já existe na rua — e isso mudou a textura de uma década inteira de filmes.\n\n### Três filmes que definiram a virada\n\n- Planos abertos em que o neon é a única fonte-chave\n- O uso de lentes rápidas para colapsar profundidade\n- A recusa da luz de preenchimento como escolha ética\n\nO resultado é um cinema que pede sala escura de volta.'
    },
    {
      id: 'demo-2', slug: 'tempestade-em-35mm',
      titulo: 'Tempestade em 35mm',
      subtitulo: 'O thriller que devolve peso ao suspense analógico',
      categoria: 'Crítica', tags: ['thriller', '35mm', 'estreia'],
      capa_url: null, nota: 8.7, ano: 2026, duracao: 128,
      diretor: 'Marina Quesada', autor: 'Yuri S.', destaque: false, status: 'publicado',
      publicado_em: '2026-08-28T12:00:00Z', views: 3110,
      corpo: 'Filmado inteiramente em película, o longa aposta no grão como personagem.\n\nA montagem segura os planos por tempo suficiente para o desconforto virar sensação física. É o tipo de filme que **usa o silêncio** como efeito especial.\n\n### O que funciona\n\n1. Direção de atores precisa\n2. Trilha que entra tarde e sai cedo\n3. Um terceiro ato que não explica demais\n\nNão é um filme perfeito, mas é um filme inteiro.'
    },
    {
      id: 'demo-3', slug: 'entrevista-sala-de-projecao',
      titulo: 'Na sala de projeção',
      subtitulo: 'Uma conversa sobre restaurar filmes que quase se perderam',
      categoria: 'Entrevista', tags: ['preservação', 'acervo'],
      capa_url: null, nota: null, ano: 2026, duracao: null,
      diretor: null, autor: 'Redação CINEVOLT', destaque: false, status: 'publicado',
      publicado_em: '2026-08-19T12:00:00Z', views: 1980,
      corpo: 'Conversamos com a equipe que passa meses limpando quadro a quadro cópias esquecidas em latas enferrujadas.\n\n> "Cada arranhão que a gente remove é uma decisão sobre memória."\n\nO trabalho é lento, caro e quase invisível — e sem ele metade da história do cinema brasileiro simplesmente sumiria.'
    },
    {
      id: 'demo-4', slug: 'as-10-aberturas-mais-eletricas',
      titulo: 'As 10 aberturas mais elétricas do cinema',
      subtitulo: 'Sequências iniciais que já chegam com a tensão no talo',
      categoria: 'Lista', tags: ['lista', 'montagem'],
      capa_url: null, nota: null, ano: 2026, duracao: null,
      diretor: null, autor: 'Redação CINEVOLT', destaque: false, status: 'publicado',
      publicado_em: '2026-08-11T12:00:00Z', views: 7420,
      corpo: 'Uma boa abertura é um contrato: ela avisa as regras do jogo antes do primeiro diálogo.\n\n1. O plano-sequência que apresenta a cidade inteira\n2. O corte seco que dura um segundo e assombra o filme todo\n3. A voz em off que mente para o espectador\n\nA lista completa está abaixo, com os minutos exatos para você revisitar.'
    },
    {
      id: 'demo-5', slug: 'o-classico-que-envelheceu-ao-contrario',
      titulo: 'O clássico que envelheceu ao contrário',
      subtitulo: 'Revisitando um fracasso de bilheteria que virou gramática visual',
      categoria: 'Clássico', tags: ['clássico', 'ficção científica'],
      capa_url: null, nota: 9.4, ano: 1982, duracao: 117,
      diretor: 'A. Verdi', autor: 'Yuri S.', destaque: false, status: 'publicado',
      publicado_em: '2026-07-30T12:00:00Z', views: 5630,
      corpo: 'Quando estreou, foi chamado de frio. Hoje, é impossível ver um filme de ficção científica que não deva algo a ele.\n\nA chuva permanente, a publicidade em néon, a cidade vertical: tudo isso virou **vocabulário padrão**.'
    },
    {
      id: 'demo-6', slug: 'streaming-e-o-fim-do-plano-longo',
      titulo: 'O streaming e o fim do plano longo',
      subtitulo: 'O que a segunda tela fez com o ritmo dos filmes',
      categoria: 'Streaming', tags: ['streaming', 'ritmo'],
      capa_url: null, nota: null, ano: 2026, duracao: null,
      diretor: null, autor: 'Redação CINEVOLT', destaque: false, status: 'publicado',
      publicado_em: '2026-07-22T12:00:00Z', views: 2890,
      corpo: 'Roteiros que explicam a trama em voz alta existem por um motivo: metade da audiência está olhando para o celular.\n\nA questão não é nostalgia. É perguntar o que se perde quando o filme precisa competir com o aparelho na mão do espectador.'
    }
  ];

  /* ---------- Utilidades de armazenamento local (modo demo) ---------- */
  const LS_KEY = 'cinevolt:posts';
  const LS_SCORES = 'cinevolt:scores';

  function lsGet(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) { return fallback; }
  }

  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function demoPosts() {
    const extras = lsGet(LS_KEY, []);
    return [...extras, ...DEMO_POSTS];
  }

  /* ---------- Helpers públicos ---------- */
  function slugify(texto) {
    return (texto || '')
      .toString()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80);
  }

  function dataBR(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function tempoLeitura(corpo) {
    const palavras = (corpo || '').trim().split(/\s+/).length;
    return Math.max(1, Math.round(palavras / 200));
  }

  /* ---------- API de leitura ---------- */
  async function listarPosts({ categoria = null, busca = '', pagina = 0, tamanho = CFG.PAGE_SIZE, incluirRascunhos = false } = {}) {
    if (!sb) {
      let lista = demoPosts();
      if (!incluirRascunhos) lista = lista.filter(p => p.status === 'publicado');
      if (categoria && categoria !== 'Tudo') lista = lista.filter(p => p.categoria === categoria);
      if (busca) {
        const q = busca.toLowerCase();
        lista = lista.filter(p =>
          (p.titulo + ' ' + (p.subtitulo || '') + ' ' + (p.tags || []).join(' ')).toLowerCase().includes(q));
      }
      lista.sort((a, b) => new Date(b.publicado_em || 0) - new Date(a.publicado_em || 0));
      const ini = pagina * tamanho;
      return { dados: lista.slice(ini, ini + tamanho), total: lista.length, demo: true };
    }

    let q = sb.from('posts').select('*', { count: 'exact' });
    if (!incluirRascunhos) q = q.eq('status', 'publicado');
    if (categoria && categoria !== 'Tudo') q = q.eq('categoria', categoria);
    if (busca) q = q.or(`titulo.ilike.%${busca}%,subtitulo.ilike.%${busca}%`);

    const { data, error, count } = await q
      .order('publicado_em', { ascending: false, nullsFirst: false })
      .range(pagina * tamanho, pagina * tamanho + tamanho - 1);

    if (error) throw error;
    return { dados: data || [], total: count || 0, demo: false };
  }

  async function postPorSlug(slug) {
    if (!sb) return demoPosts().find(p => p.slug === slug) || null;
    const { data, error } = await sb.from('posts').select('*').eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function destaque() {
    if (!sb) return demoPosts().find(p => p.destaque && p.status === 'publicado') || demoPosts()[0];
    const { data } = await sb.from('posts').select('*')
      .eq('status', 'publicado').eq('destaque', true)
      .order('publicado_em', { ascending: false }).limit(1);
    if (data && data.length) return data[0];
    const { data: fallback } = await sb.from('posts').select('*')
      .eq('status', 'publicado').order('publicado_em', { ascending: false }).limit(1);
    return (fallback && fallback[0]) || null;
  }

  async function relacionados(post, limite = 3) {
    if (!post) return [];
    const { dados } = await listarPosts({ categoria: post.categoria, tamanho: limite + 1 });
    return dados.filter(p => p.slug !== post.slug).slice(0, limite);
  }

  async function registrarView(slug) {
    if (!sb) return;
    try { await sb.rpc('incrementar_views', { p_slug: slug }); } catch (_) { /* silencioso */ }
  }

  /* ---------- API de escrita (painel) ---------- */
  async function salvarPost(post) {
    if (!sb) {
      const lista = lsGet(LS_KEY, []);
      const idx = lista.findIndex(p => p.id === post.id);
      const registro = { ...post, id: post.id || 'local-' + Date.now() };
      if (idx >= 0) lista[idx] = registro; else lista.unshift(registro);
      lsSet(LS_KEY, lista);
      return registro;
    }

    const payload = { ...post };
    delete payload.views;
    if (!payload.id) delete payload.id;

    const { data, error } = await sb.from('posts')
      .upsert(payload, { onConflict: 'slug' })
      .select().single();
    if (error) throw error;
    return data;
  }

  async function excluirPost(id) {
    if (!sb) {
      lsSet(LS_KEY, lsGet(LS_KEY, []).filter(p => p.id !== id));
      return true;
    }
    const { error } = await sb.from('posts').delete().eq('id', id);
    if (error) throw error;
    return true;
  }

  async function enviarImagem(file) {
    if (!sb) {
      // Modo demo: converte para data URL para o preview funcionar
      return await new Promise((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(fr.result);
        fr.onerror = rej;
        fr.readAsDataURL(file);
      });
    }
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const nome = `${Date.now()}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${ext}`;
    const { error } = await sb.storage.from(CFG.BUCKET).upload(nome, file, {
      cacheControl: '31536000', upsert: false
    });
    if (error) throw error;
    const { data } = sb.storage.from(CFG.BUCKET).getPublicUrl(nome);
    return data.publicUrl;
  }

  /* ---------- Autenticação ---------- */
  async function entrar(email, senha) {
    if (!sb) return { user: { email: email || 'demo@cinevolt.local' }, demo: true };
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw error;
    return data;
  }

  async function sair() {
    if (!sb) return true;
    await sb.auth.signOut();
    return true;
  }

  async function usuarioAtual() {
    if (!sb) return lsGet('cinevolt:demo-user', null);
    const { data } = await sb.auth.getUser();
    return data ? data.user : null;
  }

  /* ---------- Newsletter ---------- */
  async function assinar(email) {
    if (!sb) { lsSet('cinevolt:news:' + email, true); return true; }
    const { error } = await sb.from('newsletter').insert({ email });
    if (error && error.code !== '23505') throw error; // 23505 = duplicado, tudo bem
    return true;
  }

  /* ---------- Placar do jogo ---------- */
  async function salvarPontuacao(apelido, pontos) {
    if (!sb) {
      const lista = lsGet(LS_SCORES, []);
      lista.push({ apelido, pontos, created_at: new Date().toISOString() });
      lsSet(LS_SCORES, lista);
      return true;
    }
    const { error } = await sb.from('placar').insert({ apelido, pontos });
    if (error) throw error;
    return true;
  }

  async function ranking(limite = 10) {
    if (!sb) {
      return lsGet(LS_SCORES, [])
        .sort((a, b) => b.pontos - a.pontos)
        .slice(0, limite);
    }
    const { data, error } = await sb.from('placar').select('apelido,pontos,created_at')
      .order('pontos', { ascending: false }).limit(limite);
    if (error) throw error;
    return data || [];
  }

  /* ---------- Exporta ---------- */
  window.CV = {
    sb, modoDemo: !sb,
    slugify, dataBR, tempoLeitura, capaDe,
    listarPosts, postPorSlug, destaque, relacionados, registrarView,
    salvarPost, excluirPost, enviarImagem,
    entrar, sair, usuarioAtual,
    assinar, salvarPontuacao, ranking,
    DEMO_POSTS
  };
})();
