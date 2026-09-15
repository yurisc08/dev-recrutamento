/**
 * Testes da versão local. Sobem o portal de verdade (processo separado, pasta de
 * dados temporária) e conversam com ele por HTTP, como o navegador faria.
 *
 *   node --test testes
 */
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = fileURLToPath(new URL('..', import.meta.url));
const PORTA = 8799;
const BASE = `http://127.0.0.1:${PORTA}`;

let processo;
let pastaDados;
let conviteInicial;

before(async () => {
  pastaDados = mkdtempSync(join(tmpdir(), 'portal-teste-'));
  processo = spawn(process.execPath, [join(RAIZ, 'servidor', 'index.mjs')], {
    env: { ...process.env, PORTAL_DADOS: pastaDados, PORTAL_PORTA: String(PORTA), PORTAL_HTTP: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  processo.stderr.on('data', (d) => { if (String(d).includes('Error')) console.error(String(d)); });

  for (let tentativa = 0; tentativa < 60; tentativa += 1) {
    try {
      const resposta = await fetch(`${BASE}/api/saude`);
      if (resposta.ok) break;
    } catch { /* ainda subindo */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  const texto = readFileSync(join(pastaDados, 'primeiro-acesso.txt'), 'utf8');
  conviteInicial = texto.match(/t=([a-f0-9]+)/)[1];
});

after(() => {
  processo?.kill();
  rmSync(pastaDados, { recursive: true, force: true });
});

async function chamar(caminho, opcoes = {}) {
  const cabecalhos = { 'x-portal': '1' };
  if (opcoes.cookie) cabecalhos.cookie = opcoes.cookie;
  let corpo;
  if (opcoes.corpo !== undefined) {
    cabecalhos['content-type'] = 'application/json';
    corpo = JSON.stringify(opcoes.corpo);
  }
  const resposta = await fetch(`${BASE}${caminho}`, { method: opcoes.metodo ?? 'GET', headers: cabecalhos, body: corpo });
  const texto = await resposta.text();
  return {
    status: resposta.status,
    cookie: (resposta.headers.get('set-cookie') ?? '').split(';')[0],
    corpo: texto ? JSON.parse(texto) : {},
  };
}

const entrar = async (usuario, senha) => {
  const resposta = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario, senha } });
  assert.equal(resposta.status, 200, `login de ${usuario}: ${JSON.stringify(resposta.corpo)}`);
  return resposta.cookie;
};

/** Estado compartilhado entre os testes, na ordem em que um processo real acontece. */
const estado = {};

test('primeira execução cria o acesso do RH sem senha e mostra o link', async () => {
  const antes = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'rh.admin', senha: 'Qualquer12345' } });
  assert.equal(antes.status, 409);
  assert.match(antes.corpo.erro, /ainda não foi ativado/i);

  const ativacao = await chamar(`/api/auth/ativacao/${conviteInicial}`, {
    metodo: 'POST', corpo: { senha: 'SenhaDoRh2026', confirmacao: 'SenhaDoRh2026' },
  });
  assert.equal(ativacao.status, 200, JSON.stringify(ativacao.corpo));
  assert.equal(ativacao.corpo.usuario.perfil, 'admin');
  estado.rh = ativacao.cookie;

  const reuso = await chamar(`/api/auth/ativacao/${conviteInicial}`, {
    metodo: 'POST', corpo: { senha: 'OutraSenha2026', confirmacao: 'OutraSenha2026' },
  });
  assert.equal(reuso.status, 404, 'link de primeiro acesso é de uso único');
});

test('o catálogo já vem com os campos, ações e regras do processo', async () => {
  const { corpo } = await chamar('/api/auth/eu', { cookie: estado.rh });
  assert.ok(corpo.campos.length >= 35);
  assert.ok(corpo.campos.some((c) => c.chave === 'gestor_imediato'));
  assert.deepEqual(corpo.acoes.map((a) => a.valor).sort(),
    ['ATIVO', 'DESLIGAMENTO', 'ESTABILIDADE', 'TRANSFERÊNCIA DE ÁREA']);
  assert.equal(corpo.permissoes.administrar, true);
});

