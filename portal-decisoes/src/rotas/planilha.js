'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const config = require('../config');
const { obter } = require('../db');
const { agora, chaveDeRotulo, ErroHttp, rota } = require('../util');
const { exigirPerfil, filtroEscopo } = require('../auth');
const modelo = require('../modelo');
const planilha = require('../planilha');
const { calcular } = require('./resumo');

const router = express.Router();
const PASTA_TEMP = path.join(path.dirname(config.bancoCaminho), 'uploads');
fs.mkdirSync(PASTA_TEMP, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: 1 },
  fileFilter: (req, arquivo, cb) => {
    if (/\.(xlsx|xlsm)$/i.test(arquivo.originalname)) return cb(null, true);
    cb(new ErroHttp(422, 'Envie um arquivo .xlsx (Excel). Converta antes, se necessário.'));
  },
});

/** Remove uploads temporários com mais de 2 horas. */
function limparTemporarios() {
  const limite = Date.now() - 2 * 3600 * 1000;
  for (const nome of fs.readdirSync(PASTA_TEMP)) {
    const alvo = path.join(PASTA_TEMP, nome);
    try {
      if (fs.statSync(alvo).mtimeMs < limite) fs.unlinkSync(alvo);
    } catch { /* arquivo já removido */ }
  }
}

function caminhoToken(token) {
  if (!/^[a-f0-9]{32}$/.test(String(token || ''))) throw new ErroHttp(400, 'Envio inválido ou expirado.');
  const alvo = path.join(PASTA_TEMP, `${token}.xlsx`);
  if (!fs.existsSync(alvo)) throw new ErroHttp(410, 'Arquivo expirado. Envie a planilha novamente.');
  return alvo;
}

router.post('/analisar', exigirPerfil('admin'), upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) throw new ErroHttp(400, 'Selecione o arquivo da planilha.');
  limparTemporarios();
  const analise = await planilha.analisar(req.file.buffer, {
    aba: req.body?.aba,
    linhaCabecalho: req.body?.linha_cabecalho,
  });
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(PASTA_TEMP, `${token}.xlsx`), req.file.buffer);
  res.json({
    token,
    arquivo: req.file.originalname,
    ...analise,
    mapeamento_sugerido: planilha.sugerirMapeamento(analise.cabecalhos, modelo.listarColunas(obter())),
    colunas: modelo.listarColunas(obter()).map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo })),
  });
}));

router.post('/importar', exigirPerfil('admin'), rota(async (req, res) => {
  const db = obter();
  const corpo = req.body || {};
  const arquivo = caminhoToken(corpo.token);
  const mapeamento = { ...(corpo.mapeamento || {}) };
  const novas = [];

  // Cabeçalhos marcados como "__nova__" viram colunas do portal antes da carga.
  if (corpo.criar_colunas !== false) {
    const cabecalhos = corpo.cabecalhos || {};
    for (const [indice, destino] of Object.entries(mapeamento)) {
      if (destino !== '__nova__') continue;
      const rotulo = String(cabecalhos[indice] || `Coluna ${indice}`).trim();
      let chave = chaveDeRotulo(rotulo);
      let i = 2;
      while (db.prepare('SELECT 1 FROM colunas WHERE chave = ?').get(chave)) chave = `${chaveDeRotulo(rotulo)}_${i++}`;
      const ordem = (db.prepare('SELECT COALESCE(MAX(ordem), 0) AS m FROM colunas').get().m || 0) + 10;
      db.prepare(`
        INSERT INTO colunas (chave, rotulo, tipo, sistema, editavel, visivel, ordem, criado_em)
        VALUES (?, ?, 'texto', 0, 'admin', 1, ?, ?)
      `).run(chave, rotulo, ordem, agora());
      mapeamento[indice] = chave;
      novas.push({ chave, rotulo });
    }
  } else {
    for (const [indice, destino] of Object.entries(mapeamento)) {
      if (destino === '__nova__') delete mapeamento[indice];
    }
  }

  const resultado = await planilha.importar(db, req.usuario, fs.readFileSync(arquivo), {
    aba: corpo.aba,
    linhaCabecalho: corpo.linha_cabecalho,
    mapeamento,
    importarDecisoes: corpo.importar_decisoes === true,
    arquivo: corpo.arquivo,
  });
  try { fs.unlinkSync(arquivo); } catch { /* já removido */ }

  res.json({ ...resultado, colunas_novas: novas });
}));

/** Exportação respeita o escopo: gestor leva apenas a sua divisão. */
router.get('/exportar', rota(async (req, res) => {
  const db = obter();
  const colunas = modelo.listarColunas(db);
  const where = ['c.ativo = 1'];
  const params = [];
  const escopo = filtroEscopo(req.usuario);
  if (escopo.sql) { where.push(escopo.sql.replace(/^ AND /, '')); params.push(...escopo.params); }
  if (req.query.escopo) { where.push('c.escopo = ?'); params.push(String(req.query.escopo)); }

  const linhas = db.prepare(`
    SELECT c.*, u.nome AS decidido_por_nome FROM colaboradores c
      LEFT JOIN usuarios u ON u.id = c.decidido_por
     WHERE ${where.join(' AND ')} ORDER BY c.escopo, c.nome COLLATE NOCASE
  `).all(...params);

  const wb = await planilha.exportar(db, req.usuario, {
    itens: linhas.map((l) => modelo.montarLinha(l, colunas)),
    resumo: calcular(req.usuario, req.query.escopo ? String(req.query.escopo) : null),
    apenasVisiveis: req.usuario.perfil !== 'admin',
  });

  const nome = `decisoes-reestruturacao-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  await wb.xlsx.write(res);
  res.end();
}));

module.exports = router;
