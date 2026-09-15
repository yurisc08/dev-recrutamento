import { Hono } from 'hono';
import type { Ambiente, Variaveis } from '../tipos.js';
import { ErroApi, carregarContexto, exigirPerfil } from '../dominio.js';
import { auditar } from '../auditoria.js';
import { novoConvite, resumoConvite } from '../senha.js';

export const rotasAdmin = new Hono<{ Bindings: Ambiente; Variables: Variaveis }>();

/* ------------------------------ processo ------------------------------ */
rotasAdmin.get('/config/processo', async (ctx) => {
  const { processo } = await carregarContexto(ctx.get('sql'));
  return ctx.json(processo);
});

rotasAdmin.patch('/config/processo', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const { processo } = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));

  const nome = corpo.nome !== undefined ? String(corpo.nome).slice(0, 120) : processo.nome;
  const dataBase = corpo.data_base !== undefined ? String(corpo.data_base).slice(0, 10) : processo.data_base;
  const prazo = corpo.prazo !== undefined ? (String(corpo.prazo).slice(0, 10) || null) : processo.prazo;
  const aviso = corpo.aviso_confidencialidade !== undefined
    ? String(corpo.aviso_confidencialidade).slice(0, 400) : processo.aviso_confidencialidade;
  if (!nome.trim()) throw new ErroApi(422, 'Informe o nome do processo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) throw new ErroApi(422, 'Data-base inválida (use AAAA-MM-DD).');

  await sql`
    UPDATE portal.processos SET nome = ${nome}, data_base = ${dataBase}, prazo = ${prazo},
           aviso_confidencialidade = ${aviso}
     WHERE id = ${processo.id}`;
  await auditar(sql, {
    usuario, tipo: 'config', entidade: 'processo', entidadeId: processo.id,
    valorAnterior: processo, valorNovo: { nome, data_base: dataBase, prazo }, ip: ctx.get('ip'),
  });
  const { processo: atualizado } = await carregarContexto(sql);
  return ctx.json(atualizado);
});

/* -------------------------------- campos ------------------------------ */
rotasAdmin.get('/config/campos', async (ctx) => {
  const usuario = ctx.get('usuario')!;
  const { campos } = await carregarContexto(ctx.get('sql'));
  return ctx.json({ itens: usuario.perfil === 'admin' ? campos : campos.filter((c) => !c.sensivel) });
});

rotasAdmin.patch('/config/campos/:id{[0-9]+}', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const id = Number(ctx.req.param('id'));
  const corpo = await ctx.req.json().catch(() => ({}));
  const [atual] = await sql`SELECT * FROM portal.campos WHERE id = ${id}`;
  if (!atual) throw new ErroApi(404, 'Campo não encontrado.');

  const [atualizado] = await sql`
    UPDATE portal.campos SET
      rotulo = ${corpo.rotulo !== undefined ? String(corpo.rotulo).trim() : atual.rotulo},
      grupo = ${corpo.grupo !== undefined ? String(corpo.grupo).slice(0, 60) : atual.grupo},
      obrigatorio = ${corpo.obrigatorio !== undefined ? !!corpo.obrigatorio : atual.obrigatorio},
      editavel_por = ${corpo.editavel_por !== undefined ? String(corpo.editavel_por) : atual.editavel_por},
      somente_leitura = ${corpo.editavel_por !== undefined ? String(corpo.editavel_por) === 'ninguem' : atual.somente_leitura},
      visivel_lista = ${corpo.visivel_lista !== undefined ? !!corpo.visivel_lista : atual.visivel_lista},
      somar = ${corpo.somar !== undefined ? !!corpo.somar : atual.somar},
      agrupar = ${corpo.agrupar !== undefined ? !!corpo.agrupar : atual.agrupar},
      sensivel = ${corpo.sensivel !== undefined ? !!corpo.sensivel : atual.sensivel},
      ativo = ${corpo.ativo !== undefined ? !!corpo.ativo : atual.ativo}
    WHERE id = ${id} RETURNING *`;
  await auditar(sql, {
    usuario, tipo: 'campo', entidade: 'campo', entidadeId: String(atual.chave),
    valorAnterior: { rotulo: atual.rotulo, ativo: atual.ativo, sensivel: atual.sensivel },
    valorNovo: corpo, ip: ctx.get('ip'),
  });
  return ctx.json(atualizado);
});

