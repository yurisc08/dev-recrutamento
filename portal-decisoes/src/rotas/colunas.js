'use strict';
const express = require('express');
const { obter, lerConfig } = require('../db');
const { agora, chaveDeRotulo, converterParaTipo, ErroHttp, rota } = require('../util');
const { exigirPerfil } = require('../auth');
const modelo = require('../modelo');

const router = express.Router();
const TIPOS = ['texto', 'numero', 'moeda', 'data', 'lista', 'booleano'];
const EDITAVEIS = ['nao', 'gestor', 'diretor', 'admin'];

router.get('/', rota((req, res) => {
  const db = obter();
  const colunas = modelo.listarColunas(db, { incluirOcultas: req.usuario.perfil === 'admin' });
  res.json({ itens: colunas.map((c) => ({ ...c, editavel_por_mim: modelo.podeEditarColuna(req.usuario, c) })) });
}));

router.use(exigirPerfil('admin'));

function chaveUnica(db, rotulo) {
  const base = chaveDeRotulo(rotulo);
  let chave = base;
  let i = 2;
  while (db.prepare('SELECT 1 FROM colunas WHERE chave = ?').get(chave)) chave = `${base}_${i++}`;
  return chave;
}

function normalizarEntrada(corpo) {
  const tipo = String(corpo.tipo || 'texto');
  if (!TIPOS.includes(tipo)) throw new ErroHttp(422, `Tipo inválido. Use: ${TIPOS.join(', ')}.`);
  const editavel = String(corpo.editavel || 'nao');
  if (!EDITAVEIS.includes(editavel)) throw new ErroHttp(422, 'Permissão de edição inválida.');
  let opcoes = null;
  if (tipo === 'lista') {
    opcoes = (Array.isArray(corpo.opcoes) ? corpo.opcoes : String(corpo.opcoes || '').split('\n'))
      .map((o) => String(o).trim())
      .filter(Boolean);
    if (opcoes.length === 0) throw new ErroHttp(422, 'Informe ao menos uma opção para a coluna de lista.');
  }
  return { tipo, editavel, opcoes };
}

router.post('/', rota((req, res) => {
  const db = obter();
  const corpo = req.body || {};
  const rotulo = String(corpo.rotulo || '').trim();
  if (!rotulo) throw new ErroHttp(422, 'Informe o nome da coluna.');
  const { tipo, editavel, opcoes } = normalizarEntrada(corpo);
  const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM colunas').get().m || 0) + 10;
  const chave = chaveUnica(db, rotulo);
  const info = db.prepare(`
    INSERT INTO colunas (chave, rotulo, tipo, opcoes, sistema, editavel, visivel, fixada, somar, agrupar, ordem, ajuda, criado_em)
    VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?)
  `).run(
    chave, rotulo, tipo, opcoes ? JSON.stringify(opcoes) : null, editavel,
    corpo.visivel === false ? 0 : 1, corpo.somar ? 1 : 0, corpo.agrupar ? 1 : 0, ordem,
    corpo.ajuda ? String(corpo.ajuda).slice(0, 500) : null, agora()
  );
  res.status(201).json(modelo.listarColunas(db).find((c) => c.id === Number(info.lastInsertRowid)));
}));

