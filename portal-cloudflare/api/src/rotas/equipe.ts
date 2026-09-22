import { Hono } from 'hono';
import type { Ambiente, Variaveis } from '../tipos.js';
import { ErroApi, carregarContexto, exigirPerfil, normalizar } from '../dominio.js';
import { novoConvite, resumoConvite } from '../senha.js';
import { auditar } from '../auditoria.js';

/**
 * Gestores imediatos.
 *
 * Hoje o diretor recorta a planilha e manda por e-mail para cada gerente. Aqui a
 * base é uma só: a coluna GESTOR IMEDIATO diz quem responde por quem, o diretor
 * (ou o RH) cria o acesso do gestor e manda um link de primeiro acesso. Cada um
 * marca as decisões da própria equipe na mesma base, e o diretor acompanha tudo
 * sem juntar arquivo nenhum.
 */
export const rotasEquipe = new Hono<{ Bindings: Ambiente; Variables: Variaveis }>();

const DIAS_CONVITE = 7;

/** Recorte de quem está falando: RH vê todos; diretor, só a Diretoria dele. */
function escopoDoSolicitante(sql: Variaveis['sql'], usuario: NonNullable<Variaveis['usuario']>) {
  if (usuario.perfil === 'admin') return sql`true`;
  return usuario.diretorias.length
    ? sql`c.diretoria_id = ANY(${usuario.diretorias}::int[])`
    : sql`false`;
}

/**
 * Os três níveis que a planilha traz. O admin escolhe por qual deles distribuir:
 * uma base grande costuma ir por GERENTE, uma pequena por GESTOR IMEDIATO.
 */
const NIVEIS = {
  gestor_imediato: { coluna: 'gestor_nome', rotulo: 'Gestor imediato' },
  gerente: { coluna: 'gerente_nome', rotulo: 'Gerente' },
  diretor: { coluna: 'diretor_nome', rotulo: 'Diretor' },
} as const;

type ChaveNivel = keyof typeof NIVEIS;

function colunaDoNivel(valor: unknown): { chave: ChaveNivel; coluna: string; rotulo: string } {
  const chave = (String(valor ?? 'gestor_imediato').trim() || 'gestor_imediato') as ChaveNivel;
  const nivel = NIVEIS[chave];
  if (!nivel) throw new ErroApi(400, `Nível inválido. Use: ${Object.keys(NIVEIS).join(', ')}.`);
  return { chave, ...nivel };
}

/**
 * O nome da coluna vem de NIVEIS, nunca do pedido — por isso pode entrar no SQL
 * como identificador. Qualquer outro valor já foi recusado por colunaDoNivel.
 */
const colunaSql = (sql: Variaveis['sql'], coluna: string) => sql(`c.${coluna}`);

async function exigirGestorNoEscopo(
  sql: Variaveis['sql'],
  usuario: NonNullable<Variaveis['usuario']>,
  processoId: number,
  gestorNome: string,
  coluna = 'gestor_nome',
) {
  const [linha] = await sql<{ total: string }[]>`
    SELECT COUNT(*)::text AS total FROM portal.colaboradores c
     WHERE c.processo_id = ${processoId} AND c.ativo
       AND lower(coalesce(${colunaSql(sql, coluna)}, '')) = ${gestorNome.toLowerCase()}
       AND ${escopoDoSolicitante(sql, usuario)}`;
  if (!Number(linha?.total ?? 0)) {
    throw new ErroApi(403, 'Este gestor não tem colaboradores dentro da sua área de responsabilidade.');
  }
  return Number(linha.total);
}

/** Lista os gestores imediatos que aparecem na base, com andamento e acesso. */
rotasEquipe.get('/equipe/gestores', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const { processo } = await carregarContexto(sql);
  const nivel = colunaDoNivel(ctx.req.query('nivel'));
  const semNome = `(sem ${nivel.rotulo.toLowerCase()} informado)`;

  const itens = await sql`
    SELECT coalesce(nullif(${colunaSql(sql, nivel.coluna)}, ''), ${semNome}) AS gestor_nome,
           max(u.id)                        AS usuario_id,
           max(u.usuario)                   AS usuario,
           max(u.nome)                      AS usuario_nome,
           max(u.email)                     AS email,
           bool_or(u.ativo)                 AS ativo,
           bool_or(u.senha_hash IS NOT NULL) AS senha_definida,
           max(u.ativacao_expira_em)        AS convite_expira_em,
           max(u.ultimo_acesso)             AS ultimo_acesso,
           COUNT(c.id)::text                                            AS total,
           COUNT(c.id) FILTER (WHERE a.acao IS NOT NULL)::text          AS avaliados,
           COUNT(c.id) FILTER (WHERE a.acao IS NULL)::text              AS pendentes,
           COUNT(c.id) FILTER (WHERE a.status = 'homologada')::text     AS homologadas
      FROM portal.colaboradores c
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id
      LEFT JOIN portal.usuarios u ON u.id = c.responsavel_id
     WHERE c.processo_id = ${processo.id} AND c.ativo AND ${escopoDoSolicitante(sql, usuario)}
     GROUP BY 1
     ORDER BY 1`;

  const agora = Date.now();
  return ctx.json({
    nivel: nivel.chave,
    niveis: Object.entries(NIVEIS).map(([chave, n]) => ({ chave, rotulo: n.rotulo })),
    itens: itens.map((item) => {
      const expira = item.convite_expira_em ? new Date(item.convite_expira_em as string).getTime() : null;
      const acesso = !item.usuario_id ? 'sem_acesso'
        : item.ativo === false ? 'desativado'
        : item.senha_definida ? 'ativo'
        : expira && expira > agora ? 'convite_pendente'
        : 'convite_expirado';
      return { ...item, acesso, sem_responsavel: item.gestor_nome === semNome,
        total: Number(item.total), avaliados: Number(item.avaliados),
        pendentes: Number(item.pendentes), homologadas: Number(item.homologadas) };
    }),
  });
});

