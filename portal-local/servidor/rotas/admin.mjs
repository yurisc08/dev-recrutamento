/** Configurações do processo, catálogo de campos, ações, regras, estrutura, usuários e auditoria. */
import { agora } from '../banco.mjs';
import { ErroApi, exigirPerfil, semAcento } from '../dominio.mjs';
import { auditar, carregarContexto } from '../contexto.mjs';
import { novoConvite, resumoConvite } from '../senha.mjs';

const DIAS_CONVITE = 7;
const escolher = (corpo, chave, atual, converter = (v) => v) =>
  (corpo[chave] !== undefined ? converter(corpo[chave]) : atual);

function usuarioCompleto(acesso, id) {
  const linha = acesso.primeiro(`
    SELECT u.id, u.usuario, u.nome, u.email, u.perfil, u.ativo, u.trocar_senha, u.criado_em, u.ultimo_acesso,
           (CASE WHEN u.senha_hash IS NOT NULL THEN 1 ELSE 0 END) AS senha_definida, u.ativacao_expira_em
      FROM usuarios u WHERE u.id = ?`, id);
  if (!linha) return null;
  return {
    ...linha,
    diretorias: acesso.consultar('SELECT diretoria_id FROM usuario_diretorias WHERE usuario_id = ?', id)
      .map((d) => d.diretoria_id),
    divisoes: acesso.consultar('SELECT divisao_id FROM usuario_divisoes WHERE usuario_id = ?', id)
      .map((d) => d.divisao_id),
  };
}

