import { Router } from 'express';
import { consultar, consultarUm, pool } from '../db/pool.js';
import { ErroHttp, rota } from '../http/erros.js';
import { exigirPerfil } from '../http/auth.js';
import { auditar } from '../http/auditoria.js';
import { chaveDeRotulo } from '../dominio/valores.js';
import { carregarContexto, processoAtivo } from '../servicos/processo.js';

export const rotasConfiguracao = Router();

const TIPOS = ['texto', 'numero', 'moeda', 'data', 'lista', 'booleano'];
const EDITAVEIS = ['ninguem', 'gestor', 'diretor', 'admin'];
const OPERADORES = ['preenchido', 'vazio', 'igual', 'diferente', 'contem', 'data_futura', 'data_passada', 'maior_que', 'menor_que'];
const SEVERIDADES = ['info', 'atencao', 'critico'];

/* ------------------------------ processo ------------------------------ */

rotasConfiguracao.get('/processo', rota(async (_req, res) => {
  res.json(await processoAtivo());
}));

rotasConfiguracao.patch('/processo', exigirPerfil('admin'), rota(async (req, res) => {
  const atual = await processoAtivo();
  const corpo = req.body ?? {};
  const novo = {
    nome: corpo.nome !== undefined ? String(corpo.nome).slice(0, 120) : atual.nome,
    data_base: corpo.data_base !== undefined ? String(corpo.data_base).slice(0, 10) : atual.data_base,
    prazo: corpo.prazo !== undefined ? (String(corpo.prazo).slice(0, 10) || null) : atual.prazo,
    aviso: corpo.aviso_confidencialidade !== undefined
      ? String(corpo.aviso_confidencialidade).slice(0, 400)
      : atual.aviso_confidencialidade,
  };
  if (!novo.nome.trim()) throw new ErroHttp(422, 'Informe o nome do processo.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(novo.data_base)) throw new ErroHttp(422, 'Data-base inválida.');

  await pool.query(
    'UPDATE processos SET nome = $1, data_base = $2, prazo = $3, aviso_confidencialidade = $4 WHERE id = $5',
    [novo.nome, novo.data_base, novo.prazo, novo.aviso, atual.id],
  );
  await auditar(req, {
    tipo: 'config', entidade: 'processo', entidadeId: atual.id,
    valorAnterior: atual, valorNovo: novo,
  });
  res.json(await processoAtivo());
}));

/* ------------------------------- campos ------------------------------- */

rotasConfiguracao.get('/campos', rota(async (_req, res) => {
  const { campos } = await carregarContexto();
  res.json({ itens: campos });
}));

rotasConfiguracao.post('/campos', exigirPerfil('admin'), rota(async (req, res) => {
  const processo = await processoAtivo();
  const corpo = req.body ?? {};
  const rotulo = String(corpo.rotulo ?? '').trim();
  if (!rotulo) throw new ErroHttp(422, 'Informe o nome do campo.');
  const tipo = String(corpo.tipo ?? 'texto');
  if (!TIPOS.includes(tipo)) throw new ErroHttp(422, `Tipo inválido. Use: ${TIPOS.join(', ')}.`);
  const editavel = String(corpo.editavel_por ?? 'ninguem');
  if (!EDITAVEIS.includes(editavel)) throw new ErroHttp(422, 'Permissão de edição inválida.');

  let opcoes: string[] | null = null;
  if (tipo === 'lista') {
    const lista: string[] = (Array.isArray(corpo.opcoes) ? corpo.opcoes : String(corpo.opcoes ?? '').split('\n'))
      .map((opcao: unknown) => String(opcao).trim())
      .filter(Boolean);
    if (lista.length === 0) throw new ErroHttp(422, 'Informe ao menos uma opção para o campo do tipo lista.');
    opcoes = lista;
  }

  let chave = chaveDeRotulo(rotulo);
  let sufixo = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await consultarUm('SELECT 1 FROM campos WHERE processo_id = $1 AND chave = $2', [processo.id, chave])) {
    chave = `${chaveDeRotulo(rotulo)}_${sufixo}`;
    sufixo += 1;
  }
  const ordemLinha = await consultarUm<{ ordem: string }>(
    'SELECT coalesce(MAX(ordem), 0)::text AS ordem FROM campos WHERE processo_id = $1', [processo.id],
  );

  const criado = await consultarUm(
    `INSERT INTO campos (processo_id, chave, rotulo, tipo, opcoes, grupo, origem, obrigatorio, somente_leitura,
                         editavel_por, visivel_lista, somar, agrupar, ordem, ajuda)
     VALUES ($1, $2, $3, $4, $5, $6, 'base', $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
    [
      processo.id, chave, rotulo, tipo, opcoes ? JSON.stringify(opcoes) : null,
      corpo.grupo ? String(corpo.grupo).slice(0, 60) : 'Personalizados',
      Boolean(corpo.obrigatorio), editavel === 'ninguem',
      editavel, corpo.visivel_lista !== false, Boolean(corpo.somar), Boolean(corpo.agrupar),
      Number(ordemLinha?.ordem ?? 0) + 10, corpo.ajuda ? String(corpo.ajuda).slice(0, 500) : null,
    ],
  );
  await auditar(req, { tipo: 'campo', entidade: 'campo', entidadeId: chave, valorNovo: rotulo });
  res.status(201).json(criado);
}));

rotasConfiguracao.patch('/campos/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  const atual = await consultarUm<Record<string, unknown>>('SELECT * FROM campos WHERE id = $1', [id]);
  if (!atual) throw new ErroHttp(404, 'Campo não encontrado.');
  const corpo = req.body ?? {};

  const tipo = corpo.tipo !== undefined ? String(corpo.tipo) : String(atual.tipo);
  if (!TIPOS.includes(tipo)) throw new ErroHttp(422, 'Tipo inválido.');
  const editavel = corpo.editavel_por !== undefined ? String(corpo.editavel_por) : String(atual.editavel_por);
  if (!EDITAVEIS.includes(editavel)) throw new ErroHttp(422, 'Permissão de edição inválida.');

  let opcoes = atual.opcoes as string[] | null;
  if (corpo.opcoes !== undefined || tipo !== atual.tipo) {
    if (tipo === 'lista') {
      const lista = (Array.isArray(corpo.opcoes) ? corpo.opcoes : String(corpo.opcoes ?? '').split('\n'))
        .map((opcao: unknown) => String(opcao).trim())
        .filter(Boolean);
      if (lista.length === 0) throw new ErroHttp(422, 'Informe ao menos uma opção para o campo do tipo lista.');
      opcoes = lista;
    } else {
      opcoes = null;
    }
  }

  const atualizado = await consultarUm(
    `UPDATE campos SET rotulo = $1, tipo = $2, opcoes = $3, grupo = $4, obrigatorio = $5,
            somente_leitura = $6, editavel_por = $7, visivel_lista = $8, somar = $9, agrupar = $10,
            ativo = $11, ajuda = $12, ordem = $13
      WHERE id = $14 RETURNING *`,
    [
      corpo.rotulo !== undefined ? String(corpo.rotulo).trim() : atual.rotulo,
      tipo,
      opcoes ? JSON.stringify(opcoes) : null,
      corpo.grupo !== undefined ? String(corpo.grupo).slice(0, 60) : atual.grupo,
      corpo.obrigatorio !== undefined ? Boolean(corpo.obrigatorio) : atual.obrigatorio,
      corpo.somente_leitura !== undefined ? Boolean(corpo.somente_leitura) : editavel === 'ninguem',
      editavel,
      corpo.visivel_lista !== undefined ? Boolean(corpo.visivel_lista) : atual.visivel_lista,
      corpo.somar !== undefined ? Boolean(corpo.somar) : atual.somar,
      corpo.agrupar !== undefined ? Boolean(corpo.agrupar) : atual.agrupar,
      corpo.ativo !== undefined ? Boolean(corpo.ativo) : atual.ativo,
      corpo.ajuda !== undefined ? String(corpo.ajuda ?? '').slice(0, 500) || null : atual.ajuda,
      corpo.ordem !== undefined ? Number(corpo.ordem) : atual.ordem,
      id,
    ],
  );
  await auditar(req, {
    tipo: 'campo', entidade: 'campo', entidadeId: String(atual.chave),
    valorAnterior: { rotulo: atual.rotulo, ativo: atual.ativo, editavel_por: atual.editavel_por, obrigatorio: atual.obrigatorio },
    valorNovo: { rotulo: corpo.rotulo ?? atual.rotulo, ativo: corpo.ativo ?? atual.ativo, editavel_por: editavel, obrigatorio: corpo.obrigatorio ?? atual.obrigatorio },
  });
  res.json(atualizado);
}));

rotasConfiguracao.post('/campos/ordem', exigirPerfil('admin'), rota(async (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  for (const [indice, id] of ids.entries()) {
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE campos SET ordem = $1 WHERE id = $2', [(indice + 1) * 10, id]);
  }
  const { campos } = await carregarContexto();
  res.json({ itens: campos });
}));

/**
 * Campos não são apagados: são desativados, para preservar o histórico
 * das cargas e da auditoria que já referenciam a chave.
 */
rotasConfiguracao.delete('/campos/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  const campo = await consultarUm<{ chave: string; origem: string }>('SELECT chave, origem FROM campos WHERE id = $1', [id]);
  if (!campo) throw new ErroHttp(404, 'Campo não encontrado.');
  if (campo.origem === 'avaliacao') throw new ErroHttp(409, 'Campos da avaliação não podem ser desativados.');
  if (['chapa', 'nome', 'diretoria', 'divisao', 'situacao'].includes(campo.chave)) {
    throw new ErroHttp(409, 'Campo essencial ao funcionamento do portal — pode ser renomeado, mas não desativado.');
  }
  await pool.query('UPDATE campos SET ativo = false WHERE id = $1', [id]);
  await auditar(req, { tipo: 'campo', entidade: 'campo', entidadeId: campo.chave, valorNovo: 'desativado' });
  res.json({ ok: true });
}));

/* -------------------------------- ações ------------------------------- */

rotasConfiguracao.get('/acoes', rota(async (_req, res) => {
  const { acoes } = await carregarContexto();
  res.json({ itens: acoes });
}));

rotasConfiguracao.post('/acoes', exigirPerfil('admin'), rota(async (req, res) => {
  const processo = await processoAtivo();
  const valor = String(req.body?.valor ?? '').trim();
  if (!valor) throw new ErroHttp(422, 'Informe o nome da ação.');
  const ordem = await consultarUm<{ ordem: string }>(
    'SELECT coalesce(MAX(ordem), 0)::text AS ordem FROM acoes WHERE processo_id = $1', [processo.id],
  );
  const criada = await consultarUm(
    `INSERT INTO acoes (processo_id, valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (processo_id, valor) DO NOTHING RETURNING *`,
    [
      processo.id, valor, String(req.body?.cor ?? 'neutra'),
      Boolean(req.body?.exige_justificativa), Boolean(req.body?.exige_destino),
      Boolean(req.body?.considera_desligamento), Number(ordem?.ordem ?? 0) + 10,
    ],
  );
  if (!criada) throw new ErroHttp(409, 'Já existe uma ação com esse nome.');
  await auditar(req, { tipo: 'config', entidade: 'acao', entidadeId: valor, valorNovo: valor });
  res.status(201).json(criada);
}));

rotasConfiguracao.patch('/acoes/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  const atual = await consultarUm<Record<string, unknown>>('SELECT * FROM acoes WHERE id = $1', [id]);
  if (!atual) throw new ErroHttp(404, 'Ação não encontrada.');
  const corpo = req.body ?? {};

  if (corpo.ativo === false) {
    const emUso = await consultarUm<{ total: string }>(
      'SELECT COUNT(*)::text AS total FROM avaliacoes WHERE acao = $1', [String(atual.valor)],
    );
    if (Number(emUso?.total ?? 0) > 0) {
      throw new ErroHttp(409, `A ação "${String(atual.valor)}" já foi usada em ${emUso?.total} avaliação(ões) e não pode ser desativada.`);
    }
  }

  const atualizada = await consultarUm(
    `UPDATE acoes SET cor = $1, exige_justificativa = $2, exige_destino = $3,
            considera_desligamento = $4, ativo = $5, ordem = $6 WHERE id = $7 RETURNING *`,
    [
      corpo.cor !== undefined ? String(corpo.cor) : atual.cor,
      corpo.exige_justificativa !== undefined ? Boolean(corpo.exige_justificativa) : atual.exige_justificativa,
      corpo.exige_destino !== undefined ? Boolean(corpo.exige_destino) : atual.exige_destino,
      corpo.considera_desligamento !== undefined ? Boolean(corpo.considera_desligamento) : atual.considera_desligamento,
      corpo.ativo !== undefined ? Boolean(corpo.ativo) : atual.ativo,
      corpo.ordem !== undefined ? Number(corpo.ordem) : atual.ordem,
      id,
    ],
  );
  await auditar(req, { tipo: 'config', entidade: 'acao', entidadeId: String(atual.valor), valorAnterior: atual, valorNovo: corpo });
  res.json(atualizada);
}));

/* -------------------------------- regras ------------------------------ */

rotasConfiguracao.get('/regras', exigirPerfil('admin'), rota(async (_req, res) => {
  const { regras } = await carregarContexto();
  res.json({ itens: regras });
}));

rotasConfiguracao.post('/regras', exigirPerfil('admin'), rota(async (req, res) => {
  const processo = await processoAtivo();
  const corpo = req.body ?? {};
  const operador = String(corpo.operador ?? 'preenchido');
  const severidade = String(corpo.severidade ?? 'atencao');
  if (!OPERADORES.includes(operador)) throw new ErroHttp(422, 'Operador inválido.');
  if (!SEVERIDADES.includes(severidade)) throw new ErroHttp(422, 'Severidade inválida.');
  if (!String(corpo.campo ?? '').trim()) throw new ErroHttp(422, 'Informe o campo observado pela regra.');
  if (!String(corpo.mensagem ?? '').trim()) throw new ErroHttp(422, 'Informe a mensagem do alerta.');

  const ordem = await consultarUm<{ ordem: string }>(
    'SELECT coalesce(MAX(ordem), 0)::text AS ordem FROM regras WHERE processo_id = $1', [processo.id],
  );
  const criada = await consultarUm(
    `INSERT INTO regras (processo_id, nome, campo, operador, valor, mensagem, severidade, aplica_acao, exige_justificativa, ordem)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
    [
      processo.id,
      String(corpo.nome ?? 'Alerta').slice(0, 120),
      String(corpo.campo),
      operador,
      corpo.valor ? String(corpo.valor) : null,
      String(corpo.mensagem).slice(0, 400),
      severidade,
      corpo.aplica_acao ? String(corpo.aplica_acao) : null,
      Boolean(corpo.exige_justificativa),
      Number(ordem?.ordem ?? 0) + 10,
    ],
  );
  await auditar(req, { tipo: 'config', entidade: 'regra', valorNovo: corpo.nome });
  res.status(201).json(criada);
}));

rotasConfiguracao.patch('/regras/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  const atual = await consultarUm<Record<string, unknown>>('SELECT * FROM regras WHERE id = $1', [id]);
  if (!atual) throw new ErroHttp(404, 'Regra não encontrada.');
  const corpo = req.body ?? {};
  const atualizada = await consultarUm(
    `UPDATE regras SET nome = $1, campo = $2, operador = $3, valor = $4, mensagem = $5, severidade = $6,
            aplica_acao = $7, exige_justificativa = $8, ativo = $9 WHERE id = $10 RETURNING *`,
    [
      corpo.nome !== undefined ? String(corpo.nome).slice(0, 120) : atual.nome,
      corpo.campo !== undefined ? String(corpo.campo) : atual.campo,
      corpo.operador !== undefined ? String(corpo.operador) : atual.operador,
      corpo.valor !== undefined ? (String(corpo.valor) || null) : atual.valor,
      corpo.mensagem !== undefined ? String(corpo.mensagem).slice(0, 400) : atual.mensagem,
      corpo.severidade !== undefined ? String(corpo.severidade) : atual.severidade,
      corpo.aplica_acao !== undefined ? (String(corpo.aplica_acao) || null) : atual.aplica_acao,
      corpo.exige_justificativa !== undefined ? Boolean(corpo.exige_justificativa) : atual.exige_justificativa,
      corpo.ativo !== undefined ? Boolean(corpo.ativo) : atual.ativo,
      id,
    ],
  );
  await auditar(req, { tipo: 'config', entidade: 'regra', entidadeId: id, valorAnterior: atual, valorNovo: corpo });
  res.json(atualizada);
}));

