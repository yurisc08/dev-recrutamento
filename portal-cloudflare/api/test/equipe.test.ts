import test from 'node:test';
import assert from 'node:assert/strict';
import { chamar, conexaoDeTeste, entrar, prepararBase } from './ajuda.js';

/**
 * Gestor imediato e senha própria.
 *
 * O que estes testes garantem: o diretor distribui a base sem mandar arquivo,
 * o gestor só enxerga a equipe dele, e a senha é definida pela própria pessoa —
 * nem o RH nem a Diretoria conseguem entrar no lugar dela.
 */

test('diretor vê os gestores imediatos da área dele, com andamento e situação do acesso', async () => {
  await prepararBase();
  const cookie = await entrar('diretor');
  const { status, corpo } = await chamar('/api/equipe/gestores', { cookie });
  assert.equal(status, 200);

  const nomes = corpo.itens.map((i: any) => i.gestor_nome);
  assert.ok(nomes.includes('Gestor Produção'), 'gestor com acesso deve aparecer');
  assert.ok(nomes.includes('Elisa Prado'), 'gestor sem acesso também aparece, para receber o convite');
  assert.ok(!nomes.includes('Gestor TI'), 'gestor de outra Diretoria não aparece');

  const elisa = corpo.itens.find((i: any) => i.gestor_nome === 'Elisa Prado');
  assert.equal(elisa.acesso, 'sem_acesso');
  assert.equal(elisa.total, 1);
  const producao = corpo.itens.find((i: any) => i.gestor_nome === 'Gestor Produção');
  assert.equal(producao.acesso, 'ativo');
});

test('gestor não entra na tela de gestores', async () => {
  await prepararBase();
  const cookie = await entrar('gestor1');
  const { status } = await chamar('/api/equipe/gestores', { cookie });
  assert.equal(status, 403);
});

test('diretor cria o acesso do gestor: sem senha, com link de primeiro acesso, e a equipe já vinculada', async () => {
  const base = await prepararBase();
  const cookie = await entrar('diretor');

  const criacao = await chamar('/api/equipe/gestores/acesso', {
    metodo: 'POST', cookie,
    corpo: { gestor_nome: 'Elisa Prado', nome: 'Elisa Prado', usuario: 'elisa.prado', email: 'elisa@empresa.com.br' },
  });
  assert.equal(criacao.status, 201, JSON.stringify(criacao.corpo));
  assert.equal(criacao.corpo.colaboradores, 1);
  assert.ok(criacao.corpo.convite && criacao.corpo.convite.length >= 32);

  // o acesso existe, mas ainda não dá para entrar: não há senha nenhuma
  const sql = conexaoDeTeste();
  const [criado] = await sql`SELECT senha_hash, ativacao_hash FROM portal.usuarios WHERE usuario = 'elisa.prado'`;
  assert.equal(criado.senha_hash, null, 'usuário novo não pode nascer com senha');
  assert.ok(criado.ativacao_hash, 'o convite fica guardado como resumo, não em texto');
  assert.notEqual(criado.ativacao_hash, criacao.corpo.convite, 'o convite em si não pode ficar no banco');
  await sql.end();

  const tentativa = await chamar('/api/auth/login', {
    metodo: 'POST', corpo: { usuario: 'elisa.prado', senha: 'QualquerSenha1' },
  });
  assert.equal(tentativa.status, 409);
  assert.match(tentativa.corpo.erro, /ainda não foi ativado/i);

  // a própria gestora define a senha dela e já entra
  const ativacao = await chamar(`/api/auth/ativacao/${criacao.corpo.convite}`, {
    metodo: 'POST', corpo: { senha: 'MinhaSenha2026', confirmacao: 'MinhaSenha2026' },
  });
  assert.equal(ativacao.status, 200, JSON.stringify(ativacao.corpo));
  assert.equal(ativacao.corpo.usuario.usuario, 'elisa.prado');
  assert.ok(ativacao.cookie, 'ativar já deixa a pessoa logada');

  // e o link não serve uma segunda vez
  const repetido = await chamar(`/api/auth/ativacao/${criacao.corpo.convite}`, {
    metodo: 'POST', corpo: { senha: 'OutraSenha2026', confirmacao: 'OutraSenha2026' },
  });
  assert.equal(repetido.status, 404);

  // agora ela entra com a senha dela e enxerga só a equipe dela
  const cookieGestora = await entrar('elisa.prado', 'MinhaSenha2026');
  const lista = await chamar('/api/colaboradores', { cookie: cookieGestora });
  assert.equal(lista.corpo.itens.length, 1);
  assert.equal(lista.corpo.itens[0].id, base.colaboradores.carla);
});

