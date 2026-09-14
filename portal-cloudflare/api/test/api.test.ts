import test from 'node:test';
import assert from 'node:assert/strict';
import { chamar, conexaoDeTeste, entrar, prepararBase } from './ajuda.js';

let dados: Awaited<ReturnType<typeof prepararBase>>;

test.before(async () => { dados = await prepararBase(); });

test('login recusa senha errada e aceita a correta', async () => {
  const ruim = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'rh', senha: 'errada' } });
  assert.equal(ruim.status, 401);
  const bom = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'rh', senha: 'Senha123456' } });
  assert.equal(bom.status, 200);
  assert.equal(bom.corpo.usuario.perfil, 'admin');
  assert.ok(String(bom.cookie).includes('HttpOnly'));
  assert.ok(String(bom.cookie).includes('SameSite=Strict'));
});

test('exige o cabeçalho do portal em requisições de escrita', async () => {
  const requisicao = new Request('https://portal.teste/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuario: 'rh', senha: 'Senha123456' }),
  });
  const { default: app } = await import('../src/index.js');
  const { ambiente } = await import('./ajuda.js');
  const resposta = await app.fetch(requisicao, ambiente as never);
  assert.equal(resposta.status, 403);
});

test('sem sessão não há acesso à base', async () => {
  const resposta = await chamar('/api/colaboradores');
  assert.equal(resposta.status, 401);
});

test('cada perfil enxerga apenas o seu recorte', async () => {
  const gestor = await chamar('/api/colaboradores', { cookie: await entrar('gestor1') });
  assert.equal(gestor.corpo.total, 2);
  assert.deepEqual(gestor.corpo.itens.map((i: any) => i.nome).sort(), ['Alice', 'Bruno']);

  const diretor = await chamar('/api/colaboradores', { cookie: await entrar('diretor') });
  assert.equal(diretor.corpo.total, 3);

  const rh = await chamar('/api/colaboradores', { cookie: await entrar('rh') });
  assert.equal(rh.corpo.total, 4);
});

test('campo sensível (CPF) não sai para gestor nem diretor', async () => {
  const gestor = await chamar('/api/colaboradores', { cookie: await entrar('gestor1') });
  assert.equal(gestor.corpo.itens[0].dados.cpf, undefined, 'gestor não deve receber CPF');
  const diretor = await chamar('/api/colaboradores', { cookie: await entrar('diretor') });
  assert.equal(diretor.corpo.itens[0].dados.cpf, undefined, 'diretor não deve receber CPF');
  const rh = await chamar('/api/colaboradores', { cookie: await entrar('rh') });
  assert.ok(rh.corpo.itens.some((i: any) => i.dados.cpf), 'RH continua enxergando');
});

test('gestor não acessa colaborador de outra Divisão', async () => {
  const cookie = await entrar('gestor1');
  assert.equal((await chamar(`/api/colaboradores/${dados.colaboradores.davi}`, { cookie })).status, 403);
  const escrita = await chamar(`/api/colaboradores/${dados.colaboradores.davi}`, {
    metodo: 'PATCH', cookie, corpo: { acao: 'DESLIGAMENTO', justificativa: 'x' },
  });
  assert.equal(escrita.status, 403);
});

test('ação inválida é recusada; transferência exige destino e justificativa', async () => {
  const cookie = await entrar('gestor1');
  const invalida = await chamar(`/api/colaboradores/${dados.colaboradores.alice}`, {
    metodo: 'PATCH', cookie, corpo: { acao: 'DEMISSÃO SUMÁRIA', justificativa: 'x' },
  });
  assert.equal(invalida.status, 422);

  const semDestino = await chamar(`/api/colaboradores/${dados.colaboradores.alice}`, {
    metodo: 'PATCH', cookie, corpo: { acao: 'TRANSFERÊNCIA DE ÁREA', justificativa: 'Perfil aderente.' },
  });
  assert.equal(semDestino.status, 422);
  assert.match(semDestino.corpo.erro, /destino/i);

  const completa = await chamar(`/api/colaboradores/${dados.colaboradores.alice}`, {
    metodo: 'PATCH', cookie,
    corpo: { acao: 'TRANSFERÊNCIA DE ÁREA', justificativa: 'Perfil aderente.', nova_diretoria_id: dados.diretorias.corporativa },
  });
  assert.equal(completa.status, 200);
  assert.equal(completa.corpo.avaliacao.acao, 'TRANSFERÊNCIA DE ÁREA');
  assert.equal(completa.corpo.avaliacao.status, 'preenchida');
});

