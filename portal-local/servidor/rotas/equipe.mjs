/**
 * Gestores imediatos: é aqui que o diretor distribui a base sem mandar arquivo.
 *
 * A coluna GESTOR IMEDIATO da planilha diz quem responde por quem. O diretor
 * (ou o RH) cria o acesso do gerente, manda o link, e o gerente marca as
 * decisões da própria equipe na mesma base.
 */
import { agora } from '../banco.mjs';
import { ErroApi, exigirPerfil, semAcento } from '../dominio.mjs';
import { auditar, carregarContexto } from '../contexto.mjs';
import { novoConvite, resumoConvite } from '../senha.mjs';

const DIAS_CONVITE = 7;

/** RH vê todos; diretor, só a Diretoria dele. */
function escopoDoSolicitante(usuario) {
  if (usuario.perfil === 'admin') return { sql: '1 = 1', params: [] };
  if (!usuario.diretorias.length) return { sql: '1 = 0', params: [] };
  return {
    sql: `c.diretoria_id IN (${usuario.diretorias.map(() => '?').join(', ')})`,
    params: [...usuario.diretorias],
  };
}

function exigirGestorNoEscopo(ctx, usuario, processoId, gestorNome) {
  const escopo = escopoDoSolicitante(usuario);
  const total = Number(ctx.acesso.primeiro(`
    SELECT COUNT(*) AS total FROM colaboradores c
     WHERE c.processo_id = ? AND c.ativo = 1 AND lower(coalesce(c.gestor_nome, '')) = ? AND ${escopo.sql}`,
    processoId, gestorNome.toLowerCase(), ...escopo.params)?.total ?? 0);
  if (!total) throw new ErroApi(403, 'Este gestor não tem colaboradores dentro da sua área de responsabilidade.');
  return total;
}

function gerarConvite(ctx, usuarioId) {
  const convite = novoConvite();
  const expira = new Date(Date.now() + DIAS_CONVITE * 86400 * 1000);
  ctx.acesso.executar('UPDATE usuarios SET ativacao_hash = ?, ativacao_expira_em = ? WHERE id = ?',
    resumoConvite(convite), expira.toISOString(), usuarioId);
  return { convite, expira };
}

