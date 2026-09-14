'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-teste-'));
process.env.DB_PATH = path.join(pasta, 'teste.db');

const ExcelJS = require('exceljs');
const { iniciar } = require('../server');
const { obter } = require('../src/db');
const auth = require('../src/auth');
const { agora } = require('../src/util');

let base;
let servidor;

function criarUsuario(usuario, nome, perfil, senha, escopos = []) {
  const db = obter();
  const info = db.prepare(`
    INSERT INTO usuarios (usuario, nome, senha_hash, perfil, ativo, trocar_senha, criado_em)
    VALUES (?, ?, ?, ?, 1, 0, ?)
  `).run(usuario, nome, auth.gerarHash(senha), perfil, agora());
  for (const e of escopos) {
    db.prepare('INSERT INTO usuario_escopos (usuario_id, valor) VALUES (?, ?)').run(info.lastInsertRowid, e);
  }
}

function criarColaborador(matricula, nome, divisao, extras = {}) {
  const db = obter();
  const dados = { matricula, nome, divisao, diretoria: 'Diretoria X', cargo: 'Analista', situacao: 'Ativo', ...extras };
  db.prepare(`
    INSERT INTO colaboradores (matricula, nome, escopo, dados, criado_em, atualizado_em)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(matricula, nome, divisao, JSON.stringify(dados), agora(), agora());
}

async function chamar(metodo, caminho, { corpo, cookie, formData } = {}) {
  const headers = { 'x-portal': '1' };
  if (cookie) headers.cookie = cookie;
  let body;
  if (formData) body = formData;
  else if (corpo !== undefined) { headers['content-type'] = 'application/json'; body = JSON.stringify(corpo); }
  const resposta = await fetch(base + caminho, { method: metodo, headers, body });
  const bruto = await resposta.arrayBuffer();
  const tipo = resposta.headers.get('content-type') || '';
  return {
    status: resposta.status,
    cookie: resposta.headers.get('set-cookie'),
    buffer: Buffer.from(bruto),
    corpo: tipo.includes('json') ? JSON.parse(Buffer.from(bruto).toString('utf8') || '{}') : null,
  };
}

async function entrar(usuario, senha) {
  const r = await chamar('POST', '/api/auth/login', { corpo: { usuario, senha } });
  assert.equal(r.status, 200, `login de ${usuario} falhou: ${JSON.stringify(r.corpo)}`);
  return r.cookie.split(';')[0];
}

test.before(async () => {
  servidor = iniciar();
  await new Promise((r) => servidor.once('listening', r));
  base = `http://127.0.0.1:${servidor.address().port}`;

  criarUsuario('rh', 'RH Teste', 'admin', 'Senha123456');
  criarUsuario('dir', 'Diretor Teste', 'diretor', 'Senha123456');
  criarUsuario('gestor1', 'Gestor Um', 'gestor', 'Senha123456', ['Divisão A']);
  criarUsuario('gestor2', 'Gestor Dois', 'gestor', 'Senha123456', ['Divisão B']);

  criarColaborador('1001', 'Alice', 'Divisão A');
  criarColaborador('1002', 'Bruno', 'Divisão A', { estabilidade: 'CIPA', estabilidade_ate: '2027-01-31' });
  criarColaborador('1003', 'Carla', 'Divisão B');
  criarColaborador('1004', 'Davi', 'Divisão B', { situacao: 'Desligado' });
});

test.after(() => {
  servidor.close();
  fs.rmSync(pasta, { recursive: true, force: true });
});

test('exige cabeçalho do portal nas requisições que alteram dados', async () => {
  const resposta = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuario: 'rh', senha: 'Senha123456' }),
  });
  assert.equal(resposta.status, 403);
});

test('rejeita senha inválida e aceita a correta', async () => {
  const ruim = await chamar('POST', '/api/auth/login', { corpo: { usuario: 'rh', senha: 'errada' } });
  assert.equal(ruim.status, 401);
  const bom = await chamar('POST', '/api/auth/login', { corpo: { usuario: 'rh', senha: 'Senha123456' } });
  assert.equal(bom.status, 200);
  assert.equal(bom.corpo.usuario.perfil, 'admin');
});

test('sem sessão o acesso à base é negado', async () => {
  const r = await chamar('GET', '/api/colaboradores');
  assert.equal(r.status, 401);
});

test('gestor enxerga apenas a própria divisão', async () => {
  const cookie = await entrar('gestor1', 'Senha123456');
  const r = await chamar('GET', '/api/colaboradores', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.total, 2);
  assert.deepEqual(r.corpo.itens.map((i) => i.nome).sort(), ['Alice', 'Bruno']);
});