test('importa a base com gestor imediato e não sobe nada além das colunas mapeadas', async () => {
  const mapeamento = {
    chapa: 'CHAPA', nome: 'NOME', diretoria: 'DIRETORIA', divisao: 'DIVISAO',
    gestor_imediato: 'GESTOR', situacao: 'SITUACAO', salario_anual: 'SALARIO ANUAL', estabilidade: 'ESTABILIDADE',
  };
  const linha = (chapa, nome, diretoria, divisao, gestor, extras = {}) => ({
    CHAPA: chapa, NOME: nome, DIRETORIA: diretoria, DIVISAO: divisao, GESTOR: gestor,
    SITUACAO: 'ATIVO', 'SALARIO ANUAL': '60.000,00', ESTABILIDADE: '', ...extras,
  });
  const linhas = [
    linha('1001', 'Alice Ramos', 'DIRETORIA INDUSTRIAL', 'DIVISAO PRODUCAO', 'Marcos Vilela'),
    linha('1002', 'Bruno Dias', 'DIRETORIA INDUSTRIAL', 'DIVISAO PRODUCAO', 'Marcos Vilela', { ESTABILIDADE: 'CIPA' }),
    linha('1003', 'Carla Nunes', 'DIRETORIA INDUSTRIAL', 'DIVISAO QUALIDADE', 'Elisa Prado'),
    linha('1004', 'Davi Souza', 'DIRETORIA CORPORATIVA', 'DIVISAO TI', 'Chefe de TI'),
    linha('', 'Sem matrícula', 'DIRETORIA INDUSTRIAL', 'DIVISAO PRODUCAO', 'Marcos Vilela'),
  ];

  const simulacao = await chamar('/api/importacao/simular', {
    metodo: 'POST', cookie: estado.rh, corpo: { arquivo: 'base.xlsx', aba: 'Base', mapeamento, linhas },
  });
  assert.equal(simulacao.status, 200, JSON.stringify(simulacao.corpo));
  assert.equal(simulacao.corpo.novos, 4);
  assert.equal(simulacao.corpo.erros, 1, 'a linha sem matrícula é recusada');

  const carga = await chamar('/api/importacao/confirmar', {
    metodo: 'POST', cookie: estado.rh, corpo: { arquivo: 'base.xlsx', aba: 'Base', mapeamento, linhas },
  });
  assert.equal(carga.status, 200, JSON.stringify(carga.corpo));
  assert.equal(carga.corpo.novos, 4);

  const lista = await chamar('/api/colaboradores', { cookie: estado.rh });
  assert.equal(lista.corpo.total, 4);
  const alice = lista.corpo.itens.find((i) => i.chapa === '1001');
  assert.equal(alice.gestor.nome, 'Marcos Vilela');
  assert.equal(alice.gestor.usuario_id, null, 'gestor ainda sem acesso');
  assert.equal(alice.dados.salario_anual, 60000, 'valor em português vira número');

  const bruno = lista.corpo.itens.find((i) => i.chapa === '1002');
  assert.ok(bruno.alertas.some((a) => /estabilidade/i.test(a.regra)), 'alerta de estabilidade aparece');
});

test('diretor criado pelo RH enxerga só a Diretoria dele', async () => {
  const estrutura = await chamar('/api/config/estrutura', { cookie: estado.rh });
  const industrial = estrutura.corpo.diretorias.find((d) => d.nome === 'DIRETORIA INDUSTRIAL');
  estado.industrial = industrial.id;

  const criado = await chamar('/api/usuarios', {
    metodo: 'POST', cookie: estado.rh,
    corpo: { usuario: 'diretor.industrial', nome: 'Diretor Industrial', perfil: 'diretor', diretorias: [industrial.id] },
  });
  assert.equal(criado.status, 201, JSON.stringify(criado.corpo));
  assert.equal(criado.corpo.senha_definida, false, 'nasce sem senha');

  const ativacao = await chamar(`/api/auth/ativacao/${criado.corpo.convite}`, {
    metodo: 'POST', corpo: { senha: 'SenhaDoDiretor26', confirmacao: 'SenhaDoDiretor26' },
  });
  assert.equal(ativacao.status, 200);
  estado.diretor = ativacao.cookie;

  const lista = await chamar('/api/colaboradores', { cookie: estado.diretor });
  assert.deepEqual(lista.corpo.itens.map((i) => i.chapa).sort(), ['1001', '1002', '1003']);
  assert.ok(!lista.corpo.itens.some((i) => i.dados.cpf), 'campo sensível não sai para quem não é RH');
});