/** Usuários com perfil de gestor que já existem, para reaproveitar o acesso. */
rotasEquipe.get('/equipe/usuarios', async (ctx) => {
  const sql = ctx.get('sql');
  exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const itens = await sql`
    SELECT id, usuario, nome, email, ativo, (senha_hash IS NOT NULL) AS senha_definida
      FROM portal.usuarios WHERE perfil = 'gestor' ORDER BY nome`;
  return ctx.json({ itens });
});

function sugerirLogin(nome: string): string {
  const base = normalizar(nome).replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
  const login = base.length > 1 ? `${base[0]}.${base[base.length - 1]}` : (base[0] ?? '');
  return login.slice(0, 40);
}

async function gerarConvite(sql: Variaveis['sql'], usuarioId: number) {
  const convite = novoConvite();
  const expira = new Date(Date.now() + DIAS_CONVITE * 86400 * 1000);
  await sql`
    UPDATE portal.usuarios
       SET ativacao_hash = ${await resumoConvite(convite)}, ativacao_expira_em = ${expira}
     WHERE id = ${usuarioId}`;
  return { convite, expira };
}

/**
 * Cria o acesso do gestor e liga a ele os colaboradores daquele gestor imediato.
 * Não nasce com senha: volta um link de primeiro acesso para o gestor definir a
 * dele. Nem quem criou o acesso conhece essa senha.
 */
rotasEquipe.post('/equipe/gestores/acesso', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const { processo } = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));

  const nivel = colunaDoNivel(corpo.nivel);
  const gestorNome = String(corpo.gestor_nome ?? '').trim();
  if (!gestorNome) throw new ErroApi(422, `Informe o ${nivel.rotulo.toLowerCase()}.`);
  await exigirGestorNoEscopo(sql, usuario, processo.id, gestorNome, nivel.coluna);

  const nome = String(corpo.nome ?? gestorNome).trim();
  const login = String(corpo.usuario ?? sugerirLogin(nome)).trim().toLowerCase();
  const email = String(corpo.email ?? '').trim() || null;
  if (!/^[a-z0-9._-]{3,40}$/.test(login)) {
    throw new ErroApi(422, 'Login deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).');
  }
  if ((await sql`SELECT 1 FROM portal.usuarios WHERE lower(usuario) = ${login}`).length) {
    throw new ErroApi(409, 'Já existe um usuário com este login. Use "vincular a um acesso existente".');
  }

  const [criado] = await sql<{ id: number }[]>`
    INSERT INTO portal.usuarios (usuario, nome, email, perfil, senha_hash, trocar_senha, criado_por)
    VALUES (${login}, ${nome}, ${email}, 'gestor', NULL, false, ${usuario.id})
    RETURNING id`;

  const vinculados = await sql<{ id: number }[]>`
    UPDATE portal.colaboradores c SET responsavel_id = ${criado.id}, atualizado_em = now()
     WHERE c.processo_id = ${processo.id} AND c.ativo
       AND lower(coalesce(${colunaSql(sql, nivel.coluna)}, '')) = ${gestorNome.toLowerCase()}
       AND ${escopoDoSolicitante(sql, usuario)}
    RETURNING c.id`;

  const { convite, expira } = await gerarConvite(sql, criado.id);

  await auditar(sql, {
    usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: criado.id,
    valorNovo: { login, perfil: 'gestor', nivel: nivel.chave, gestor_nome: gestorNome,
      colaboradores: vinculados.length },
    detalhes: { acao: 'acesso de gestor criado, aguardando primeiro acesso' }, ip: ctx.get('ip'),
  });

  return ctx.json({
    usuario_id: criado.id, usuario: login, nome, colaboradores: vinculados.length,
    convite, expira_em: expira.toISOString(),
  }, 201);
});