test('estabilidade vigente gera alerta e exige justificativa no desligamento', async () => {
  const cookie = await entrar('gestor1');
  const leitura = await chamar(`/api/colaboradores/${dados.colaboradores.bruno}`, { cookie });
  const severidades = leitura.corpo.alertas.map((a: any) => a.severidade);
  assert.ok(severidades.includes('atencao'));
  assert.ok(severidades.includes('critico'));

  const sem = await chamar(`/api/colaboradores/${dados.colaboradores.bruno}`, {
    metodo: 'PATCH', cookie, corpo: { acao: 'DESLIGAMENTO' },
  });
  assert.equal(sem.status, 422);

  const com = await chamar(`/api/colaboradores/${dados.colaboradores.bruno}`, {
    metodo: 'PATCH', cookie, corpo: { acao: 'DESLIGAMENTO', justificativa: 'Efetivar após o término da estabilidade.' },
  });
  assert.equal(com.status, 200);
});

test('homologação trava a edição do gestor', async () => {
  const diretor = await entrar('diretor');
  const homologacao = await chamar('/api/colaboradores/homologar', {
    metodo: 'POST', cookie: diretor, corpo: { ids: [dados.colaboradores.alice] },
  });
  assert.equal(homologacao.status, 200);
  assert.equal(homologacao.corpo.itens[0].avaliacao.status, 'homologada');

  const gestor = await entrar('gestor1');
  const tentativa = await chamar(`/api/colaboradores/${dados.colaboradores.alice}`, {
    metodo: 'PATCH', cookie: gestor, corpo: { acao: 'ATIVO' },
  });
  assert.equal(tentativa.status, 409);
});

test('gestor não administra nem vê auditoria', async () => {
  const cookie = await entrar('gestor1');
  assert.equal((await chamar('/api/usuarios', { cookie })).status, 403);
  assert.equal((await chamar('/api/auditoria', { cookie })).status, 403);
  assert.equal((await chamar('/api/importacao/simular', { metodo: 'POST', cookie, corpo: {} })).status, 403);
  assert.equal((await chamar('/api/config/processo', { metodo: 'PATCH', cookie, corpo: { nome: 'X' } })).status, 403);
});

test('dashboard respeita o escopo', async () => {
  assert.equal((await chamar('/api/dashboard', { cookie: await entrar('gestor1') })).corpo.totais.total, 2);
  assert.equal((await chamar('/api/dashboard', { cookie: await entrar('diretor') })).corpo.totais.total, 3);
  const rh = await chamar('/api/dashboard', { cookie: await entrar('rh') });
  assert.equal(rh.corpo.totais.total, 4);
  assert.ok(rh.corpo.por_gestor.length >= 1);
});

test('lote aplica com as mesmas validações e respeita o escopo', async () => {
  const rh = await entrar('rh');
  const semDestino = await chamar('/api/colaboradores/avaliar-lote', {
    metodo: 'POST', cookie: rh,
    corpo: { ids: [dados.colaboradores.carla, dados.colaboradores.davi], acao: 'TRANSFERÊNCIA DE ÁREA', justificativa: 'Reorganização.' },
  });
  assert.equal(semDestino.corpo.aplicados, 0);
  assert.equal(semDestino.corpo.erros.length, 2);

  const completo = await chamar('/api/colaboradores/avaliar-lote', {
    metodo: 'POST', cookie: rh,
    corpo: {
      ids: [dados.colaboradores.carla, dados.colaboradores.davi], acao: 'TRANSFERÊNCIA DE ÁREA',
      justificativa: 'Reorganização.', destino: 'DIRETORIA CORPORATIVA / proc 4321',
    },
  });
  assert.equal(completo.corpo.aplicados, 2);

  const gestor = await chamar('/api/colaboradores/avaliar-lote', {
    metodo: 'POST', cookie: await entrar('gestor1'), corpo: { ids: [dados.colaboradores.davi], acao: 'ATIVO' },
  });
  assert.equal(gestor.corpo.aplicados, 0);
  assert.match(gestor.corpo.erros[0].erro, /fora da sua área/i);
});