router.patch('/:id(\\d+)', rota((req, res) => {
  const db = obter();
  const id = Number(req.params.id);
  const atual = modelo.listarColunas(db).find((c) => c.id === id);
  if (!atual) throw new ErroHttp(404, 'Coluna não encontrada.');
  const corpo = req.body || {};

  const rotulo = corpo.rotulo !== undefined ? String(corpo.rotulo).trim() : atual.rotulo;
  if (!rotulo) throw new ErroHttp(422, 'O nome da coluna não pode ficar vazio.');
  const tipo = corpo.tipo !== undefined && !atual.sistema ? String(corpo.tipo) : atual.tipo;
  if (!TIPOS.includes(tipo)) throw new ErroHttp(422, 'Tipo inválido.');
  const editavel = corpo.editavel !== undefined ? String(corpo.editavel) : atual.editavel;
  if (!EDITAVEIS.includes(editavel)) throw new ErroHttp(422, 'Permissão de edição inválida.');

  let opcoes = atual.opcoes;
  if (corpo.opcoes !== undefined || tipo !== atual.tipo) {
    if (tipo === 'lista') {
      const lista = (Array.isArray(corpo.opcoes) ? corpo.opcoes : String(corpo.opcoes || '').split('\n'))
        .map((o) => String(o).trim())
        .filter(Boolean);
      if (lista.length === 0) throw new ErroHttp(422, 'Informe ao menos uma opção para a coluna de lista.');
      opcoes = lista;
    } else {
      opcoes = null;
    }
  }

  // Mudança de tipo/opções: revalida os valores já gravados antes de aplicar.
  if (tipo !== atual.tipo || JSON.stringify(opcoes) !== JSON.stringify(atual.opcoes)) {
    const definicao = { ...atual, tipo, opcoes };
    const linhas = db.prepare(
      `SELECT id, matricula, json_extract(dados, '$.${atual.chave}') AS v FROM colaboradores WHERE ativo = 1`
    ).all();
    const problemas = [];
    const converter = [];
    for (const l of linhas) {
      if (l.v === null || l.v === undefined || l.v === '') continue;
      const { valor, erro } = converterParaTipo(l.v, definicao);
      if (erro) problemas.push({ matricula: l.matricula, valor: l.v });
      else converter.push([l.id, valor]);
    }
    if (problemas.length > 0 && corpo.forcar !== true) {
      throw new ErroHttp(422, `${problemas.length} registro(s) não podem ser convertidos para o novo formato.`, {
        exemplos: problemas.slice(0, 5),
        dica: 'Envie "forcar": true para limpar esses valores, ou ajuste os dados antes.',
      });
    }
    const aplicar = db.transaction(() => {
      const upd = db.prepare(`UPDATE colaboradores SET dados = json_set(dados, '$.${atual.chave}', ?) WHERE id = ?`);
      for (const [idLinha, valor] of converter) upd.run(valor, idLinha);
      if (corpo.forcar === true) {
        const limpar = db.prepare(`UPDATE colaboradores SET dados = json_remove(dados, '$.${atual.chave}') WHERE matricula = ?`);
        for (const p of problemas) limpar.run(p.matricula);
      }
    });
    aplicar();
  }

  db.prepare(`
    UPDATE colunas SET rotulo = ?, tipo = ?, opcoes = ?, editavel = ?, visivel = ?, somar = ?, agrupar = ?, ajuda = ?, ordem = ?
     WHERE id = ?
  `).run(
    rotulo, tipo, opcoes ? JSON.stringify(opcoes) : null, editavel,
    corpo.visivel === undefined ? (atual.visivel ? 1 : 0) : corpo.visivel ? 1 : 0,
    corpo.somar === undefined ? (atual.somar ? 1 : 0) : corpo.somar ? 1 : 0,
    corpo.agrupar === undefined ? (atual.agrupar ? 1 : 0) : corpo.agrupar ? 1 : 0,
    corpo.ajuda === undefined ? atual.ajuda : String(corpo.ajuda || '').slice(0, 500) || null,
    corpo.ordem === undefined ? atual.ordem : Number(corpo.ordem),
    id
  );
  res.json(modelo.listarColunas(db).find((c) => c.id === id));
}));

router.post('/ordem', rota((req, res) => {
  const db = obter();
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number) : [];
  const aplicar = db.transaction(() => {
    ids.forEach((id, i) => db.prepare('UPDATE colunas SET ordem = ? WHERE id = ?').run((i + 1) * 10, id));
  });
  aplicar();
  res.json({ itens: modelo.listarColunas(db) });
}));

router.delete('/:id(\\d+)', rota((req, res) => {
  const db = obter();
  const cfg = lerConfig(db);
  const coluna = modelo.listarColunas(db).find((c) => c.id === Number(req.params.id));
  if (!coluna) throw new ErroHttp(404, 'Coluna não encontrada.');
  if (coluna.sistema) throw new ErroHttp(409, 'Colunas do sistema não podem ser excluídas — oculte-a se não quiser exibi-la.');
  if (coluna.chave === cfg.coluna_escopo) throw new ErroHttp(409, 'Esta coluna define a divisão usada no controle de acesso.');
  const remover = db.transaction(() => {
    db.prepare(`UPDATE colaboradores SET dados = json_remove(dados, '$.${coluna.chave}')`).run();
    db.prepare('DELETE FROM colunas WHERE id = ?').run(coluna.id);
  });
  remover();
  res.json({ ok: true });
}));

module.exports = router;