/** Liga os colaboradores de um gestor imediato a um acesso que já existe. */
rotasEquipe.post('/equipe/gestores/vincular', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const { processo } = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));

  const nivel = colunaDoNivel(corpo.nivel);
  const gestorNome = String(corpo.gestor_nome ?? '').trim();
  const alvoId = corpo.usuario_id === null ? null : Number(corpo.usuario_id);
  if (!gestorNome) throw new ErroApi(422, `Informe o ${nivel.rotulo.toLowerCase()}.`);
  await exigirGestorNoEscopo(sql, usuario, processo.id, gestorNome, nivel.coluna);

  if (alvoId !== null) {
    const [alvo] = await sql<{ perfil: string }[]>`SELECT perfil FROM portal.usuarios WHERE id = ${alvoId} AND ativo`;
    if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');
    if (alvo.perfil !== 'gestor') throw new ErroApi(422, 'O acesso indicado não é de gestor.');
  }

  const alterados = await sql<{ id: number }[]>`
    UPDATE portal.colaboradores c SET responsavel_id = ${alvoId}, atualizado_em = now()
     WHERE c.processo_id = ${processo.id} AND c.ativo
       AND lower(coalesce(${colunaSql(sql, nivel.coluna)}, '')) = ${gestorNome.toLowerCase()}
       AND ${escopoDoSolicitante(sql, usuario)}
    RETURNING c.id`;

  await auditar(sql, {
    usuario, tipo: 'permissao', entidade: 'usuario', entidadeId: alvoId ?? undefined,
    valorNovo: { nivel: nivel.chave, gestor_nome: gestorNome, usuario_id: alvoId,
      colaboradores: alterados.length },
    detalhes: { acao: alvoId ? 'colaboradores atribuídos ao gestor' : 'vínculo removido' }, ip: ctx.get('ip'),
  });

  return ctx.json({ ok: true, colaboradores: alterados.length });
});

/** Gera um novo link de primeiro acesso (o anterior deixa de valer). */
rotasEquipe.post('/equipe/usuarios/:id{[0-9]+}/convite', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const id = Number(ctx.req.param('id'));
  const { processo } = await carregarContexto(sql);

  const [alvo] = await sql<{ nome: string; usuario: string; perfil: string }[]>`
    SELECT nome, usuario, perfil FROM portal.usuarios WHERE id = ${id} AND ativo`;
  if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');
  if (usuario.perfil !== 'admin') {
    if (alvo.perfil !== 'gestor') throw new ErroApi(403, 'Apenas o RH redefine acessos que não são de gestor.');
    const [dentro] = await sql<{ total: string }[]>`
      SELECT COUNT(*)::text AS total FROM portal.colaboradores c
       WHERE c.processo_id = ${processo.id} AND c.responsavel_id = ${id}
         AND ${escopoDoSolicitante(sql, usuario)}`;
    if (!Number(dentro?.total ?? 0)) throw new ErroApi(403, 'Este gestor não responde por colaboradores da sua área.');
  }

  // Sai a senha antiga: quem pedir um novo convite define senha nova.
  await sql`UPDATE portal.usuarios SET senha_hash = NULL, trocar_senha = false WHERE id = ${id}`;
  await sql`DELETE FROM portal.sessoes WHERE usuario_id = ${id}`;
  const { convite, expira } = await gerarConvite(sql, id);

  await auditar(sql, {
    usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id,
    valorNovo: 'novo link de primeiro acesso', ip: ctx.get('ip'),
  });

  return ctx.json({ usuario_id: id, usuario: alvo.usuario, nome: alvo.nome, convite, expira_em: expira.toISOString() });
});

/** Atribui colaboradores escolhidos a mão (exceções à coluna da planilha). */
rotasEquipe.post('/equipe/atribuir', async (ctx) => {
  const sql = ctx.get('sql');
  const usuario = exigirPerfil(ctx.get('usuario'), 'admin', 'diretor');
  const { processo } = await carregarContexto(sql);
  const corpo = await ctx.req.json().catch(() => ({}));
  const ids = (corpo.colaborador_ids ?? []) as number[];
  const alvoId = corpo.usuario_id === null ? null : Number(corpo.usuario_id);
  if (!Array.isArray(ids) || !ids.length) throw new ErroApi(422, 'Selecione ao menos um colaborador.');

  if (alvoId !== null) {
    const [alvo] = await sql<{ perfil: string }[]>`SELECT perfil FROM portal.usuarios WHERE id = ${alvoId} AND ativo`;
    if (!alvo || alvo.perfil !== 'gestor') throw new ErroApi(422, 'Indique um acesso de gestor válido.');
  }

  const alterados = await sql<{ id: number; chapa: string }[]>`
    UPDATE portal.colaboradores c SET responsavel_id = ${alvoId}, atualizado_em = now()
     WHERE c.processo_id = ${processo.id} AND c.id = ANY(${ids}::int[])
       AND ${escopoDoSolicitante(sql, usuario)}
    RETURNING c.id, c.chapa`;
  if (alterados.length !== ids.length) {
    throw new ErroApi(403, 'Alguns colaboradores estão fora da sua área de responsabilidade.');
  }

  for (const alterado of alterados) {
    await auditar(sql, {
      usuario, tipo: 'permissao', entidade: 'colaborador', entidadeId: alterado.id, chapa: alterado.chapa,
      campo: 'responsavel', valorNovo: alvoId ?? 'sem gestor', ip: ctx.get('ip'),
    });
  }
  return ctx.json({ ok: true, colaboradores: alterados.length });
});