rotasConfiguracao.delete('/regras/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  await pool.query('UPDATE regras SET ativo = false WHERE id = $1', [id]);
  await auditar(req, { tipo: 'config', entidade: 'regra', entidadeId: id, valorNovo: 'desativada' });
  res.json({ ok: true });
}));

/* ---------------------------- estrutura org --------------------------- */

rotasConfiguracao.get('/estrutura', rota(async (req, res) => {
  const processo = await processoAtivo();
  const diretorias = await consultar(
    'SELECT id, nome, ativo FROM diretorias WHERE processo_id = $1 ORDER BY nome', [processo.id],
  );
  const divisoes = await consultar(
    `SELECT d.id, d.nome, d.ativo, d.diretoria_id, dir.nome AS diretoria_nome
       FROM divisoes d JOIN diretorias dir ON dir.id = d.diretoria_id
      WHERE dir.processo_id = $1 ORDER BY dir.nome, d.nome`,
    [processo.id],
  );
  const gestores = req.usuario?.perfil === 'admin'
    ? await consultar(
        `SELECT u.id, u.nome, u.usuario, array_remove(array_agg(ud.divisao_id), NULL) AS divisoes
           FROM usuarios u LEFT JOIN usuario_divisoes ud ON ud.usuario_id = u.id
          WHERE u.perfil = 'gestor' GROUP BY u.id, u.nome, u.usuario ORDER BY u.nome`,
      )
    : [];
  res.json({ diretorias, divisoes, gestores });
}));

