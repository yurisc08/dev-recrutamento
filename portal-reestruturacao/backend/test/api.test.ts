import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import type { Server } from 'node:http';
import { cliente, prepararBase, planilhaDeTeste, subirApi } from './ajuda.js';
import { pool, consultarUm } from '../src/db/pool.js';

let servidor: Server;
let chamar: ReturnType<typeof cliente>;
let dados: Awaited<ReturnType<typeof prepararBase>>;

async function entrar(usuario: string, senha = 'Senha123456'): Promise<string> {
  const resposta = await chamar('POST', '/api/auth/login', { corpo: { usuario, senha } });
  assert.equal(resposta.status, 200, `login de ${usuario} falhou: ${JSON.stringify(resposta.corpo)}`);
  return (resposta.cookie ?? '').split(';')[0];
}

test.before(async () => {
  const api = await subirApi();
  servidor = api.servidor;
  chamar = cliente(api.base);
  dados = await prepararBase();
});

test.after(async () => {
  servidor.close();
  await pool.end();
});

test('exige o cabeçalho do portal em requisições que alteram dados', async () => {
  const resposta = await fetch(`http://127.0.0.1:${(servidor.address() as { port: number }).port}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ usuario: 'rh', senha: 'Senha123456' }),
  });
  assert.equal(resposta.status, 403);
});

test('recusa senha inválida e aceita a correta', async () => {
  const ruim = await chamar('POST', '/api/auth/login', { corpo: { usuario: 'rh', senha: 'errada' } });
  assert.equal(ruim.status, 401);
  const bom = await chamar('POST', '/api/auth/login', { corpo: { usuario: 'rh', senha: 'Senha123456' } });
  assert.equal(bom.status, 200);
  assert.equal(bom.corpo.usuario.perfil, 'admin');
  assert.equal(bom.corpo.permissoes.administrar, true);
});

test('sem sessão não há acesso à base', async () => {
  const resposta = await chamar('GET', '/api/colaboradores');
  assert.equal(resposta.status, 401);
});

test('gestor enxerga apenas a própria Divisão', async () => {
  const cookie = await entrar('gestor1');
  const resposta = await chamar('GET', '/api/colaboradores', { cookie });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.total, 2);
  assert.deepEqual(resposta.corpo.itens.map((item: any) => item.nome).sort(), ['Alice', 'Bruno']);
});

test('diretor enxerga toda a sua Diretoria, e só ela', async () => {
  const cookie = await entrar('diretor');
  const resposta = await chamar('GET', '/api/colaboradores', { cookie });
  assert.equal(resposta.corpo.total, 3);
  const nomes = resposta.corpo.itens.map((item: any) => item.nome).sort();
  assert.deepEqual(nomes, ['Alice', 'Bruno', 'Carla']);
  assert.ok(!nomes.includes('Davi'), 'Davi pertence a outra Diretoria');
});

test('RH enxerga a empresa inteira', async () => {
  const cookie = await entrar('rh');
  const resposta = await chamar('GET', '/api/colaboradores', { cookie });
  assert.equal(resposta.corpo.total, 4);
});

test('gestor não acessa colaborador de outra Divisão nem pelo id', async () => {
  const cookie = await entrar('gestor1');
  const leitura = await chamar('GET', `/api/colaboradores/${dados.colaboradores.davi}`, { cookie });
  assert.equal(leitura.status, 403);
  const escrita = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.davi}`, {
    cookie, corpo: { acao: 'DESLIGAMENTO', justificativa: 'teste' },
  });
  assert.equal(escrita.status, 403);
});

test('ação fora da lista configurada é recusada', async () => {
  const cookie = await entrar('gestor1');
  const resposta = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.alice}`, {
    cookie, corpo: { acao: 'DEMISSÃO SUMÁRIA', justificativa: 'x' },
  });
  assert.equal(resposta.status, 422);
  assert.match(resposta.corpo.erro, /Ação inválida/);
});

test('transferência exige destino e justificativa', async () => {
  const cookie = await entrar('gestor1');
  const semNada = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.alice}`, {
    cookie, corpo: { acao: 'TRANSFERÊNCIA DE ÁREA' },
  });
  assert.equal(semNada.status, 422);

  const semDestino = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.alice}`, {
    cookie, corpo: { acao: 'TRANSFERÊNCIA DE ÁREA', justificativa: 'Perfil aderente a outra área.' },
  });
  assert.equal(semDestino.status, 422);
  assert.match(semDestino.corpo.erro, /destino/i);

  const completo = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.alice}`, {
    cookie,
    corpo: {
      acao: 'TRANSFERÊNCIA DE ÁREA',
      justificativa: 'Perfil aderente a outra área.',
      nova_diretoria_id: dados.diretorias.corporativa,
    },
  });
  assert.equal(completo.status, 200);
  assert.equal(completo.corpo.avaliacao.acao, 'TRANSFERÊNCIA DE ÁREA');
  assert.equal(completo.corpo.avaliacao.status, 'preenchida');
  assert.equal(completo.corpo.avaliacao.nova_diretoria.nome, 'DIRETORIA CORPORATIVA');
});