rotasAdmin.post('/config/campos', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const { processo } = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));
  const rotulo = String(corpo.rotulo ?? '').trim();
  if (!rotulo) throw new ErroApi(422, 'Informe o nome do campo.');
  const tipo = String(corpo.tipo ?? 'texto');
  if (!['texto', 'numero', 'moeda', 'data', 'lista', 'booleano'].includes(tipo)) throw new ErroApi(422, 'Tipo inválido.');

  const base = rotulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'campo';
  let chave = base;
  let sufixo = 2;
  // eslint-disable-next-line no-await-in-loop
  while ((await sql`SELECT 1 FROM portal.campos WHERE processo_id = ${processo.id} AND chave = ${chave}`).length) {
    chave = `${base}_${sufixo}`;
    sufixo += 1;
  }

  const opcoes = tipo === 'lista'
    ? (Array.isArray(corpo.opcoes) ? corpo.opcoes : String(corpo.opcoes ?? '').split('\n'))
        .map((o: unknown) => String(o).trim()).filter(Boolean)
    : null;
  if (tipo === 'lista' && (!opcoes || !opcoes.length)) throw new ErroApi(422, 'Informe ao menos uma opção da lista.');

  const [{ ordem }] = await sql<{ ordem: string }[]>`
    SELECT coalesce(MAX(ordem), 0)::text AS ordem FROM portal.campos WHERE processo_id = ${processo.id}`;
  const [criado] = await sql`
    INSERT INTO portal.campos (processo_id, chave, rotulo, tipo, opcoes, grupo, origem, obrigatorio,
                               somente_leitura, editavel_por, visivel_lista, somar, agrupar, sensivel, ordem, ajuda)
    VALUES (${processo.id}, ${chave}, ${rotulo}, ${tipo}, ${opcoes ? sql.json(opcoes) : null},
            ${String(corpo.grupo ?? 'Personalizados')}, 'base', ${!!corpo.obrigatorio},
            ${String(corpo.editavel_por ?? 'ninguem') === 'ninguem'}, ${String(corpo.editavel_por ?? 'ninguem')},
            ${corpo.visivel_lista !== false}, ${!!corpo.somar}, ${!!corpo.agrupar}, ${!!corpo.sensivel},
            ${Number(ordem) + 10}, ${corpo.ajuda ? String(corpo.ajuda).slice(0, 500) : null})
    RETURNING *`;
  await auditar(sql, { usuario, tipo: 'campo', entidade: 'campo', entidadeId: chave, valorNovo: rotulo, ip: ctx.get('ip') });
  return ctx.json(criado, 201);
});

/* -------------------------------- ações ------------------------------- */
rotasAdmin.get('/config/acoes', async (ctx) => {
  const { acoes } = await carregarContexto(ctx.get('sql'));
  return ctx.json({ itens: acoes });
});