rotasConfiguracao.post('/diretorias', exigirPerfil('admin'), rota(async (req, res) => {
  const processo = await processoAtivo();
  const nome = String(req.body?.nome ?? '').trim();
  if (!nome) throw new ErroHttp(422, 'Informe o nome da Diretoria.');
  const criada = await consultarUm(
    `INSERT INTO diretorias (processo_id, nome) VALUES ($1, $2)
     ON CONFLICT (processo_id, nome) DO NOTHING RETURNING *`,
    [processo.id, nome],
  );
  if (!criada) throw new ErroHttp(409, 'Já existe uma Diretoria com esse nome.');
  await auditar(req, { tipo: 'estrutura', entidade: 'diretoria', valorNovo: nome });
  res.status(201).json(criada);
}));

rotasConfiguracao.post('/divisoes', exigirPerfil('admin'), rota(async (req, res) => {
  const nome = String(req.body?.nome ?? '').trim();
  const diretoriaId = Number(req.body?.diretoria_id);
  if (!nome || !diretoriaId) throw new ErroHttp(422, 'Informe a Diretoria e o nome da Divisão.');
  const criada = await consultarUm(
    `INSERT INTO divisoes (diretoria_id, nome) VALUES ($1, $2)
     ON CONFLICT (diretoria_id, nome) DO NOTHING RETURNING *`,
    [diretoriaId, nome],
  );
  if (!criada) throw new ErroHttp(409, 'Já existe uma Divisão com esse nome nesta Diretoria.');
  await auditar(req, { tipo: 'estrutura', entidade: 'divisao', valorNovo: nome });
  res.status(201).json(criada);
}));