export const rotasAdmin = [
  ['GET', '/api/config/processo', async (ctx) => carregarContexto(ctx.acesso).processo],

  ['PATCH', '/api/config/processo', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const { processo } = carregarContexto(ctx.acesso);
    const corpo = await ctx.corpo();

    const nome = escolher(corpo, 'nome', processo.nome, (v) => String(v).slice(0, 120));
    const dataBase = escolher(corpo, 'data_base', processo.data_base, (v) => String(v).slice(0, 10));
    const prazo = escolher(corpo, 'prazo', processo.prazo, (v) => String(v).slice(0, 10) || null);
    const aviso = escolher(corpo, 'aviso_confidencialidade', processo.aviso_confidencialidade,
      (v) => String(v).slice(0, 400));
    if (!nome.trim()) throw new ErroApi(422, 'Informe o nome do processo.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataBase)) throw new ErroApi(422, 'Data-base inválida (use AAAA-MM-DD).');

    ctx.acesso.executar(
      'UPDATE processos SET nome = ?, data_base = ?, prazo = ?, aviso_confidencialidade = ? WHERE id = ?',
      nome, dataBase, prazo, aviso, processo.id);
    auditar(ctx.acesso, {
      usuario, tipo: 'config', entidade: 'processo', entidadeId: processo.id,
      valorAnterior: processo, valorNovo: { nome, data_base: dataBase, prazo }, ip: ctx.ip,
    });
    return carregarContexto(ctx.acesso).processo;
  }],

  ['GET', '/api/config/campos', async (ctx) => {
    const { campos } = carregarContexto(ctx.acesso);
    return { itens: ctx.usuario.perfil === 'admin' ? campos : campos.filter((c) => !c.sensivel) };
  }],

  ['PATCH', /^\/api\/config\/campos\/(\d+)$/, async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const id = Number(ctx.params[0]);
    const corpo = await ctx.corpo();
    const atual = ctx.acesso.primeiro('SELECT * FROM campos WHERE id = ?', id);
    if (!atual) throw new ErroApi(404, 'Campo não encontrado.');

    const editavel = escolher(corpo, 'editavel_por', atual.editavel_por, String);
    ctx.acesso.executar(`
      UPDATE campos SET rotulo = ?, grupo = ?, obrigatorio = ?, editavel_por = ?, somente_leitura = ?,
                        visivel_lista = ?, somar = ?, agrupar = ?, sensivel = ?, ativo = ?
       WHERE id = ?`,
      escolher(corpo, 'rotulo', atual.rotulo, (v) => String(v).trim()),
      escolher(corpo, 'grupo', atual.grupo, (v) => String(v).slice(0, 60)),
      escolher(corpo, 'obrigatorio', atual.obrigatorio, Boolean) ? 1 : 0,
      editavel,
      corpo.editavel_por !== undefined ? (editavel === 'ninguem' ? 1 : 0) : (atual.somente_leitura ? 1 : 0),
      escolher(corpo, 'visivel_lista', atual.visivel_lista, Boolean) ? 1 : 0,
      escolher(corpo, 'somar', atual.somar, Boolean) ? 1 : 0,
      escolher(corpo, 'agrupar', atual.agrupar, Boolean) ? 1 : 0,
      escolher(corpo, 'sensivel', atual.sensivel, Boolean) ? 1 : 0,
      escolher(corpo, 'ativo', atual.ativo, Boolean) ? 1 : 0,
      id);

    auditar(ctx.acesso, {
      usuario, tipo: 'campo', entidade: 'campo', entidadeId: atual.chave,
      valorAnterior: { rotulo: atual.rotulo, ativo: atual.ativo, sensivel: atual.sensivel },
      valorNovo: corpo, ip: ctx.ip,
    });
    return ctx.acesso.primeiro('SELECT * FROM campos WHERE id = ?', id);
  }],

  ['POST', '/api/config/campos', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const { processo } = carregarContexto(ctx.acesso);
    const corpo = await ctx.corpo();
    const rotulo = String(corpo.rotulo ?? '').trim();
    if (!rotulo) throw new ErroApi(422, 'Informe o nome do campo.');
    const tipo = String(corpo.tipo ?? 'texto');
    if (!['texto', 'numero', 'moeda', 'data', 'lista', 'booleano'].includes(tipo)) throw new ErroApi(422, 'Tipo inválido.');

    const base = semAcento(rotulo).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 48) || 'campo';
    let chave = base;
    let sufixo = 2;
    while (ctx.acesso.primeiro('SELECT 1 AS existe FROM campos WHERE processo_id = ? AND chave = ?', processo.id, chave)) {
      chave = `${base}_${sufixo}`;
      sufixo += 1;
    }

    const opcoes = tipo === 'lista'
      ? (Array.isArray(corpo.opcoes) ? corpo.opcoes : String(corpo.opcoes ?? '').split('\n'))
        .map((o) => String(o).trim()).filter(Boolean)
      : null;
    if (tipo === 'lista' && !opcoes?.length) throw new ErroApi(422, 'Informe ao menos uma opção da lista.');

    const ordem = Number(ctx.acesso.primeiro(
      'SELECT coalesce(MAX(ordem), 0) AS ordem FROM campos WHERE processo_id = ?', processo.id)?.ordem ?? 0);
    const editavel = String(corpo.editavel_por ?? 'ninguem');

    const criado = ctx.acesso.executar(`
      INSERT INTO campos (processo_id, chave, rotulo, tipo, opcoes, grupo, origem, obrigatorio, somente_leitura,
                          editavel_por, visivel_lista, somar, agrupar, sensivel, ordem, ajuda)
      VALUES (?, ?, ?, ?, ?, ?, 'base', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      processo.id, chave, rotulo, tipo, opcoes ? JSON.stringify(opcoes) : null,
      String(corpo.grupo ?? 'Personalizados'), corpo.obrigatorio ? 1 : 0, editavel === 'ninguem' ? 1 : 0,
      editavel, corpo.visivel_lista !== false ? 1 : 0, corpo.somar ? 1 : 0, corpo.agrupar ? 1 : 0,
      corpo.sensivel ? 1 : 0, ordem + 10, corpo.ajuda ? String(corpo.ajuda).slice(0, 500) : null);

    auditar(ctx.acesso, { usuario, tipo: 'campo', entidade: 'campo', entidadeId: chave, valorNovo: rotulo, ip: ctx.ip });
    return { status: 201, corpo: ctx.acesso.primeiro('SELECT * FROM campos WHERE id = ?', Number(criado.lastInsertRowid)) };
  }],

  ['GET', '/api/config/acoes', async (ctx) => ({ itens: carregarContexto(ctx.acesso).acoes })],

  ['PATCH', /^\/api\/config\/acoes\/(\d+)$/, async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const id = Number(ctx.params[0]);
    const corpo = await ctx.corpo();
    const atual = ctx.acesso.primeiro('SELECT * FROM acoes WHERE id = ?', id);
    if (!atual) throw new ErroApi(404, 'Ação não encontrada.');

    if (corpo.ativo === false) {
      const total = Number(ctx.acesso.primeiro(
        'SELECT COUNT(*) AS total FROM avaliacoes WHERE acao = ?', atual.valor)?.total ?? 0);
      if (total > 0) {
        throw new ErroApi(409, `A ação "${atual.valor}" já foi usada em ${total} avaliação(ões) e não pode ser desativada.`);
      }
    }

    ctx.acesso.executar(`
      UPDATE acoes SET exige_justificativa = ?, exige_destino = ?, considera_desligamento = ?, ativo = ?
       WHERE id = ?`,
      escolher(corpo, 'exige_justificativa', atual.exige_justificativa, Boolean) ? 1 : 0,
      escolher(corpo, 'exige_destino', atual.exige_destino, Boolean) ? 1 : 0,
      escolher(corpo, 'considera_desligamento', atual.considera_desligamento, Boolean) ? 1 : 0,
      escolher(corpo, 'ativo', atual.ativo, Boolean) ? 1 : 0, id);

    auditar(ctx.acesso, { usuario, tipo: 'config', entidade: 'acao', entidadeId: atual.valor, valorNovo: corpo, ip: ctx.ip });
    return ctx.acesso.primeiro('SELECT * FROM acoes WHERE id = ?', id);
  }],

  ['GET', '/api/config/regras', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin');
    return { itens: carregarContexto(ctx.acesso).regras };
  }],

  ['PATCH', /^\/api\/config\/regras\/(\d+)$/, async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const id = Number(ctx.params[0]);
    const corpo = await ctx.corpo();
    const atual = ctx.acesso.primeiro('SELECT * FROM regras WHERE id = ?', id);
    if (!atual) throw new ErroApi(404, 'Regra não encontrada.');

    ctx.acesso.executar('UPDATE regras SET mensagem = ?, severidade = ?, exige_justificativa = ?, ativo = ? WHERE id = ?',
      escolher(corpo, 'mensagem', atual.mensagem, (v) => String(v).slice(0, 400)),
      escolher(corpo, 'severidade', atual.severidade, String),
      escolher(corpo, 'exige_justificativa', atual.exige_justificativa, Boolean) ? 1 : 0,
      escolher(corpo, 'ativo', atual.ativo, Boolean) ? 1 : 0, id);

    auditar(ctx.acesso, { usuario, tipo: 'config', entidade: 'regra', entidadeId: id, valorNovo: corpo, ip: ctx.ip });
    return ctx.acesso.primeiro('SELECT * FROM regras WHERE id = ?', id);
  }],

  ['GET', '/api/config/estrutura', async (ctx) => {
    const { processo } = carregarContexto(ctx.acesso);
    return {
      diretorias: ctx.acesso.consultar(
        'SELECT id, nome, ativo FROM diretorias WHERE processo_id = ? ORDER BY nome', processo.id),
      divisoes: ctx.acesso.consultar(`
        SELECT d.id, d.nome, d.ativo, d.diretoria_id, dir.nome AS diretoria_nome
          FROM divisoes d JOIN diretorias dir ON dir.id = d.diretoria_id
         WHERE dir.processo_id = ? ORDER BY dir.nome, d.nome`, processo.id),
      gestores: [],
    };
  }],

  ['POST', '/api/config/diretorias', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const { processo } = carregarContexto(ctx.acesso);
    const nome = String((await ctx.corpo()).nome ?? '').trim();
    if (!nome) throw new ErroApi(422, 'Informe o nome da Diretoria.');
    if (ctx.acesso.primeiro('SELECT 1 AS existe FROM diretorias WHERE processo_id = ? AND nome = ?', processo.id, nome)) {
      throw new ErroApi(409, 'Já existe uma Diretoria com esse nome.');
    }
    const criada = ctx.acesso.executar('INSERT INTO diretorias (processo_id, nome) VALUES (?, ?)', processo.id, nome);
    auditar(ctx.acesso, { usuario, tipo: 'estrutura', entidade: 'diretoria', valorNovo: nome, ip: ctx.ip });
    return { status: 201, corpo: ctx.acesso.primeiro('SELECT * FROM diretorias WHERE id = ?', Number(criada.lastInsertRowid)) };
  }],

  ['POST', '/api/config/divisoes', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const corpo = await ctx.corpo();
    const nome = String(corpo.nome ?? '').trim();
    const diretoriaId = Number(corpo.diretoria_id);
    if (!nome || !diretoriaId) throw new ErroApi(422, 'Informe a Diretoria e o nome da Divisão.');
    if (ctx.acesso.primeiro('SELECT 1 AS existe FROM divisoes WHERE diretoria_id = ? AND nome = ?', diretoriaId, nome)) {
      throw new ErroApi(409, 'Já existe uma Divisão com esse nome nesta Diretoria.');
    }
    const criada = ctx.acesso.executar('INSERT INTO divisoes (diretoria_id, nome) VALUES (?, ?)', diretoriaId, nome);
    auditar(ctx.acesso, { usuario, tipo: 'estrutura', entidade: 'divisao', valorNovo: nome, ip: ctx.ip });
    return { status: 201, corpo: ctx.acesso.primeiro('SELECT * FROM divisoes WHERE id = ?', Number(criada.lastInsertRowid)) };
  }],

  ['GET', '/api/usuarios', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin');
    const ids = ctx.acesso.consultar('SELECT id FROM usuarios ORDER BY nome');
    return { itens: ids.map((linha) => usuarioCompleto(ctx.acesso, linha.id)) };
  }],

  ['POST', '/api/usuarios', async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const corpo = await ctx.corpo();
    const login = String(corpo.usuario ?? '').trim().toLowerCase();
    const nome = String(corpo.nome ?? '').trim();
    const perfil = String(corpo.perfil ?? 'gestor');
    if (!/^[a-z0-9._-]{3,40}$/.test(login)) {
      throw new ErroApi(422, 'Login deve ter de 3 a 40 caracteres (letras, números, ponto, hífen ou sublinhado).');
    }
    if (!nome) throw new ErroApi(422, 'Informe o nome completo.');
    if (!['admin', 'diretor', 'gestor'].includes(perfil)) throw new ErroApi(422, 'Perfil inválido.');
    if (ctx.acesso.primeiro('SELECT 1 AS existe FROM usuarios WHERE lower(usuario) = ?', login)) {
      throw new ErroApi(409, 'Já existe um usuário com este login.');
    }

    // Sem senha: sai um link e a pessoa define a dela.
    const convite = novoConvite();
    const expira = new Date(Date.now() + DIAS_CONVITE * 86400 * 1000);
    const criado = ctx.acesso.executar(`
      INSERT INTO usuarios (usuario, nome, email, senha_hash, perfil, trocar_senha, criado_por, criado_em,
                            ativacao_hash, ativacao_expira_em)
      VALUES (?, ?, ?, NULL, ?, 0, ?, ?, ?, ?)`,
      login, nome, String(corpo.email ?? '').trim() || null, perfil, usuario.id, agora(),
      resumoConvite(convite), expira.toISOString());
    const id = Number(criado.lastInsertRowid);

    for (const diretoriaId of corpo.diretorias ?? []) {
      ctx.acesso.executar('INSERT OR IGNORE INTO usuario_diretorias (usuario_id, diretoria_id) VALUES (?, ?)', id, diretoriaId);
    }
    for (const divisaoId of corpo.divisoes ?? []) {
      ctx.acesso.executar('INSERT OR IGNORE INTO usuario_divisoes (usuario_id, divisao_id) VALUES (?, ?)', id, divisaoId);
    }
    auditar(ctx.acesso, {
      usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id, valorNovo: { login, perfil }, ip: ctx.ip,
    });
    return { status: 201, corpo: { ...usuarioCompleto(ctx.acesso, id), convite, expira_em: expira.toISOString() } };
  }],

  ['PATCH', /^\/api\/usuarios\/(\d+)$/, async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const id = Number(ctx.params[0]);
    const corpo = await ctx.corpo();
    const atual = ctx.acesso.primeiro('SELECT perfil, ativo, nome, email FROM usuarios WHERE id = ?', id);
    if (!atual) throw new ErroApi(404, 'Usuário não encontrado.');

    const perfil = escolher(corpo, 'perfil', atual.perfil, String);
    if (!['admin', 'diretor', 'gestor'].includes(perfil)) throw new ErroApi(422, 'Perfil inválido.');
    const ativo = escolher(corpo, 'ativo', atual.ativo, Boolean);
    if (id === usuario.id && (!ativo || perfil !== 'admin')) {
      throw new ErroApi(409, 'Você não pode remover o próprio acesso de administrador.');
    }

    ctx.acesso.executar('UPDATE usuarios SET nome = ?, email = ?, perfil = ?, ativo = ? WHERE id = ?',
      escolher(corpo, 'nome', atual.nome, (v) => String(v).trim()),
      escolher(corpo, 'email', atual.email, (v) => String(v).trim() || null),
      perfil, ativo ? 1 : 0, id);
    if (!ativo) ctx.acesso.executar('DELETE FROM sessoes WHERE usuario_id = ?', id);

    if (corpo.diretorias !== undefined) {
      ctx.acesso.executar('DELETE FROM usuario_diretorias WHERE usuario_id = ?', id);
      for (const diretoriaId of corpo.diretorias) {
        ctx.acesso.executar('INSERT OR IGNORE INTO usuario_diretorias (usuario_id, diretoria_id) VALUES (?, ?)', id, diretoriaId);
      }
    }
    if (corpo.divisoes !== undefined) {
      ctx.acesso.executar('DELETE FROM usuario_divisoes WHERE usuario_id = ?', id);
      for (const divisaoId of corpo.divisoes) {
        ctx.acesso.executar('INSERT OR IGNORE INTO usuario_divisoes (usuario_id, divisao_id) VALUES (?, ?)', id, divisaoId);
      }
    }
    if (corpo.diretorias !== undefined || corpo.divisoes !== undefined) {
      auditar(ctx.acesso, {
        usuario, tipo: 'permissao', entidade: 'usuario', entidadeId: id,
        valorNovo: { diretorias: corpo.diretorias, divisoes: corpo.divisoes }, ip: ctx.ip,
      });
    }
    auditar(ctx.acesso, {
      usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id,
      valorAnterior: { perfil: atual.perfil, ativo: atual.ativo }, valorNovo: { perfil, ativo }, ip: ctx.ip,
    });
    return usuarioCompleto(ctx.acesso, id);
  }],

  ['POST', /^\/api\/usuarios\/(\d+)\/senha$/, async (ctx) => {
    const usuario = exigirPerfil(ctx.usuario, 'admin');
    const id = Number(ctx.params[0]);
    const alvo = ctx.acesso.primeiro('SELECT nome FROM usuarios WHERE id = ?', id);
    if (!alvo) throw new ErroApi(404, 'Usuário não encontrado.');

    // Redefinir = tirar a senha e mandar novo link; a nova é escolhida pela pessoa.
    const convite = novoConvite();
    const expira = new Date(Date.now() + DIAS_CONVITE * 86400 * 1000);
    ctx.acesso.executar(`
      UPDATE usuarios SET senha_hash = NULL, trocar_senha = 0, ativacao_hash = ?, ativacao_expira_em = ?
       WHERE id = ?`, resumoConvite(convite), expira.toISOString(), id);
    ctx.acesso.executar('DELETE FROM sessoes WHERE usuario_id = ?', id);
    auditar(ctx.acesso, {
      usuario, tipo: 'usuario', entidade: 'usuario', entidadeId: id,
      valorNovo: 'novo link de primeiro acesso', ip: ctx.ip,
    });
    return { ok: true, convite, expira_em: expira.toISOString(), nome: alvo.nome };
  }],

  ['GET', '/api/auditoria', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin', 'diretor');
    const condicoes = ['1 = 1'];
    const params = [];
    if (ctx.query.chapa) { condicoes.push('a.chapa = ?'); params.push(ctx.query.chapa); }
    if (ctx.query.tipo) { condicoes.push('a.tipo = ?'); params.push(ctx.query.tipo); }
    if (ctx.query.usuario) { condicoes.push('lower(a.usuario_nome) LIKE ?'); params.push(`%${ctx.query.usuario.toLowerCase()}%`); }
    const limite = Math.min(Number(ctx.query.limite) || 300, 2000);

    const itens = ctx.acesso.consultar(`
      SELECT a.*, c.nome AS colaborador_nome
        FROM auditoria a
        LEFT JOIN colaboradores c ON CAST(c.id AS TEXT) = a.entidade_id AND a.entidade = 'colaborador'
       WHERE ${condicoes.join(' AND ')} ORDER BY a.criado_em DESC, a.id DESC LIMIT ?`, ...params, limite);
    return { itens };
  }],

  ['GET', '/api/auditoria/importacoes', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin', 'diretor');
    return {
      itens: ctx.acesso.consultar(`
        SELECT i.*, u.nome AS usuario FROM importacoes i
          LEFT JOIN usuarios u ON u.id = i.usuario_id
         ORDER BY i.criado_em DESC LIMIT 100`),
    };
  }],

  ['GET', '/api/auditoria/acessos', async (ctx) => {
    exigirPerfil(ctx.usuario, 'admin');
    return {
      itens: ctx.acesso.consultar(
        'SELECT usuario, ip, sucesso, criado_em FROM tentativas_login ORDER BY criado_em DESC LIMIT 300'),
    };
  }],
];