test('colaborador com estabilidade gera alerta e exige justificativa no desligamento', async () => {
  const cookie = await entrar('gestor1');
  const leitura = await chamar('GET', `/api/colaboradores/${dados.colaboradores.bruno}`, { cookie });
  const severidades = leitura.corpo.alertas.map((alerta: any) => alerta.severidade);
  assert.ok(severidades.includes('atencao'), 'deve alertar sobre estabilidade declarada');
  assert.ok(severidades.includes('critico'), 'deve alertar sobre estabilidade vigente');

  const sem = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.bruno}`, {
    cookie, corpo: { acao: 'DESLIGAMENTO' },
  });
  assert.equal(sem.status, 422);

  const com = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.bruno}`, {
    cookie, corpo: { acao: 'DESLIGAMENTO', justificativa: 'Efetivar somente após o término da estabilidade.' },
  });
  assert.equal(com.status, 200);
});

test('colaborador desligado na posição-base é sinalizado', async () => {
  const cookie = await entrar('rh');
  const leitura = await chamar('GET', `/api/colaboradores/${dados.colaboradores.davi}`, { cookie });
  assert.equal(leitura.status, 200);
  assert.ok(leitura.corpo.alertas.some((alerta: any) => /desligado/i.test(alerta.mensagem)));
});