rotasConfiguracao.patch('/diretorias/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  const atual = await consultarUm<{ nome: string }>('SELECT nome FROM diretorias WHERE id = $1', [id]);
  if (!atual) throw new ErroHttp(404, 'Diretoria não encontrada.');
  const atualizada = await consultarUm(
    'UPDATE diretorias SET nome = coalesce($1, nome), ativo = coalesce($2, ativo) WHERE id = $3 RETURNING *',
    [req.body?.nome ? String(req.body.nome).trim() : null, req.body?.ativo ?? null, id],
  );
  await auditar(req, { tipo: 'estrutura', entidade: 'diretoria', entidadeId: id, valorAnterior: atual.nome, valorNovo: req.body });
  res.json(atualizada);
}));

rotasConfiguracao.patch('/divisoes/:id', exigirPerfil('admin'), rota(async (req, res) => {
  const id = Number(req.params.id);
  const atual = await consultarUm<{ nome: string }>('SELECT nome FROM divisoes WHERE id = $1', [id]);
  if (!atual) throw new ErroHttp(404, 'Divisão não encontrada.');
  const atualizada = await consultarUm(
    'UPDATE divisoes SET nome = coalesce($1, nome), ativo = coalesce($2, ativo) WHERE id = $3 RETURNING *',
    [req.body?.nome ? String(req.body.nome).trim() : null, req.body?.ativo ?? null, id],
  );
  await auditar(req, { tipo: 'estrutura', entidade: 'divisao', entidadeId: id, valorAnterior: atual.nome, valorNovo: req.body });
  res.json(atualizada);
}));