rotasAdmin.patch('/config/acoes/:id{[0-9]+}', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const id = Number(ctx.req.param('id'));
  const corpo = await ctx.req.json().catch(() => ({}));
  const [atual] = await sql`SELECT * FROM portal.acoes WHERE id = ${id}`;
  if (!atual) throw new ErroApi(404, 'Ação não encontrada.');

  if (corpo.ativo === false) {
    const [{ total }] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total FROM portal.avaliacoes WHERE acao = ${String(atual.valor)}`;
    if (Number(total) > 0) {
      throw new ErroApi(409, `A ação "${String(atual.valor)}" já foi usada em ${total} avaliação(ões) e não pode ser desativada.`);
    }
  }

  const [atualizada] = await sql`
    UPDATE portal.acoes SET
      exige_justificativa = ${corpo.exige_justificativa !== undefined ? !!corpo.exige_justificativa : atual.exige_justificativa},
      exige_destino = ${corpo.exige_destino !== undefined ? !!corpo.exige_destino : atual.exige_destino},
      considera_desligamento = ${corpo.considera_desligamento !== undefined ? !!corpo.considera_desligamento : atual.considera_desligamento},
      ativo = ${corpo.ativo !== undefined ? !!corpo.ativo : atual.ativo}
    WHERE id = ${id} RETURNING *`;
  await auditar(sql, { usuario, tipo: 'config', entidade: 'acao', entidadeId: String(atual.valor), valorNovo: corpo, ip: ctx.get('ip') });
  return ctx.json(atualizada);
});

/* ------------------------------- regras ------------------------------- */
rotasAdmin.get('/config/regras', async (ctx) => {
  exigirPerfil(ctx.get('usuario'), 'admin');
  const { regras } = await carregarContexto(ctx.get('sql'));
  return ctx.json({ itens: regras });
});

rotasAdmin.patch('/config/regras/:id{[0-9]+}', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const id = Number(ctx.req.param('id'));
  const corpo = await ctx.req.json().catch(() => ({}));
  const [atual] = await sql`SELECT * FROM portal.regras WHERE id = ${id}`;
  if (!atual) throw new ErroApi(404, 'Regra não encontrada.');
  const [atualizada] = await sql`
    UPDATE portal.regras SET
      mensagem = ${corpo.mensagem !== undefined ? String(corpo.mensagem).slice(0, 400) : atual.mensagem},
      severidade = ${corpo.severidade !== undefined ? String(corpo.severidade) : atual.severidade},
      exige_justificativa = ${corpo.exige_justificativa !== undefined ? !!corpo.exige_justificativa : atual.exige_justificativa},
      ativo = ${corpo.ativo !== undefined ? !!corpo.ativo : atual.ativo}
    WHERE id = ${id} RETURNING *`;
  await auditar(sql, { usuario, tipo: 'config', entidade: 'regra', entidadeId: id, valorNovo: corpo, ip: ctx.get('ip') });
  return ctx.json(atualizada);
});

/* ------------------------------ estrutura ----------------------------- */
rotasAdmin.get('/config/estrutura', async (ctx) => {
  const sql = ctx.get('sql');
  const { processo } = await carregarContexto(sql);
  const diretorias = await sql`SELECT id, nome, ativo FROM portal.diretorias WHERE processo_id = ${processo.id} ORDER BY nome`;
  const divisoes = await sql`
    SELECT d.id, d.nome, d.ativo, d.diretoria_id, dir.nome AS diretoria_nome
      FROM portal.divisoes d JOIN portal.diretorias dir ON dir.id = d.diretoria_id
     WHERE dir.processo_id = ${processo.id} ORDER BY dir.nome, d.nome`;
  return ctx.json({ diretorias, divisoes, gestores: [] });
});

rotasAdmin.post('/config/diretorias', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const { processo } = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));
  const nome = String(corpo.nome ?? '').trim();
  if (!nome) throw new ErroApi(422, 'Informe o nome da Diretoria.');
  const [criada] = await sql`
    INSERT INTO portal.diretorias (processo_id, nome) VALUES (${processo.id}, ${nome})
    ON CONFLICT (processo_id, nome) DO NOTHING RETURNING *`;
  if (!criada) throw new ErroApi(409, 'Já existe uma Diretoria com esse nome.');
  await auditar(sql, { usuario, tipo: 'estrutura', entidade: 'diretoria', valorNovo: nome, ip: ctx.get('ip') });
  return ctx.json(criada, 201);
});

rotasAdmin.post('/config/divisoes', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const corpo = await ctx.req.json().catch(() => ({}));
  const nome = String(corpo.nome ?? '').trim();
  const diretoriaId = Number(corpo.diretoria_id);
  if (!nome || !diretoriaId) throw new ErroApi(422, 'Informe a Diretoria e o nome da Divisão.');
  const [criada] = await sql`
    INSERT INTO portal.divisoes (diretoria_id, nome) VALUES (${diretoriaId}, ${nome})
    ON CONFLICT (diretoria_id, nome) DO NOTHING RETURNING *`;
  if (!criada) throw new ErroApi(409, 'Já existe uma Divisão com esse nome nesta Diretoria.');
  await auditar(sql, { usuario, tipo: 'estrutura', entidade: 'divisao', valorNovo: nome, ip: ctx.get('ip') });
  return ctx.json(criada, 201);
});

/* ------------------------------ usuários ------------------------------ */
const SELECT_USUARIO = (sql: Variaveis['sql']) => sql`
  SELECT u.id, u.usuario, u.nome, u.email, u.perfil, u.ativo, u.trocar_senha, u.criado_em, u.ultimo_acesso,
         (u.senha_hash IS NOT NULL) AS senha_definida, u.ativacao_expira_em,
         coalesce(array_remove(array_agg(DISTINCT ud.diretoria_id), NULL), '{}') AS diretorias,
         coalesce(array_remove(array_agg(DISTINCT uv.divisao_id), NULL), '{}') AS divisoes
    FROM portal.usuarios u
    LEFT JOIN portal.usuario_diretorias ud ON ud.usuario_id = u.id
    LEFT JOIN portal.usuario_divisoes uv ON uv.usuario_id = u.id`;

rotasAdmin.get('/usuarios', async (ctx) => {
  exigirPerfil(ctx.get('usuario'), 'admin');
  const sql = ctx.get('sql');
  const itens = await sql`${SELECT_USUARIO(sql)} GROUP BY u.id ORDER BY u.nome`;
  return ctx.json({ itens });
});

rotasAdmin.post('/usuarios', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const corpo = await ctx.req.json().catch(() => ({}));
  const login = String(corpo.usuario ?? '').trim().toLowerCase();
  const nome = String(corpo.nome ?? '').trim();
  const perfil = String(corpo.perfil ?? 'gestor');
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) throw new ErroApi(422, 'Login deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).');
  if (!nome) throw new ErroApi(422, 'Informe o nome completo.');
  if (!['admin', 'diretor', 'gestor'].includes(perfil)) throw new ErroApi(422, 'Perfil inválido.');
  if ((await sql`SELECT 1 FROM portal.usuarios WHERE lower(usuario) = ${login}`).length) {
    throw new ErroApi(409, 'Já existe um usuário com este login.');
  }

  // Ninguém cria senha por ninguém: o acesso nasce sem senha e a pessoa define
  // a dela no link de primeiro acesso.
  const [criado] = await sql<{ id: number }[]>`
    INSERT INTO portal.usuarios (usuario, nome, email, senha_hash, perfil, trocar_senha, criado_por)
    VALUES (${login}, ${nome}, ${String(corpo.email ?? '').trim() || null}, NULL, ${perfil}, false, ${usuario.id})
    RETURNING id`;
  const convite = novoConvite();
  const expiraConvite = new Date(Date.now() + 7 * 86400 * 1000);
  await sql`
    UPDATE portal.usuarios SET ativacao_hash = ${await resumoConvite(convite)}, ativacao_expira_em = ${expiraConvite}
     WHERE id = ${criado.id}`;

  for (const id of (corpo.diretorias ?? []) as number[]) {
    await sql`INSERT INTO portal.usuario_diretorias (usuario_id, diretoria_id) VALUES (${criado.id}, ${id}) ON CONFLICT DO NOTHING`;
  }
  for (const id of (corpo.divisoes ?? []) as number[]) {
    await sql`INSERT INTO portal.usuario_divisoes (usuario_id, divisao_id) VALUES (${criado.id}, ${id}) ON CONFLICT DO NOTHING`;
  }
  await auditar(sql, { usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: criado.id, valorNovo: { login, perfil }, ip: ctx.get('ip') });

  const [completo] = await sql`${SELECT_USUARIO(sql)} WHERE u.id = ${criado.id} GROUP BY u.id`;
  return ctx.json({ ...completo, convite, expira_em: expiraConvite.toISOString() }, 201);
});

rotasAdmin.patch('/usuarios/:id{[0-9]+}', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const id = Number(ctx.req.param('id'));
  const corpo = await ctx.req.json().catch(() => ({}));
  const [atual] = await sql<{ perfil: string; ativo: boolean; nome: string }[]>`
    SELECT perfil, ativo, nome FROM portal.usuarios WHERE id = ${id}`;
  if (!atual) throw new ErroApi(404, 'Usuário não encontrado.');

  const perfil = corpo.perfil !== undefined ? String(corpo.perfil) : atual.perfil;
  if (!['admin', 'diretor', 'gestor'].includes(perfil)) throw new ErroApi(422, 'Perfil inválido.');
  const ativo = corpo.ativo !== undefined ? !!corpo.ativo : atual.ativo;
  if (id === usuario.id && (!ativo || perfil !== 'admin')) {
    throw new ErroApi(409, 'Você não pode remover o próprio acesso de administrador.');
  }

  await sql`
    UPDATE portal.usuarios SET
      nome = ${corpo.nome !== undefined ? String(corpo.nome).trim() : atual.nome},
      email = ${corpo.email !== undefined ? (String(corpo.email).trim() || null) : sql`email`},
      perfil = ${perfil}, ativo = ${ativo}
    WHERE id = ${id}`;
  if (!ativo) await sql`DELETE FROM portal.sessoes WHERE usuario_id = ${id}`;

  if (corpo.diretorias !== undefined) {
    await sql`DELETE FROM portal.usuario_diretorias WHERE usuario_id = ${id}`;
    for (const diretoriaId of corpo.diretorias as number[]) {
      await sql`INSERT INTO portal.usuario_diretorias (usuario_id, diretoria_id) VALUES (${id}, ${diretoriaId}) ON CONFLICT DO NOTHING`;
    }
  }
  if (corpo.divisoes !== undefined) {
    await sql`DELETE FROM portal.usuario_divisoes WHERE usuario_id = ${id}`;
    for (const divisaoId of corpo.divisoes as number[]) {
      await sql`INSERT INTO portal.usuario_divisoes (usuario_id, divisao_id) VALUES (${id}, ${divisaoId}) ON CONFLICT DO NOTHING`;
    }
  }
  if (corpo.diretorias !== undefined || corpo.divisoes !== undefined) {
    await auditar(sql, {
      usuario, tipo: 'permissao', entidade: 'usuario', entidadeId: id,
      valorNovo: { diretorias: corpo.diretorias, divisoes: corpo.divisoes }, ip: ctx.get('ip'),
    });
  }
  await auditar(sql, {
    usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id,
    valorAnterior: { perfil: atual.perfil, ativo: atual.ativo }, valorNovo: { perfil, ativo }, ip: ctx.get('ip'),
  });

  const [completo] = await sql`${SELECT_USUARIO(sql)} WHERE u.id = ${id} GROUP BY u.id`;
  return ctx.json(completo);
});

rotasAdmin.post('/usuarios/:id{[0-9]+}/senha', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin');
  const id = Number(ctx.req.param('id'));
  const [alvo] = await sql<{ nome: string }[]>`SELECT nome FROM portal.usuarios WHERE id = ${id}`;
  if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');
  // Redefinir = tirar a senha atual e mandar um novo link; a nova senha é
  // escolhida pela própria pessoa, nunca por quem administra.
  const convite = novoConvite();
  const expiraConvite = new Date(Date.now() + 7 * 86400 * 1000);
  await sql`
    UPDATE portal.usuarios
       SET senha_hash = NULL, trocar_senha = false,
           ativacao_hash = ${await resumoConvite(convite)}, ativacao_expira_em = ${expiraConvite}
     WHERE id = ${id}`;
  await sql`DELETE FROM portal.sessoes WHERE usuario_id = ${id}`;
  await auditar(sql, { usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id, valorNovo: 'novo link de primeiro acesso', ip: ctx.get('ip') });
  return ctx.json({ ok: true, convite, expira_em: expiraConvite.toISOString(), nome: alvo.nome });
});

/* ------------------------------ auditoria ----------------------------- */
rotasAdmin.get('/auditoria', async (ctx) => {
  const sql = ctx.get('sql');
  exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const query = ctx.req.query();
  const condicoes = [sql`true`];
  if (query.chapa) condicoes.push(sql`a.chapa = ${query.chapa}`);
  if (query.tipo) condicoes.push(sql`a.tipo = ${query.tipo}`);
  if (query.usuario) condicoes.push(sql`a.usuario_nome ILIKE ${`%${query.usuario}%`}`);
  const where = condicoes.reduce((acumulado, atual) => sql`${acumulado} AND ${atual}`);
  const limite = Math.min(Number(query.limite) || 300, 2000);

  const itens = await sql`
    SELECT a.*, c.nome AS colaborador_nome
      FROM portal.auditoria a
      LEFT JOIN portal.colaboradores c ON c.id::text = a.entidade_id AND a.entidade = 'colaborador'
     WHERE ${where} ORDER BY a.criado_em DESC, a.id DESC LIMIT ${limite}`;
  return ctx.json({ itens });
});

rotasAdmin.get('/auditoria/importacoes', async (ctx) => {
  exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const sql = ctx.get('sql');
  const itens = await sql`
    SELECT i.*, u.nome AS usuario FROM portal.importacoes i
      LEFT JOIN portal.usuarios u ON u.id = i.usuario_id
     ORDER BY i.criado_em DESC LIMIT 100`;
  return ctx.json({ itens });
});

rotasAdmin.get('/auditoria/acessos', async (ctx) => {
  exigirPerfil(ctx.get('usuario'), 'admin');
  const sql = ctx.get('sql');
  const itens = await sql`
    SELECT usuario, ip, sucesso, criado_em FROM portal.tentativas_login
     ORDER BY criado_em DESC LIMIT 300`;
  return ctx.json({ itens });
});