test('homologação da Diretoria trava a edição do gestor', async () => {
  const cookieDiretor = await entrar('diretor');
  const homologacao = await chamar('POST', '/api/colaboradores/homologar', {
    cookie: cookieDiretor, corpo: { ids: [dados.colaboradores.alice] },
  });
  assert.equal(homologacao.status, 200);
  assert.equal(homologacao.corpo.itens[0].avaliacao.status, 'homologada');

  const cookieGestor = await entrar('gestor1');
  const tentativa = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.alice}`, {
    cookie: cookieGestor, corpo: { acao: 'ATIVO' },
  });
  assert.equal(tentativa.status, 409);
});

test('gestor não homologa nem administra', async () => {
  const cookie = await entrar('gestor1');
  assert.equal((await chamar('POST', '/api/colaboradores/homologar', { cookie, corpo: { ids: [dados.colaboradores.bruno] } })).status, 403);
  assert.equal((await chamar('GET', '/api/usuarios', { cookie })).status, 403);
  assert.equal((await chamar('POST', '/api/config/campos', { cookie, corpo: { rotulo: 'X' } })).status, 403);
  assert.equal((await chamar('GET', '/api/auditoria', { cookie })).status, 403);
  assert.equal((await chamar('POST', '/api/importacao/simular', { cookie, corpo: {} })).status, 403);
});

test('dashboard respeita o escopo de cada perfil', async () => {
  const gestor = await chamar('GET', '/api/dashboard', { cookie: await entrar('gestor1') });
  assert.equal(gestor.corpo.totais.total, 2);
  assert.equal(gestor.corpo.por_divisao.length, 1);

  const diretor = await chamar('GET', '/api/dashboard', { cookie: await entrar('diretor') });
  assert.equal(diretor.corpo.totais.total, 3);

  const rh = await chamar('GET', '/api/dashboard', { cookie: await entrar('rh') });
  assert.equal(rh.corpo.totais.total, 4);
  assert.ok(rh.corpo.por_gestor.length >= 1, 'RH acompanha pendências por gestor');
});

test('RH cria campo novo e o gestor passa a preenchê-lo', async () => {
  const cookieRh = await entrar('rh');
  const criado = await chamar('POST', '/api/config/campos', {
    cookie: cookieRh,
    corpo: { rotulo: 'Avaliação de potencial', tipo: 'lista', editavel_por: 'gestor', opcoes: ['Abaixo', 'Dentro', 'Acima'] },
  });
  assert.equal(criado.status, 201);
  assert.equal(criado.corpo.chave, 'avaliacao_de_potencial');

  const cookieGestor = await entrar('gestor1');
  const invalido = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.bruno}`, {
    cookie: cookieGestor, corpo: { dados: { avaliacao_de_potencial: 'Excelente' } },
  });
  assert.equal(invalido.status, 422);

  const valido = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.bruno}`, {
    cookie: cookieGestor, corpo: { dados: { avaliacao_de_potencial: 'Acima' } },
  });
  assert.equal(valido.status, 200);
  assert.equal(valido.corpo.dados.avaliacao_de_potencial, 'Acima');
});

test('campo somente leitura não pode ser alterado pelo gestor', async () => {
  const cookie = await entrar('gestor1');
  const resposta = await chamar('PATCH', `/api/colaboradores/${dados.colaboradores.bruno}`, {
    cookie, corpo: { dados: { salario_anual: 1 } },
  });
  assert.equal(resposta.status, 403);
});

test('importação simula antes de gravar e preserva avaliações existentes', async () => {
  const cookie = await entrar('rh');
  const buffer = await planilhaDeTeste([
    { chapa: '1001', nome: 'Alice Souza', diretoria: 'DIRETORIA INDUSTRIAL', divisao: 'DIVISAO PRODUCAO', salario: 90000 },
    { chapa: '9001', nome: 'Elena Nova', diretoria: 'DIRETORIA CORPORATIVA', divisao: 'DIVISAO TI', salario: 70000 },
    { chapa: '', nome: 'Sem matrícula', diretoria: 'DIRETORIA INDUSTRIAL', divisao: 'DIVISAO PRODUCAO' },
  ]);

  const form = new FormData();
  form.append('arquivo', new Blob([buffer]), 'base.xlsx');
  const analise = await chamar('POST', '/api/importacao/analisar', { cookie, form });
  assert.equal(analise.status, 200);
  assert.equal(analise.corpo.mapeamento_sugerido['1'], 'chapa');
  assert.equal(analise.corpo.mapeamento_sugerido['7'], 'salario_anual');

  const simulacao = await chamar('POST', '/api/importacao/simular', {
    cookie,
    corpo: { token: analise.corpo.token, aba: analise.corpo.aba, linha_cabecalho: 1, mapeamento: analise.corpo.mapeamento_sugerido },
  });
  assert.equal(simulacao.status, 200);
  assert.equal(simulacao.corpo.novos, 1);
  assert.equal(simulacao.corpo.alterados, 1);
  assert.equal(simulacao.corpo.erros, 1);
  assert.ok(simulacao.corpo.com_avaliacao >= 1, 'avisa que há avaliações já preenchidas');

  const antes = await consultarUm<{ total: string }>('SELECT COUNT(*)::text AS total FROM colaboradores');
  assert.equal(Number(antes!.total), 4, 'a simulação não pode gravar nada');

  const confirmacao = await chamar('POST', '/api/importacao/confirmar', {
    cookie,
    corpo: {
      token: analise.corpo.token, aba: analise.corpo.aba, linha_cabecalho: 1,
      mapeamento: analise.corpo.mapeamento_sugerido, arquivo: 'base.xlsx',
    },
  });
  assert.equal(confirmacao.status, 200);
  assert.equal(confirmacao.corpo.novos, 1);
  assert.equal(confirmacao.corpo.alterados, 1);

  const alice = await consultarUm<{ nome: string; dados: any; acao: string | null }>(
    `SELECT c.nome, c.dados, a.acao FROM colaboradores c
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id WHERE c.chapa = '1001'`,
  );
  assert.equal(alice!.nome, 'Alice Souza');
  assert.equal(Number(alice!.dados.salario_anual), 90000);
  assert.equal(alice!.acao, 'TRANSFERÊNCIA DE ÁREA', 'a avaliação não pode ser apagada pela carga');
});

test('exportação traz as duas abas, com lista suspensa e no escopo do usuário', async () => {
  const rh = await chamar('GET', '/api/exportacao', { cookie: await entrar('rh') });
  assert.equal(rh.status, 200);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(rh.buffer as unknown as ArrayBuffer);
  assert.deepEqual(workbook.worksheets.map((aba) => aba.name), ['1. Resumo', '2. Base Decisões']);

  const base = workbook.getWorksheet('2. Base Decisões')!;
  const cabecalhos = (base.getRow(1).values as unknown[]).filter(Boolean).map(String);
  assert.ok(cabecalhos.includes('AÇÃO INDICADA'));
  assert.ok(cabecalhos.includes('JUSTIFICATIVA'));
  const coluna = cabecalhos.indexOf('AÇÃO INDICADA') + 1;
  const validacao = base.getRow(2).getCell(coluna).dataValidation as any;
  assert.equal(validacao.type, 'list');
  assert.match(validacao.formulae[0], /DESLIGAMENTO/);

  const gestor = await chamar('GET', '/api/exportacao', { cookie: await entrar('gestor2') });
  const workbookGestor = new ExcelJS.Workbook();
  await workbookGestor.xlsx.load(gestor.buffer as unknown as ArrayBuffer);
  const abaGestor = workbookGestor.getWorksheet('2. Base Decisões')!;
  const divisoes = new Set<string>();
  abaGestor.eachRow((linha, numero) => { if (numero > 1) divisoes.add(String(linha.getCell(2).value ?? '')); });
  assert.ok(!divisoes.has('DIVISAO PRODUCAO'), 'gestor não exporta outra Divisão');
});

test('auditoria registra login, avaliação e importação', async () => {
  const cookie = await entrar('rh');
  const resposta = await chamar('GET', '/api/auditoria?limite=500', { cookie });
  assert.equal(resposta.status, 200);
  const tipos = new Set(resposta.corpo.itens.map((item: any) => item.tipo));
  for (const tipo of ['login', 'avaliacao', 'importacao', 'homologacao', 'exportacao']) {
    assert.ok(tipos.has(tipo), `auditoria deve conter evento "${tipo}"`);
  }

  const decisao = resposta.corpo.itens.find((item: any) => item.tipo === 'avaliacao' && item.campo === 'acao');
  assert.ok(decisao, 'deve registrar a mudança de ação');
  assert.ok(decisao.valor_anterior && decisao.valor_novo, 'registra de → para');
  assert.ok(decisao.usuario_nome);
});

test('histórico de importações fica disponível para o RH', async () => {
  const cookie = await entrar('rh');
  const resposta = await chamar('GET', '/api/importacao/historico', { cookie });
  assert.equal(resposta.status, 200);
  assert.ok(resposta.corpo.itens.length >= 1);
  assert.equal(resposta.corpo.itens[0].arquivo, 'base.xlsx');
});

test('parâmetros do processo são editáveis pelo RH e auditados', async () => {
  const cookie = await entrar('rh');
  const resposta = await chamar('PATCH', '/api/config/processo', {
    cookie, corpo: { nome: 'Reestruturação 2026', data_base: '2026-08-31', prazo: '2026-10-10' },
  });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.nome, 'Reestruturação 2026');
  assert.equal(resposta.corpo.data_base, '2026-08-31');

  const auditoria = await chamar('GET', '/api/auditoria?tipo=config', { cookie });
  assert.ok(auditoria.corpo.itens.length >= 1);
});

test('aplica a mesma ação em lote, com as validações de cada linha', async () => {
  const cookie = await entrar('rh');
  const ids = [dados.colaboradores.carla, dados.colaboradores.davi];

  const semDestino = await chamar('POST', '/api/colaboradores/avaliar-lote', {
    cookie, corpo: { ids, acao: 'TRANSFERÊNCIA DE ÁREA', justificativa: 'Reorganização das áreas.' },
  });
  assert.equal(semDestino.status, 200);
  assert.equal(semDestino.corpo.aplicados, 0, 'sem destino nada pode ser gravado');
  assert.equal(semDestino.corpo.erros.length, 2);
  assert.match(semDestino.corpo.erros[0].erro, /destino/i);

  const completo = await chamar('POST', '/api/colaboradores/avaliar-lote', {
    cookie,
    corpo: {
      ids, acao: 'TRANSFERÊNCIA DE ÁREA',
      justificativa: 'Reorganização das áreas.',
      destino: 'DIRETORIA CORPORATIVA / processo 4321',
    },
  });
  assert.equal(completo.corpo.aplicados, 2);
  assert.equal(completo.corpo.erros.length, 0);

  const gravado = await consultarUm<{ acao: string; destino_livre: string; status: string }>(
    `SELECT a.acao, a.destino_livre, a.status FROM avaliacoes a
       JOIN colaboradores c ON c.id = a.colaborador_id WHERE c.chapa = '1003'`,
  );
  assert.equal(gravado!.acao, 'TRANSFERÊNCIA DE ÁREA');
  assert.equal(gravado!.destino_livre, 'DIRETORIA CORPORATIVA / processo 4321');
  assert.equal(gravado!.status, 'preenchida');

  // a auditoria registra cada linha do lote, uma a uma
  const auditoria = await chamar('GET', '/api/auditoria?chapa=1003&tipo=avaliacao', { cookie });
  assert.ok(auditoria.corpo.itens.some((item: any) => item.campo === 'acao' && item.valor_novo === 'TRANSFERÊNCIA DE ÁREA'));
});

test('lote respeita o escopo: gestor não altera colaborador de outra Divisão', async () => {
  const cookie = await entrar('gestor1');
  const resposta = await chamar('POST', '/api/colaboradores/avaliar-lote', {
    cookie, corpo: { ids: [dados.colaboradores.davi], acao: 'ATIVO' },
  });
  assert.equal(resposta.status, 200);
  assert.equal(resposta.corpo.aplicados, 0);
  assert.match(resposta.corpo.erros[0].erro, /fora da sua área/i);
});

test('bloqueia login após tentativas seguidas com senha errada', async () => {
  for (let tentativa = 0; tentativa < 5; tentativa += 1) {
    await chamar('POST', '/api/auth/login', { corpo: { usuario: 'gestor2', senha: 'x' } });
  }
  const resposta = await chamar('POST', '/api/auth/login', { corpo: { usuario: 'gestor2', senha: 'Senha123456' } });
  assert.equal(resposta.status, 429);
});