function sugerirLogin(nome) {
  const partes = semAcento(nome).replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
  return (partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}` : partes[0] ?? '').slice(0, 40);
}

export const rotasEquipe = [
  ['GET', '/api/equipe/gestores', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const { processo } = carregarContexto(ctx.acesso);
    const escopo = escopoDoSolicitante(usuario);

    const itens = ctx.acesso.consultar(`
      SELECT coalesce(nullif(c.gestor_nome, ''), '(sem gestor informado)') AS gestor_nome,
             max(u.id)                 AS usuario_id,
             max(u.usuario)            AS usuario,
             max(u.nome)               AS usuario_nome,
             max(u.email)              AS email,
             max(CASE WHEN u.ativo = 1 THEN 1 ELSE 0 END)            AS ativo,
             max(CASE WHEN u.senha_hash IS NOT NULL THEN 1 ELSE 0 END) AS senha_definida,
             max(u.ativacao_expira_em) AS convite_expira_em,
             max(u.ultimo_acesso)      AS ultimo_acesso,
             COUNT(c.id)               AS total,
             SUM(CASE WHEN a.acao IS NOT NULL THEN 1 ELSE 0 END)     AS avaliados,
             SUM(CASE WHEN a.acao IS NULL THEN 1 ELSE 0 END)         AS pendentes,
             SUM(CASE WHEN a.status = 'homologada' THEN 1 ELSE 0 END) AS homologadas
        FROM colaboradores c
        LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
        LEFT JOIN usuarios u ON u.id = c.responsavel_id
       WHERE c.processo_id = ? AND c.ativo = 1 AND ${escopo.sql}
       GROUP BY 1 ORDER BY 1`, processo.id, ...escopo.params);

    const momento = agora();
    return {
      itens: itens.map((item) => {
        const acesso = !item.usuario_id ? 'sem_acesso'
          : !item.ativo ? 'desativado'
            : item.senha_definida ? 'ativo'
              : item.convite_expira_em && item.convite_expira_em > momento ? 'convite_pendente'
                : 'convite_expirado';
        return {
          ...item,
          ativo: item.usuario_id ? Boolean(item.ativo) : null,
          senha_definida: Boolean(item.senha_definida),
          acesso,
          total: Number(item.total),
          avaliados: Number(item.avaliados),
          pendentes: Number(item.pendentes),
          homologadas: Number(item.homologadas),
        };
      }),
    };
  }],

  ['GET', '/api/equipe/usuarios', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin', 'diretor');
    return {
      itens: ctx.acesso.consultar(`
        SELECT id, usuario, nome, email, ativo,
               (CASE WHEN senha_hash IS NOT NULL THEN 1 ELSE 0 END) AS senha_definida
          FROM usuarios WHERE perfil = 'gestor' ORDER BY nome`),
    };
  }],

  ['POST', '/api/equipe/gestores/acesso', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const { processo } = carregarContexto(ctx.acesso);
    const corpo = await ctx.corpo();

    const gestorNome = String(corpo.gestor_nome ?? '').trim();
    if (!gestorNome) throw new ErroApi(422, 'Informe o gestor imediato.');
    exigirGestorNoEscopo(ctx, usuario, processo.id, gestorNome);

    const nome = String(corpo.nome ?? gestorNome).trim();
    const login = String(corpo.usuario ?? sugerirLogin(nome)).trim().toLowerCase();
    const email = String(corpo.email ?? '').trim() || null;
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) {
      throw new ErroApi(422, 'Login deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).');
    }
    if (ctx.acesso.primeiro('SELECT 1 AS existe FROM usuarios WHERE lower(usuario) = ?', login)) {
      throw new ErroApi(409, 'Já existe um usuário com este login. Use "vincular a um acesso existente".');
    }

    const criado = ctx.acesso.executar(`
      INSERT INTO usuarios (usuario, nome, email, perfil, senha_hash, trocar_senha, criado_por, criado_em)
      VALUES (?, ?, ?, 'gestor', NULL, 0, ?, ?)`, login, nome, email, usuario.id, agora());
    const usuarioId = Number(criado.lastInsertRowid);

    const escopo = escopoDoSolicitante(usuario);
    const vinculados = ctx.acesso.executar(`
      UPDATE colaboradores SET responsavel_id = ?, atualizado_em = ?
       WHERE processo_id = ? AND ativo = 1 AND lower(coalesce(gestor_nome, '')) = ?
         AND id IN (SELECT c.id FROM colaboradores c WHERE ${escopo.sql})`,
      usuarioId, agora(), processo.id, gestorNome.toLowerCase(), ...escopo.params);

    const { convite, expira } = gerarConvite(ctx, usuarioId);
    auditar(ctx.acesso, {
      usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: usuarioId,
      valorNovo: { login, perfil: 'gestor', gestor_nome: gestorNome, colaboradores: Number(vinculados.changes) },
      detalhes: { acao: 'acesso de gestor criado, aguardando primeiro acesso' }, ip: ctx.ip,
    });

    return {
      status: 201,
      corpo: {
        usuario_id: usuarioId, usuario: login, nome, colaboradores: Number(vinculados.changes),
        convite, expira_em: expira.toISOString(),
      },
    };
  }],

  ['POST', '/api/equipe/gestores/vincular', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const { processo } = carregarContexto(ctx.acesso);
    const corpo = await ctx.corpo();

    const gestorNome = String(corpo.gestor_nome ?? '').trim();
    const alvoId = corpo.usuario_id === null || corpo.usuario_id === undefined ? null : Number(corpo.usuario_id);
    if (!gestorNome) throw new ErroApi(422, 'Informe o gestor imediato.');
    exigirGestorNoEscopo(ctx, usuario, processo.id, gestorNome);

    if (alvoId !== null) {
      const alvo = ctx.acesso.primeiro('SELECT perfil FROM usuarios WHERE id = ? AND ativo = 1', alvoId);
      if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');
      if (alvo.perfil !== 'gestor') throw new ErroApi(422, 'O acesso indicado não é de gestor.');
    }

    const escopo = escopoDoSolicitante(usuario);
    const alterados = ctx.acesso.executar(`
      UPDATE colaboradores SET responsavel_id = ?, atualizado_em = ?
       WHERE processo_id = ? AND ativo = 1 AND lower(coalesce(gestor_nome, '')) = ?
         AND id IN (SELECT c.id FROM colaboradores c WHERE ${escopo.sql})`,
      alvoId, agora(), processo.id, gestorNome.toLowerCase(), ...escopo.params);

    auditar(ctx.acesso, {
      usuario, tipo: 'permissao', entidade: 'usuario', entidadeId: alvoId ?? undefined,
      valorNovo: { gestor_nome: gestorNome, usuario_id: alvoId, colaboradores: Number(alterados.changes) },
      detalhes: { acao: alvoId ? 'colaboradores atribuídos ao gestor' : 'vínculo removido' }, ip: ctx.ip,
    });
    return { ok: true, colaboradores: Number(alterados.changes) };
  }],

  ['POST', /^\/api\/equipe\/usuarios\/(\d+)\/convite$/, async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const id = Number(ctx.params[0]);
    const { processo } = carregarContexto(ctx.acesso);

    const alvo = ctx.acesso.primeiro('SELECT nome, usuario, perfil FROM usuarios WHERE id = ? AND ativo = 1', id);
    if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');
    if (usuario.perfil !== 'admin') {
      if (alvo.perfil !== 'gestor') throw new ErroApi(403, 'Apenas o RH redefine acessos que não são de gestor.');
      const escopo = escopoDoSolicitante(usuario);
      const dentro = Number(ctx.acesso.primeiro(`
        SELECT COUNT(*) AS total FROM colaboradores c
         WHERE c.processo_id = ? AND c.responsavel_id = ? AND ${escopo.sql}`,
        processo.id, id, ...escopo.params)?.total ?? 0);
      if (!dentro) throw new ErroApi(403, 'Este gestor não responde por colaboradores da sua área.');
    }

    // Sai a senha antiga: quem pedir um novo convite define senha nova.
    ctx.acesso.executar('UPDATE usuarios SET senha_hash = NULL, trocar_senha = 0 WHERE id = ?', id);
    ctx.acesso.executar('DELETE FROM sessoes WHERE usuario_id = ?', id);
    const { convite, expira } = gerarConvite(ctx, id);

    auditar(ctx.acesso, {
      usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id,
      valorNovo: 'novo link de primeiro acesso', ip: ctx.ip,
    });
    return { usuario_id: id, usuario: alvo.usuario, nome: alvo.nome, convite, expira_em: expira.toISOString() };
  }],

  ['POST', '/api/equipe/atribuir', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const { processo } = carregarContexto(ctx.acesso);
    const corpo = await ctx.corpo();
    const ids = Array.isArray(corpo.colaborador_ids) ? corpo.colaborador_ids.map(Number) : [];
    const alvoId = corpo.usuario_id === null || corpo.usuario_id === undefined ? null : Number(corpo.usuario_id);
    if (!ids.length) throw new ErroApi(422, 'Selecione ao menos um colaborador.');

    if (alvoId !== null) {
      const alvo = ctx.acesso.primeiro('SELECT perfil FROM usuarios WHERE id = ? AND ativo = 1', alvoId);
      if (!alvo || alvo.perfil !== 'gestor') throw new ErroApi(422, 'Indique um acesso de gestor válido.');
    }

    const escopo = escopoDoSolicitante(usuario);
    const permitidos = ctx.acesso.consultar(`
      SELECT c.id, c.chapa FROM colaboradores c
       WHERE c.processo_id = ? AND c.id IN (${ids.map(() => '?').join(', ')}) AND ${escopo.sql}`,
      processo.id, ...ids, ...escopo.params);
    if (permitidos.length !== ids.length) {
      throw new ErroApi(403, 'Alguns colaboradores estão fora da sua área de responsabilidade.');
    }

    for (const alvo of permitidos) {
      ctx.acesso.executar('UPDATE colaboradores SET responsavel_id = ?, atualizado_em = ? WHERE id = ?',
        alvoId, agora(), alvo.id);
      auditar(ctx.acesso, {
        usuario, tipo: 'permissao', entidade: 'colaborador', entidadeId: alvo.id, chapa: alvo.chapa,
        campo: 'responsavel', valorNovo: alvoId ?? 'sem gestor', ip: ctx.ip,
      });
    }
    return { ok: true, colaboradores: permitidos.length };
  }],
];