test('diretor distribui a base por gestor imediato, sem mandar arquivo', async () => {
  const gestores = await chamar('/api/equipe/gestores', { cookie: estado.diretor });
  assert.equal(gestores.status, 200, JSON.stringify(gestores.corpo));
  const nomes = gestores.corpo.itens.map((i) => i.gestor_nome).sort();
  assert.deepEqual(nomes, ['Elisa Prado', 'Marcos Vilela']);
  assert.ok(gestores.corpo.itens.every((i) => i.acesso === 'sem_acesso'));
  assert.equal(gestores.corpo.itens.find((i) => i.gestor_nome === 'Marcos Vilela').total, 2);

  const acesso = await chamar('/api/equipe/gestores/acesso', {
    metodo: 'POST', cookie: estado.diretor,
    corpo: { gestor_nome: 'Marcos Vilela', nome: 'Marcos Vilela', usuario: 'marcos.vilela' },
  });
  assert.equal(acesso.status, 201, JSON.stringify(acesso.corpo));
  assert.equal(acesso.corpo.colaboradores, 2);
  estado.conviteGestor = acesso.corpo.convite;

  const semAcesso = await chamar('/api/auth/login', {
    metodo: 'POST', corpo: { usuario: 'marcos.vilela', senha: 'TentativaQualquer1' },
  });
  assert.equal(semAcesso.status, 409, 'não existe senha até ele definir a dele');
});

test('o gestor define a própria senha e enxerga só a equipe dele', async () => {
  const ativacao = await chamar(`/api/auth/ativacao/${estado.conviteGestor}`, {
    metodo: 'POST', corpo: { senha: 'SenhaDoGestor26', confirmacao: 'SenhaDoGestor26' },
  });
  assert.equal(ativacao.status, 200, JSON.stringify(ativacao.corpo));
  estado.gestor = ativacao.cookie;

  const lista = await chamar('/api/colaboradores', { cookie: estado.gestor });
  assert.deepEqual(lista.corpo.itens.map((i) => i.chapa).sort(), ['1001', '1002']);

  const fora = await chamar('/api/equipe/gestores', { cookie: estado.gestor });
  assert.equal(fora.status, 403, 'gestor não administra gestores');

  estado.alice = lista.corpo.itens.find((i) => i.chapa === '1001').id;
  estado.bruno = lista.corpo.itens.find((i) => i.chapa === '1002').id;
  estado.carla = (await chamar('/api/colaboradores', { cookie: estado.diretor }))
    .corpo.itens.find((i) => i.chapa === '1003').id;

  const alheio = await chamar(`/api/colaboradores/${estado.carla}`, { cookie: estado.gestor });
  assert.equal(alheio.status, 403, 'fora da equipe dele não abre');
});

test('a decisão exige justificativa quando a ação pede, e fica na auditoria', async () => {
  const semJustificativa = await chamar(`/api/colaboradores/${estado.alice}`, {
    metodo: 'PATCH', cookie: estado.gestor, corpo: { acao: 'DESLIGAMENTO', justificativa: '' },
  });
  assert.equal(semJustificativa.status, 422);

  const comJustificativa = await chamar(`/api/colaboradores/${estado.alice}`, {
    metodo: 'PATCH', cookie: estado.gestor,
    corpo: { acao: 'DESLIGAMENTO', justificativa: 'Revisão da estrutura da divisão.' },
  });
  assert.equal(comJustificativa.status, 200, JSON.stringify(comJustificativa.corpo));
  assert.equal(comJustificativa.corpo.avaliacao.status, 'preenchida');

  const transferencia = await chamar(`/api/colaboradores/${estado.bruno}`, {
    metodo: 'PATCH', cookie: estado.gestor,
    corpo: { acao: 'TRANSFERÊNCIA DE ÁREA', justificativa: 'Realocação.', destino: '' },
  });
  assert.equal(transferencia.status, 422, 'transferência exige destino');

  const historico = await chamar(`/api/colaboradores/${estado.alice}/historico`, { cookie: estado.gestor });
  assert.ok(historico.corpo.itens.some((i) => i.campo === 'acao' && i.valor_novo === 'DESLIGAMENTO'));
});