test('importação simula antes de gravar e preserva as decisões', async () => {
  const cookie = await entrar('rh');
  const carga = {
    arquivo: 'base.xlsx',
    aba: '2. BASE DECISÕES_CONS',
    mapeamento: { chapa: 'CHAPA', nome: 'NOME', diretoria: 'DIRETORIA', divisao: 'DIVISAO', salario_anual: 'SALÁRIO ANUAL' },
    linhas: [
      { CHAPA: '1001', NOME: 'Alice Souza', DIRETORIA: 'DIRETORIA INDUSTRIAL', DIVISAO: 'DIVISAO PRODUCAO', 'SALÁRIO ANUAL': '90000' },
      { CHAPA: '9001', NOME: 'Elena Nova', DIRETORIA: 'DIRETORIA CORPORATIVA', DIVISAO: 'DIVISAO TI', 'SALÁRIO ANUAL': '70000' },
      { CHAPA: '', NOME: 'Sem matrícula', DIRETORIA: 'DIRETORIA INDUSTRIAL', DIVISAO: 'DIVISAO PRODUCAO' },
    ],
  };

  const simulacao = await chamar('/api/importacao/simular', { metodo: 'POST', cookie, corpo: carga });
  assert.equal(simulacao.status, 200);
  assert.equal(simulacao.corpo.novos, 1);
  assert.equal(simulacao.corpo.alterados, 1);
  assert.equal(simulacao.corpo.erros, 1);
  assert.ok(simulacao.corpo.com_avaliacao >= 1);

  const sql = conexaoDeTeste();
  const [{ total }] = await sql<{ total: string }[]>`SELECT COUNT(*)::text AS total FROM portal.colaboradores`;
  assert.equal(Number(total), 4, 'a simulação não pode gravar nada');

  const confirmacao = await chamar('/api/importacao/confirmar', { metodo: 'POST', cookie, corpo: carga });
  assert.equal(confirmacao.status, 200);
  assert.equal(confirmacao.corpo.novos, 1);
  assert.equal(confirmacao.corpo.alterados, 1);

  const [alice] = await sql<{ nome: string; dados: any; acao: string | null }[]>`
    SELECT c.nome, c.dados, a.acao FROM portal.colaboradores c
      LEFT JOIN portal.avaliacoes a ON a.colaborador_id = c.id WHERE c.chapa = '1001'`;
  assert.equal(alice.nome, 'Alice Souza');
  assert.equal(Number(alice.dados.salario_anual), 90000);
  assert.equal(alice.acao, 'TRANSFERÊNCIA DE ÁREA', 'a decisão não pode ser apagada pela carga');
  await sql.end();
});

test('exportação devolve só o que o perfil pode ver', async () => {
  const rh = await chamar('/api/exportacao/dados', { cookie: await entrar('rh') });
  assert.equal(rh.status, 200);
  assert.ok(rh.corpo.itens.length >= 4);
  assert.ok(rh.corpo.auditoria.length > 0);

  const gestor = await chamar('/api/exportacao/dados', { cookie: await entrar('gestor2') });
  const divisoes = new Set(gestor.corpo.itens.map((i: any) => i.divisao));
  assert.ok(!divisoes.has('DIVISAO PRODUCAO'));
  assert.equal(gestor.corpo.auditoria.length, 0, 'gestor não leva a auditoria');
  assert.ok(gestor.corpo.itens.every((i: any) => !i.dados.cpf), 'CPF não sai para o gestor');
});

test('auditoria registra login, decisão, homologação, importação e exportação', async () => {
  const cookie = await entrar('rh');
  const resposta = await chamar('/api/auditoria?limite=500', { cookie });
  assert.equal(resposta.status, 200);
  const tipos = new Set(resposta.corpo.itens.map((i: any) => i.tipo));
  for (const tipo of ['login', 'avaliacao', 'homologacao', 'importacao', 'exportacao']) {
    assert.ok(tipos.has(tipo), `auditoria deve conter "${tipo}"`);
  }
  const decisao = resposta.corpo.itens.find((i: any) => i.tipo === 'avaliacao' && i.campo === 'acao');
  assert.ok(decisao.valor_anterior && decisao.valor_novo);
});

test('trava de IP bloqueia origem de fora da faixa', async () => {
  const env = { IPS_PERMITIDOS: '200.150.10.0/24' };
  const bloqueado = await chamar('/api/auth/login', {
    metodo: 'POST', corpo: { usuario: 'rh', senha: 'Senha123456' }, ip: '8.8.8.8', env,
  });
  assert.equal(bloqueado.status, 403);
  assert.match(bloqueado.corpo.erro, /rede da empresa/i);

  const liberado = await chamar('/api/auth/login', {
    metodo: 'POST', corpo: { usuario: 'rh', senha: 'Senha123456' }, ip: '200.150.10.44', env,
  });
  assert.equal(liberado.status, 200);

  const saude = await chamar('/api/saude', { ip: '8.8.8.8', env });
  assert.equal(saude.status, 200, 'o teste de saúde do provedor continua acessível');
});

test('bloqueia login após tentativas seguidas com senha errada', async () => {
  for (let i = 0; i < 5; i += 1) {
    await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'gestor2', senha: 'x' } });
  }
  const resposta = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'gestor2', senha: 'Senha123456' } });
  assert.equal(resposta.status, 429);
});