test('gestor não altera colaborador de outra divisão', async () => {
  const cookie = await entrar('gestor1', 'Senha123456');
  const db = obter();
  const alvo = db.prepare("SELECT id FROM colaboradores WHERE matricula = '1003'").get();
  const r = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie, corpo: { acao: 'Desligamento' } });
  assert.equal(r.status, 403);
});

test('transferência exige justificativa', async () => {
  const cookie = await entrar('gestor1', 'Senha123456');
  const db = obter();
  const alvo = db.prepare("SELECT id FROM colaboradores WHERE matricula = '1001'").get();
  const semJust = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie, corpo: { acao: 'Transferência de área' } });
  assert.equal(semJust.status, 422);
  const comJust = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, {
    cookie, corpo: { acao: 'Transferência de área', justificativa: 'Vaga na Diretoria Comercial.' },
  });
  assert.equal(comJust.status, 200);
  assert.equal(comJust.corpo.acao, 'Transferência de área');
  assert.equal(comJust.corpo.status, 'preenchido');
});

test('desligamento com estabilidade vigente exige justificativa e gera alerta', async () => {
  const cookie = await entrar('gestor1', 'Senha123456');
  const db = obter();
  const alvo = db.prepare("SELECT id FROM colaboradores WHERE matricula = '1002'").get();
  const sem = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie, corpo: { acao: 'Desligamento' } });
  assert.equal(sem.status, 422);
  assert.match(sem.corpo.erro, /estabilidade/i);

  const com = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, {
    cookie, corpo: { acao: 'Desligamento', justificativa: 'Desligamento após o término da estabilidade em 31/01/2027.' },
  });
  assert.equal(com.status, 200);
  assert.ok(com.corpo.alertas.some((a) => a.tipo === 'bloqueio'));
});

test('colaborador desligado na posição base não recebe decisão do gestor', async () => {
  const cookie = await entrar('gestor2', 'Senha123456');
  const db = obter();
  const alvo = db.prepare("SELECT id FROM colaboradores WHERE matricula = '1004'").get();
  const r = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie, corpo: { acao: 'Desligamento' } });
  assert.equal(r.status, 409);
});

test('diretor homologa e o gestor deixa de alterar', async () => {
  const db = obter();
  const alvo = db.prepare("SELECT id FROM colaboradores WHERE matricula = '1001'").get();
  const cookieDiretor = await entrar('dir', 'Senha123456');
  const homologado = await chamar('POST', '/api/colaboradores/homologar', { cookie: cookieDiretor, corpo: { ids: [alvo.id] } });
  assert.equal(homologado.status, 200);
  assert.equal(homologado.corpo.itens[0].status, 'homologado');

  const cookieGestor = await entrar('gestor1', 'Senha123456');
  const tentativa = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie: cookieGestor, corpo: { acao: 'Manter' } });
  assert.equal(tentativa.status, 409);
});

test('gestor não acessa administração de usuários nem colunas', async () => {
  const cookie = await entrar('gestor1', 'Senha123456');
  assert.equal((await chamar('GET', '/api/usuarios', { cookie })).status, 403);
  assert.equal((await chamar('POST', '/api/colunas', { cookie, corpo: { rotulo: 'X' } })).status, 403);
});

test('resumo do gestor cobre apenas a sua divisão', async () => {
  const cookie = await entrar('gestor1', 'Senha123456');
  const r = await chamar('GET', '/api/resumo', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.totais.total, 2);
  assert.equal(r.corpo.por_escopo.length, 1);
  assert.equal(r.corpo.por_escopo[0].escopo, 'Divisão A');
});

test('RH cria coluna personalizada e o gestor a preenche', async () => {
  const cookieRh = await entrar('rh', 'Senha123456');
  const criada = await chamar('POST', '/api/colunas', {
    cookie: cookieRh,
    corpo: { rotulo: 'Avaliação de desempenho', tipo: 'lista', editavel: 'gestor', opcoes: ['Abaixo', 'Dentro', 'Acima'] },
  });
  assert.equal(criada.status, 201);
  assert.equal(criada.corpo.chave, 'avaliacao_de_desempenho');

  const cookieGestor = await entrar('gestor1', 'Senha123456');
  const db = obter();
  const alvo = db.prepare("SELECT id FROM colaboradores WHERE matricula = '1002'").get();
  const invalido = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie: cookieGestor, corpo: { avaliacao_de_desempenho: 'Excelente' } });
  assert.equal(invalido.status, 422);
  const valido = await chamar('PATCH', `/api/colaboradores/${alvo.id}`, { cookie: cookieGestor, corpo: { avaliacao_de_desempenho: 'Acima' } });
  assert.equal(valido.status, 200);
  assert.equal(valido.corpo.dados.avaliacao_de_desempenho, 'Acima');
});