test('homologação trava a edição do gestor', async () => {
  const homologacao = await chamar('/api/colaboradores/homologar', {
    metodo: 'POST', cookie: estado.diretor, corpo: { ids: [estado.alice], homologado: true },
  });
  assert.equal(homologacao.status, 200, JSON.stringify(homologacao.corpo));

  const tentativa = await chamar(`/api/colaboradores/${estado.alice}`, {
    metodo: 'PATCH', cookie: estado.gestor, corpo: { acao: 'ATIVO', justificativa: 'Mudei de ideia.' },
  });
  assert.equal(tentativa.status, 409);
});

test('o painel soma só o que a pessoa pode ver', async () => {
  const doGestor = await chamar('/api/dashboard', { cookie: estado.gestor });
  assert.equal(doGestor.corpo.totais.total, 2);
  assert.equal(doGestor.corpo.totais.custo_total, 120000);
  assert.deepEqual(doGestor.corpo.por_gestor, [], 'gestor não vê a lista de gestores');

  const doDiretor = await chamar('/api/dashboard', { cookie: estado.diretor });
  assert.equal(doDiretor.corpo.totais.total, 3);
  assert.ok(doDiretor.corpo.por_gestor.length >= 2);

  const doRh = await chamar('/api/dashboard', { cookie: estado.rh });
  assert.equal(doRh.corpo.totais.total, 4);
});

test('exportação respeita o recorte e não entrega auditoria ao gestor', async () => {
  const doGestor = await chamar('/api/exportacao/dados', { cookie: estado.gestor });
  assert.equal(doGestor.corpo.itens.length, 2);
  assert.deepEqual(doGestor.corpo.auditoria, []);
  assert.ok(!doGestor.corpo.campos.some((c) => c.sensivel));

  const doRh = await chamar('/api/exportacao/dados', { cookie: estado.rh });
  assert.equal(doRh.corpo.itens.length, 4);
  assert.ok(doRh.corpo.auditoria.length > 0);
});

test('recarga da planilha preserva decisão e atribuição feita no portal', async () => {
  await chamar('/api/equipe/atribuir', {
    metodo: 'POST', cookie: estado.diretor,
    corpo: { colaborador_ids: [estado.carla], usuario_id: null },
  });
  const antes = await chamar(`/api/colaboradores/${estado.alice}`, { cookie: estado.rh });
  assert.equal(antes.corpo.avaliacao.acao, 'DESLIGAMENTO');

  const recarga = await chamar('/api/importacao/confirmar', {
    metodo: 'POST', cookie: estado.rh,
    corpo: {
      arquivo: 'base-v2.xlsx', aba: 'Base',
      mapeamento: { chapa: 'CHAPA', nome: 'NOME', des_cargo: 'CARGO' },
      linhas: [{ CHAPA: '1001', NOME: 'Alice Ramos', CARGO: 'Analista III' }],
    },
  });
  assert.equal(recarga.status, 200);

  const depois = await chamar(`/api/colaboradores/${estado.alice}`, { cookie: estado.rh });
  assert.equal(depois.corpo.avaliacao.acao, 'DESLIGAMENTO', 'a carga não apaga decisão');
  assert.equal(depois.corpo.dados.des_cargo, 'Analista III');
  assert.equal(depois.corpo.gestor.nome, 'Marcos Vilela', 'gestor imediato preservado');
});

test('a trilha de auditoria não pode ser alterada nem apagada', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const bd = new DatabaseSync(join(pastaDados, 'portal.sqlite'));
  assert.throws(() => bd.exec("UPDATE auditoria SET tipo = 'x'"), /não pode ser alterada/);
  assert.throws(() => bd.exec('DELETE FROM auditoria'), /não pode ser alterada/);
  bd.close();
});

test('login errado várias vezes bloqueia por alguns minutos', async () => {
  for (let i = 0; i < 5; i += 1) {
    await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'marcos.vilela', senha: 'errada123' } });
  }
  const bloqueado = await chamar('/api/auth/login', {
    metodo: 'POST', corpo: { usuario: 'marcos.vilela', senha: 'SenhaDoGestor26' },
  });
  assert.equal(bloqueado.status, 429);
});

test('pedido sem o cabeçalho do portal é recusado', async () => {
  const resposta = await fetch(`${BASE}/api/colaboradores/1`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: estado.rh },
    body: JSON.stringify({ acao: 'ATIVO' }),
  });
  assert.equal(resposta.status, 403);
});

test('sem sessão, nada da base abre', async () => {
  const resposta = await chamar('/api/colaboradores');
  assert.equal(resposta.status, 401);
});