test('link de primeiro acesso recusa senha fraca e confirmação diferente', async () => {
  await prepararBase();
  const cookie = await entrar('diretor');
  const { corpo } = await chamar('/api/equipe/gestores/acesso', {
    metodo: 'POST', cookie, corpo: { gestor_nome: 'Elisa Prado', usuario: 'elisa.prado' },
  });

  const fraca = await chamar(`/api/auth/ativacao/${corpo.convite}`, {
    metodo: 'POST', corpo: { senha: 'curta1', confirmacao: 'curta1' },
  });
  assert.equal(fraca.status, 422);

  const diferente = await chamar(`/api/auth/ativacao/${corpo.convite}`, {
    metodo: 'POST', corpo: { senha: 'SenhaBoa12345', confirmacao: 'OutraCoisa12345' },
  });
  assert.equal(diferente.status, 422);
  assert.match(diferente.corpo.erro, /confirmação/i);
});

test('convite inválido ou vencido não abre nada', async () => {
  await prepararBase();
  const cookie = await entrar('diretor');
  const { corpo } = await chamar('/api/equipe/gestores/acesso', {
    metodo: 'POST', cookie, corpo: { gestor_nome: 'Elisa Prado', usuario: 'elisa.prado' },
  });

  const inventado = await chamar(`/api/auth/ativacao/${'a'.repeat(64)}`);
  assert.equal(inventado.status, 404);

  const sql = conexaoDeTeste();
  await sql`UPDATE portal.usuarios SET ativacao_expira_em = now() - interval '1 day' WHERE usuario = 'elisa.prado'`;
  await sql.end();

  const vencido = await chamar(`/api/auth/ativacao/${corpo.convite}`);
  assert.equal(vencido.status, 410);
  assert.match(vencido.corpo.erro, /venceu/i);
});

test('diretor não cria acesso para gestor de outra Diretoria', async () => {
  await prepararBase();
  const sql = conexaoDeTeste();
  await sql`UPDATE portal.colaboradores SET gestor_nome = 'Chefe de TI' WHERE chapa = '1004'`;
  await sql.end();

  const cookie = await entrar('diretor');
  const { status, corpo } = await chamar('/api/equipe/gestores/acesso', {
    metodo: 'POST', cookie, corpo: { gestor_nome: 'Chefe de TI', usuario: 'chefe.ti' },
  });
  assert.equal(status, 403);
  assert.match(corpo.erro, /área de responsabilidade/i);
});

test('vincular e desvincular equipe muda o que o gestor enxerga', async () => {
  const base = await prepararBase();
  const cookie = await entrar('diretor');

  // Carla (de "Elisa Prado") passa a responder ao gestor1, que já tem acesso
  const vinculo = await chamar('/api/equipe/gestores/vincular', {
    metodo: 'POST', cookie, corpo: { gestor_nome: 'Elisa Prado', usuario_id: base.usuarios.gestor1 },
  });
  assert.equal(vinculo.status, 200);
  assert.equal(vinculo.corpo.colaboradores, 1);

  const cookieGestor = await entrar('gestor1');
  const comCarla = await chamar('/api/colaboradores', { cookie: cookieGestor });
  const chapas = comCarla.corpo.itens.map((i: any) => i.chapa).sort();
  assert.deepEqual(chapas, ['1001', '1002', '1003'], 'soma a Divisão dele + quem foi atribuído');

  // e sai de novo
  const remocao = await chamar('/api/equipe/gestores/vincular', {
    metodo: 'POST', cookie, corpo: { gestor_nome: 'Elisa Prado', usuario_id: null },
  });
  assert.equal(remocao.status, 200);
  const semCarla = await chamar('/api/colaboradores', { cookie: await entrar('gestor1') });
  assert.deepEqual(semCarla.corpo.itens.map((i: any) => i.chapa).sort(), ['1001', '1002']);
});

test('gestor vinculado avalia quem está sob ele, mesmo fora da Divisão dele', async () => {
  const base = await prepararBase();
  const cookieDiretor = await entrar('diretor');
  await chamar('/api/equipe/gestores/vincular', {
    metodo: 'POST', cookie: cookieDiretor, corpo: { gestor_nome: 'Elisa Prado', usuario_id: base.usuarios.gestor2 },
  });

  const cookieGestor2 = await entrar('gestor2');
  const salvou = await chamar(`/api/colaboradores/${base.colaboradores.carla}`, {
    metodo: 'PATCH', cookie: cookieGestor2,
    corpo: { acao: 'DESLIGAMENTO', justificativa: 'Revisão de estrutura da área.' },
  });
  assert.equal(salvou.status, 200, JSON.stringify(salvou.corpo));
  assert.equal(salvou.corpo.avaliacao.acao, 'DESLIGAMENTO');
  assert.equal(salvou.corpo.gestor.nome, 'Elisa Prado');
});

test('novo link tira a senha antiga e encerra as sessões abertas', async () => {
  const base = await prepararBase();
  const cookieGestor = await entrar('gestor1');
  assert.equal((await chamar('/api/auth/eu', { cookie: cookieGestor })).status, 200);

  const cookieDiretor = await entrar('diretor');
  const novo = await chamar(`/api/equipe/usuarios/${base.usuarios.gestor1}/convite`, { metodo: 'POST', cookie: cookieDiretor });
  assert.equal(novo.status, 200, JSON.stringify(novo.corpo));

  assert.equal((await chamar('/api/auth/eu', { cookie: cookieGestor })).status, 401, 'sessão anterior cai');
  const senhaVelha = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario: 'gestor1', senha: 'Senha123456' } });
  assert.equal(senhaVelha.status, 409, 'a senha antiga deixa de valer');
});