test('importa planilha por matrícula sem apagar decisões já registradas', async () => {
  const cookie = await entrar('rh', 'Senha123456');
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('2. Base Decisões');
  ws.addRow(['Matrícula', 'Nome', 'Divisão', 'Cargo', 'Custo mensal', 'Situação']);
  ws.addRow(['1001', 'Alice Souza', 'Divisão A', 'Analista Sênior', 'R$ 8.500,00', 'Ativo']);
  ws.addRow(['2001', 'Elena', 'Divisão B', 'Coordenadora', 12000, 'Ativo']);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());

  const form = new FormData();
  form.append('arquivo', new Blob([buffer]), 'base.xlsx');
  const analise = await chamar('POST', '/api/planilha/analisar', { cookie, formData: form });
  assert.equal(analise.status, 200);
  assert.equal(analise.corpo.linha_cabecalho, 1);
  assert.equal(analise.corpo.mapeamento_sugerido['1'], 'matricula');
  assert.equal(analise.corpo.mapeamento_sugerido['5'], 'custo_mensal');

  const importado = await chamar('POST', '/api/planilha/importar', {
    cookie,
    corpo: {
      token: analise.corpo.token,
      aba: analise.corpo.aba,
      linha_cabecalho: 1,
      mapeamento: analise.corpo.mapeamento_sugerido,
    },
  });
  assert.equal(importado.status, 200);
  assert.equal(importado.corpo.criados, 1);
  assert.equal(importado.corpo.atualizados, 1);
  assert.equal(importado.corpo.ignorados, 0);

  const db = obter();
  const alice = db.prepare("SELECT * FROM colaboradores WHERE matricula = '1001'").get();
  assert.equal(alice.nome, 'Alice Souza');
  assert.equal(alice.acao, 'Transferência de área', 'a decisão anterior deve ser preservada');
  assert.equal(JSON.parse(alice.dados).custo_mensal, 8500);
});

test('exportação gera as duas abas com lista suspensa na ação', async () => {
  const cookie = await entrar('dir', 'Senha123456');
  const r = await chamar('GET', '/api/planilha/exportar', { cookie });
  assert.equal(r.status, 200);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buffer);
  assert.deepEqual(wb.worksheets.map((w) => w.name), ['1. Resumo', '2. Base Decisões']);
  const base2 = wb.getWorksheet('2. Base Decisões');
  const cabecalhos = base2.getRow(1).values.filter(Boolean).map(String);
  assert.ok(cabecalhos.includes('Ação Indicada'));
  assert.ok(cabecalhos.includes('Justificativa'));
  const coluna = cabecalhos.indexOf('Ação Indicada') + 1;
  const validacao = base2.getRow(2).getCell(coluna).dataValidation;
  assert.equal(validacao.type, 'list');
  assert.match(validacao.formulae[0], /Desligamento/);
});

test('exportação do gestor traz apenas a sua divisão', async () => {
  const cookie = await entrar('gestor2', 'Senha123456');
  const r = await chamar('GET', '/api/planilha/exportar', { cookie });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buffer);
  const ws = wb.getWorksheet('2. Base Decisões');
  const divisoes = new Set();
  ws.eachRow((linha, n) => { if (n > 1) divisoes.add(String(linha.getCell(4).value || '')); });
  assert.ok(!divisoes.has('Divisão A'), 'gestor não pode exportar outra divisão');
});

test('histórico registra autor e valores da decisão', async () => {
  const cookie = await entrar('rh', 'Senha123456');
  const r = await chamar('GET', '/api/historico?matricula=1002', { cookie });
  assert.equal(r.status, 200);
  const decisao = r.corpo.itens.find((h) => h.campo === 'acao');
  assert.ok(decisao, 'deve haver registro da ação');
  assert.equal(decisao.valor_novo, 'Desligamento');
  assert.equal(decisao.usuario_nome, 'Gestor Um');
});

test('bloqueia login após tentativas seguidas com senha errada', async () => {
  for (let i = 0; i < 5; i++) await chamar('POST', '/api/auth/login', { corpo: { usuario: 'gestor2', senha: 'x' } });
  const r = await chamar('POST', '/api/auth/login', { corpo: { usuario: 'gestor2', senha: 'Senha123456' } });
  assert.equal(r.status, 429);
});
