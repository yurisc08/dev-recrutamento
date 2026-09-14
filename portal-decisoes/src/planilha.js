'use strict';
const ExcelJS = require('exceljs');
const { normalizar, formatarBR, converterParaTipo, agora, ErroHttp } = require('./util');
const { lerConfig } = require('./db');
const modelo = require('./modelo');

const AZUL = 'FF1C5CAB';
const CINZA = 'FFF0EFEC';
const VERDE = 'FFDDF3E8';

/** Lê a planilha e devolve abas, cabeçalhos e prévia — sem gravar nada. */
async function analisar(buffer, { aba, linhaCabecalho } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const abas = wb.worksheets.map((ws) => ({ nome: ws.name, linhas: ws.rowCount }));
  if (abas.length === 0) throw new ErroHttp(422, 'A planilha não contém abas legíveis.');

  const escolhida =
    (aba && wb.getWorksheet(aba)) ||
    wb.worksheets.find((ws) => normalizar(ws.name).includes('base')) ||
    wb.worksheets.reduce((a, b) => (a.rowCount >= b.rowCount ? a : b));

  const linhaCab = Number(linhaCabecalho) || detectarCabecalho(escolhida);
  const cabecalhos = lerLinha(escolhida, linhaCab).map((v, i) => ({
    indice: i + 1,
    rotulo: String(v ?? '').trim(),
  }));

  const previa = [];
  for (let n = linhaCab + 1; n <= Math.min(escolhida.rowCount, linhaCab + 10); n++) {
    const valores = lerLinha(escolhida, n);
    if (valores.every((v) => v === null || v === '')) continue;
    previa.push(valores.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)));
  }

  return {
    abas,
    aba: escolhida.name,
    linha_cabecalho: linhaCab,
    total_linhas: Math.max(escolhida.rowCount - linhaCab, 0),
    cabecalhos,
    previa,
  };
}

function lerLinha(ws, n) {
  const row = ws.getRow(n);
  const largura = Math.max(ws.columnCount, row.cellCount);
  const valores = [];
  for (let c = 1; c <= largura; c++) valores.push(valorCelula(row.getCell(c)));
  return valores;
}

function valorCelula(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (typeof v === 'object') {
    if (v instanceof Date) return v;
    if (v.text !== undefined) return v.text;
    if (v.result !== undefined) return v.result;
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.hyperlink) return v.text || v.hyperlink;
    return null;
  }
  return v;
}

/** Primeira linha com 3+ células preenchidas — cobre planilhas com título/logo no topo. */
function detectarCabecalho(ws) {
  for (let n = 1; n <= Math.min(ws.rowCount, 15); n++) {
    const preenchidas = lerLinha(ws, n).filter((v) => v !== null && String(v).trim() !== '').length;
    if (preenchidas >= 3) return n;
  }
  return 1;
}

/** Sugere o destino de cada cabeçalho comparando com rótulo e chave das colunas cadastradas. */
function sugerirMapeamento(cabecalhos, colunas) {
  const porNome = new Map();
  for (const c of colunas) {
    porNome.set(normalizar(c.rotulo), c.chave);
    porNome.set(normalizar(c.chave), c.chave);
  }
  const apelidos = {
    matricula: ['matricula', 'chapa', 'registro', 'cod colaborador', 'codigo'],
    nome: ['nome', 'nome completo', 'colaborador', 'funcionario'],
    divisao: ['divisao', 'divisao/area', 'unidade'],
    diretoria: ['diretoria', 'diretoria responsavel'],
    area: ['area', 'setor', 'departamento'],
    cargo: ['cargo', 'funcao', 'posicao'],
    gestor_imediato: ['gestor', 'gestor imediato', 'lideranca', 'responsavel'],
    data_admissao: ['data admissao', 'admissao', 'data de admissao'],
    custo_mensal: ['custo', 'custo mensal', 'salario', 'remuneracao', 'custo total'],
    situacao: ['situacao', 'status', 'situacao atual'],
    estabilidade: ['estabilidade', 'estabilidade/afastamento', 'afastamento'],
    estabilidade_ate: ['estabilidade ate', 'vigencia estabilidade', 'fim estabilidade', 'data fim estabilidade'],
    acao: ['acao indicada', 'acao', 'decisao', 'indicacao'],
    justificativa: ['justificativa', 'observacao decisao', 'motivo'],
  };
  for (const [chave, lista] of Object.entries(apelidos)) {
    for (const apelido of lista) if (!porNome.has(apelido)) porNome.set(apelido, chave);
  }
  const mapa = {};
  for (const cab of cabecalhos) {
    if (!cab.rotulo) continue;
    mapa[cab.indice] = porNome.get(normalizar(cab.rotulo)) || null;
  }
  return mapa;
}