test('diretor não gera link para acesso de fora da área dele', async () => {
  const base = await prepararBase();
  const cookie = await entrar('diretor');
  const { status } = await chamar(`/api/equipe/usuarios/${base.usuarios.gestor2}/convite`, { metodo: 'POST', cookie });
  assert.equal(status, 403);
});

test('atribuição manual respeita o escopo de quem atribui', async () => {
  const base = await prepararBase();
  const cookie = await entrar('diretor');

  const fora = await chamar('/api/equipe/atribuir', {
    metodo: 'POST', cookie,
    corpo: { colaborador_ids: [base.colaboradores.davi], usuario_id: base.usuarios.gestor1 },
  });
  assert.equal(fora.status, 403, 'Davi é de outra Diretoria');

  const dentro = await chamar('/api/equipe/atribuir', {
    metodo: 'POST', cookie,
    corpo: { colaborador_ids: [base.colaboradores.carla], usuario_id: base.usuarios.gestor1 },
  });
  assert.equal(dentro.status, 200);
  assert.equal(dentro.corpo.colaboradores, 1);
});

test('importação liga o colaborador ao gestor imediato e não desfaz atribuição feita à mão', async () => {
  const base = await prepararBase();
  const cookieRh = await entrar('rh');

  // "Gestor Produção" é o nome do usuário gestor1: a carga acha sozinha
  const carga = await chamar('/api/importacao/confirmar', {
    metodo: 'POST', cookie: cookieRh,
    corpo: {
      arquivo: 'base.xlsx', aba: 'Base',
      mapeamento: { chapa: 'CHAPA', nome: 'NOME', diretoria: 'DIRETORIA', divisao: 'DIVISAO', gestor_imediato: 'GESTOR' },
      linhas: [
        { CHAPA: '2001', NOME: 'Novo Um', DIRETORIA: 'DIRETORIA INDUSTRIAL', DIVISAO: 'DIVISAO QUALIDADE', GESTOR: 'Gestor Produção' },
        { CHAPA: '1003', NOME: 'Carla', DIRETORIA: 'DIRETORIA INDUSTRIAL', DIVISAO: 'DIVISAO QUALIDADE', GESTOR: 'Elisa Prado' },
      ],
    },
  });
  assert.equal(carga.status, 200, JSON.stringify(carga.corpo));

  const sql = conexaoDeTeste();
  const [novo] = await sql`SELECT gestor_nome, responsavel_id FROM portal.colaboradores WHERE chapa = '2001'`;
  assert.equal(novo.gestor_nome, 'Gestor Produção');
  assert.equal(novo.responsavel_id, base.usuarios.gestor1, 'gestor com mesmo nome é vinculado na carga');

  // agora o diretor atribui Carla a mão e uma nova carga não pode desfazer isso
  const cookieDiretor = await entrar('diretor');
  await chamar('/api/equipe/atribuir', {
    metodo: 'POST', cookie: cookieDiretor,
    corpo: { colaborador_ids: [base.colaboradores.carla], usuario_id: base.usuarios.gestor2 },
  });
  await chamar('/api/importacao/confirmar', {
    metodo: 'POST', cookie: cookieRh,
    corpo: {
      arquivo: 'base.xlsx', aba: 'Base',
      mapeamento: { chapa: 'CHAPA', nome: 'NOME', gestor_imediato: 'GESTOR' },
      linhas: [{ CHAPA: '1003', NOME: 'Carla', GESTOR: 'Elisa Prado' }],
    },
  });
  const [carla] = await sql`SELECT responsavel_id FROM portal.colaboradores WHERE chapa = '1003'`;
  assert.equal(carla.responsavel_id, base.usuarios.gestor2, 'recarga não desfaz atribuição');
  await sql.end();
});

test('cada mudança de responsável fica na auditoria', async () => {
  const base = await prepararBase();
  const cookie = await entrar('diretor');
  await chamar('/api/equipe/gestores/acesso', {
    metodo: 'POST', cookie, corpo: { gestor_nome: 'Elisa Prado', usuario: 'elisa.prado' },
  });
  await chamar('/api/equipe/atribuir', {
    metodo: 'POST', cookie, corpo: { colaborador_ids: [base.colaboradores.carla], usuario_id: base.usuarios.gestor1 },
  });

  const { corpo } = await chamar('/api/auditoria', { cookie });
  const tipos = corpo.itens.map((i: any) => `${i.tipo}:${i.campo ?? ''}`);
  assert.ok(tipos.includes('usuario:'), 'criação do acesso registrada');
  assert.ok(tipos.includes('permissao:responsavel'), 'atribuição registrada');
});