/**
 * Aplica a importação. Decisões (ação/justificativa) só são tocadas com importarDecisoes = true.
 * Devolve o resumo com erros por linha, sem abortar o lote inteiro.
 */
async function importar(db, usuario, buffer, opcoes) {
  const cfg = lerConfig(db);
  const colunas = modelo.listarColunas(db);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet(opcoes.aba) || wb.worksheets[0];
  if (!ws) throw new ErroHttp(422, 'Aba não encontrada na planilha.');

  const linhaCab = Number(opcoes.linhaCabecalho) || detectarCabecalho(ws);
  const mapeamento = opcoes.mapeamento || {};
  const destinos = Object.entries(mapeamento)
    .map(([indice, chave]) => ({ indice: Number(indice), chave }))
    .filter((d) => d.chave);

  const colunaMatricula = destinos.find((d) => d.chave === 'matricula');
  if (!colunaMatricula) throw new ErroHttp(422, 'Indique qual coluna da planilha contém a matrícula.');

  const porChave = new Map(colunas.map((c) => [c.chave, c]));
  const decisoesPermitidas = opcoes.importarDecisoes === true;
  const acoesValidas = cfg.acoes.map((a) => a.valor);

  const resultado = { linhas: 0, criados: 0, atualizados: 0, ignorados: 0, erros: [], colunas_novas: [] };

  const transacao = db.transaction(() => {
    for (let n = linhaCab + 1; n <= ws.rowCount; n++) {
      const valores = lerLinha(ws, n);
      if (valores.every((v) => v === null || String(v).trim() === '')) continue;
      resultado.linhas++;

      const matricula = String(valores[colunaMatricula.indice - 1] ?? '').trim();
      if (!matricula) {
        resultado.ignorados++;
        resultado.erros.push({ linha: n, erro: 'Linha sem matrícula.' });
        continue;
      }

      const existente = db.prepare('SELECT * FROM colaboradores WHERE matricula = ?').get(matricula);
      const dados = existente ? JSON.parse(existente.dados || '{}') : {};
      const antes = { ...dados };
      let acao = existente?.acao ?? null;
      let justificativa = existente?.justificativa ?? null;
      let erroLinha = null;

      for (const destino of destinos) {
        const bruto = valores[destino.indice - 1];
        if (destino.chave === 'acao' || destino.chave === 'justificativa') {
          if (!decisoesPermitidas) continue;
          const texto = bruto === null || bruto === undefined ? '' : String(bruto).trim();
          if (destino.chave === 'acao') {
            if (texto === '') { acao = null; continue; }
            const achado = acoesValidas.find((a) => normalizar(a) === normalizar(texto));
            if (!achado) { erroLinha = `Ação "${texto}" não é uma opção válida.`; break; }
            acao = achado;
          } else {
            justificativa = texto || null;
          }
          continue;
        }
        const coluna = porChave.get(destino.chave);
        if (!coluna) continue;
        const { valor, erro } = converterParaTipo(bruto, coluna);
        if (erro) { erroLinha = `Linha ${n}: ${erro}`; break; }
        dados[coluna.chave] = valor;
      }

      if (erroLinha) {
        resultado.ignorados++;
        resultado.erros.push({ linha: n, matricula, erro: erroLinha });
        continue;
      }

      dados.matricula = matricula;
      const escopo = dados[cfg.coluna_escopo] ?? existente?.escopo ?? null;
      const nome = dados.nome ?? existente?.nome ?? null;

      if (existente) {
        db.prepare(`
          UPDATE colaboradores SET nome = ?, escopo = ?, dados = ?, acao = ?, justificativa = ?, ativo = 1, atualizado_em = ?
           WHERE id = ?
        `).run(nome, escopo, JSON.stringify(dados), acao, justificativa, agora(), existente.id);
        for (const chave of new Set([...Object.keys(dados), ...Object.keys(antes)])) {
          modelo.registrarHistorico(db, {
            colaborador: existente, usuario, campo: chave,
            anterior: antes[chave], novo: dados[chave], origem: 'importacao',
          });
        }
        if (decisoesPermitidas) {
          modelo.registrarHistorico(db, {
            colaborador: existente, usuario, campo: 'acao',
            anterior: existente.acao, novo: acao, origem: 'importacao',
          });
        }
        resultado.atualizados++;
      } else {
        const info = db.prepare(`
          INSERT INTO colaboradores (matricula, nome, escopo, dados, acao, justificativa, criado_em, atualizado_em)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(matricula, nome, escopo, JSON.stringify(dados), acao, justificativa, agora(), agora());
        modelo.registrarHistorico(db, {
          colaborador: { id: info.lastInsertRowid, matricula }, usuario,
          campo: 'cadastro', anterior: null, novo: 'importado', origem: 'importacao',
        });
        resultado.criados++;
      }
    }

    db.prepare(`
      INSERT INTO importacoes (usuario_id, usuario_nome, arquivo, linhas, criados, atualizados, ignorados, resumo, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      usuario.id, usuario.nome, String(opcoes.arquivo || '').slice(0, 200),
      resultado.linhas, resultado.criados, resultado.atualizados, resultado.ignorados,
      JSON.stringify({ erros: resultado.erros.slice(0, 100), aba: ws.name, decisoes: decisoesPermitidas }),
      agora()
    );
  });
  transacao();
  return resultado;
}

/** Gera o arquivo de devolução ao RH: aba "1. Resumo" + aba "2. Base Decisões" com lista suspensa. */
async function exportar(db, usuario, { itens, resumo, apenasVisiveis = true }) {
  const cfg = lerConfig(db);
  const colunas = modelo.listarColunas(db).filter((c) => (apenasVisiveis ? c.visivel : true));
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Portal de Decisões';
  wb.created = new Date();

  const aba1 = wb.addWorksheet('1. Resumo');
  aba1.columns = [{ width: 42 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 18 }, { width: 20 }];
  titulo(aba1, 'A1:F1', cfg.titulo);
  aba1.addRow([]);
  aba1.addRow(['Posição base', cfg.posicao_base]);
  aba1.addRow(['Prazo de devolução', cfg.prazo]);
  aba1.addRow(['Gerado em', new Date().toLocaleString('pt-BR')]);
  aba1.addRow(['Gerado por', `${usuario.nome} (${usuario.perfil})`]);
  aba1.addRow([]);

  cabecalho(aba1, ['Indicador', 'Quantidade']);
  const t = resumo.totais;
  [
    ['Total de colaboradores na base', t.total],
    ['Desligados na posição base', t.desligados_base],
    ['Elegíveis a decisão', t.elegiveis],
    ['Decisões preenchidas', t.decididos],
    ['Pendentes de decisão', t.pendentes],
    ['Homologadas pela diretoria', t.homologados],
    ['Com estabilidade/afastamento vigente', t.com_estabilidade],
    ['Desligamentos indicados com estabilidade vigente', t.estabilidade_com_desligamento],
  ].forEach((linha) => aba1.addRow(linha));
  aba1.addRow([]);

  cabecalho(aba1, ['Ação indicada', 'Quantidade', '% dos elegíveis']);
  for (const a of resumo.acoes) {
    aba1.addRow([a.valor, a.total, t.elegiveis ? a.total / t.elegiveis : 0]).getCell(3).numFmt = '0.0%';
  }
  aba1.addRow([]);

  cabecalho(aba1, ['Divisão', 'Total', 'Pendentes', 'Desligamentos', 'Transferências', 'Manter']);
  for (const e of resumo.por_escopo) {
    aba1.addRow([e.escopo, e.total, e.pendentes, e.desligamentos, e.transferencias, e.manter]);
  }

  const aba2 = wb.addWorksheet('2. Base Decisões', { views: [{ state: 'frozen', ySplit: 1 }] });
  const colunasSaida = [
    { chave: 'matricula', rotulo: 'Matrícula', tipo: 'texto' },
    { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
    ...colunas.filter((c) => c.chave !== 'matricula' && c.chave !== 'nome'),
    { chave: '__acao__', rotulo: 'Ação Indicada', tipo: 'lista' },
    { chave: '__justificativa__', rotulo: 'Justificativa', tipo: 'texto' },
    { chave: '__status__', rotulo: 'Status', tipo: 'texto' },
    { chave: '__alerta__', rotulo: 'Alertas', tipo: 'texto' },
    { chave: '__decidido_por__', rotulo: 'Preenchido por', tipo: 'texto' },
    { chave: '__decidido_em__', rotulo: 'Preenchido em', tipo: 'texto' },
    { chave: '__homologado__', rotulo: 'Homologado', tipo: 'texto' },
  ];
  aba2.columns = colunasSaida.map((c) => ({
    header: c.rotulo,
    key: c.chave,
    width: c.chave === '__justificativa__' ? 50 : Math.min(Math.max(c.rotulo.length + 6, 14), 32),
  }));
  const linhaCab = aba2.getRow(1);
  linhaCab.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  linhaCab.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  linhaCab.alignment = { vertical: 'middle', wrapText: true };
  linhaCab.height = 28;

  const rotulosStatus = {
    desligado: 'Desligado na posição base',
    pendente: 'Pendente',
    preenchido: 'Preenchido',
    homologado: 'Homologado',
  };

  for (const item of itens) {
    const linha = {};
    for (const c of colunasSaida) {
      if (c.chave === '__acao__') linha[c.chave] = item.acao || '';
      else if (c.chave === '__justificativa__') linha[c.chave] = item.justificativa || '';
      else if (c.chave === '__status__') linha[c.chave] = rotulosStatus[item.status] || item.status;
      else if (c.chave === '__alerta__') linha[c.chave] = item.alertas.map((a) => a.texto).join(' ');
      else if (c.chave === '__decidido_por__') linha[c.chave] = item.decidido_por_nome || '';
      else if (c.chave === '__decidido_em__') linha[c.chave] = item.decidido_em ? new Date(item.decidido_em).toLocaleString('pt-BR') : '';
      else if (c.chave === '__homologado__') linha[c.chave] = item.homologado ? 'Sim' : 'Não';
      else if (c.chave === 'matricula') linha[c.chave] = item.matricula;
      else if (c.chave === 'nome') linha[c.chave] = item.nome || item.dados.nome || '';
      else {
        const valor = item.dados[c.chave];
        linha[c.chave] = c.tipo === 'moeda' || c.tipo === 'numero' ? (valor ?? null) : formatarBR(valor, c.tipo);
      }
    }
    aba2.addRow(linha);
  }

  const indiceAcao = colunasSaida.findIndex((c) => c.chave === '__acao__') + 1;
  const indiceJust = colunasSaida.findIndex((c) => c.chave === '__justificativa__') + 1;
  const ultima = Math.max(aba2.rowCount, 2);
  const lista = `"${cfg.acoes.map((a) => a.valor).join(',')}"`;
  for (let n = 2; n <= ultima; n++) {
    const celula = aba2.getRow(n).getCell(indiceAcao);
    celula.dataValidation = {
      type: 'list', allowBlank: true, formulae: [lista],
      showErrorMessage: true, errorTitle: 'Opção inválida',
      error: 'Escolha uma das opções da lista suspensa.',
    };
    celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    aba2.getRow(n).getCell(indiceJust).alignment = { wrapText: true, vertical: 'top' };
  }
  aba2.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: colunasSaida.length } };

  for (const c of colunasSaida) {
    if (c.tipo === 'moeda') aba2.getColumn(c.chave).numFmt = 'R$ #,##0.00';
  }

  return wb;
}

function titulo(ws, intervalo, texto) {
  ws.mergeCells(intervalo);
  const celula = ws.getCell(intervalo.split(':')[0]);
  celula.value = texto;
  celula.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  celula.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AZUL } };
  celula.alignment = { vertical: 'middle' };
  ws.getRow(1).height = 26;
}

function cabecalho(ws, valores) {
  const linha = ws.addRow(valores);
  linha.font = { bold: true };
  linha.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CINZA } };
  return linha;
}

module.exports = { analisar, importar, exportar, sugerirMapeamento, detectarCabecalho };
