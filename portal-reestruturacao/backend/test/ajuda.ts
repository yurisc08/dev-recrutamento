import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import ExcelJS from 'exceljs';
import { criarApp } from '../src/index.js';
import { pool, consultarUm } from '../src/db/pool.js';
import { semear } from '../src/db/semear.js';
import { gerarHash } from '../src/http/auth.js';

export interface Resposta<T = any> {
  status: number;
  corpo: T;
  buffer: Buffer;
  cookie: string | null;
}

export async function subirApi(): Promise<{ servidor: Server; base: string }> {
  const servidor = criarApp().listen(0, '127.0.0.1');
  await new Promise((resolver) => servidor.once('listening', resolver));
  const { port } = servidor.address() as AddressInfo;
  return { servidor, base: `http://127.0.0.1:${port}` };
}

export function cliente(base: string) {
  return async function chamar<T = any>(
    metodo: string,
    caminho: string,
    opcoes: { corpo?: unknown; cookie?: string | null; form?: FormData } = {},
  ): Promise<Resposta<T>> {
    const headers: Record<string, string> = { 'x-portal': '1' };
    if (opcoes.cookie) headers.cookie = opcoes.cookie;
    let body: BodyInit | undefined;
    if (opcoes.form) body = opcoes.form;
    else if (opcoes.corpo !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opcoes.corpo);
    }
    const resposta = await fetch(base + caminho, { method: metodo, headers, body });
    const buffer = Buffer.from(await resposta.arrayBuffer());
    const tipo = resposta.headers.get('content-type') ?? '';
    return {
      status: resposta.status,
      buffer,
      cookie: resposta.headers.get('set-cookie'),
      corpo: tipo.includes('json') ? JSON.parse(buffer.toString('utf8') || '{}') : (null as T),
    };
  };
}

/** Base limpa a cada execução: esquema, processo padrão, estrutura e usuários de teste. */
export async function prepararBase() {
  await pool.query(`
    TRUNCATE auditoria, avaliacoes, colaboradores, importacoes, tentativas_login, sessoes,
             usuario_divisoes, usuario_diretorias, usuarios, divisoes, diretorias, regras, acoes, campos, processos
    RESTART IDENTITY CASCADE
  `).catch(() => undefined);
  const processoId = await semear();

  const industrial = await consultarUm<{ id: number }>(
    'INSERT INTO diretorias (processo_id, nome) VALUES ($1, $2) RETURNING id', [processoId, 'DIRETORIA INDUSTRIAL'],
  );
  const corporativa = await consultarUm<{ id: number }>(
    'INSERT INTO diretorias (processo_id, nome) VALUES ($1, $2) RETURNING id', [processoId, 'DIRETORIA CORPORATIVA'],
  );
  const producao = await consultarUm<{ id: number }>(
    'INSERT INTO divisoes (diretoria_id, nome) VALUES ($1, $2) RETURNING id', [industrial!.id, 'DIVISAO PRODUCAO'],
  );
  const qualidade = await consultarUm<{ id: number }>(
    'INSERT INTO divisoes (diretoria_id, nome) VALUES ($1, $2) RETURNING id', [industrial!.id, 'DIVISAO QUALIDADE'],
  );
  const ti = await consultarUm<{ id: number }>(
    'INSERT INTO divisoes (diretoria_id, nome) VALUES ($1, $2) RETURNING id', [corporativa!.id, 'DIVISAO TI'],
  );

  const criarUsuario = async (usuario: string, nome: string, perfil: string) => {
    const linha = await consultarUm<{ id: number }>(
      `INSERT INTO usuarios (usuario, nome, senha_hash, perfil, trocar_senha)
       VALUES ($1, $2, $3, $4, false) RETURNING id`,
      [usuario, nome, gerarHash('Senha123456'), perfil],
    );
    return linha!.id;
  };

  const rh = await criarUsuario('rh', 'RH Teste', 'admin');
  const diretor = await criarUsuario('diretor', 'Diretor Industrial', 'diretor');
  const gestor1 = await criarUsuario('gestor1', 'Gestor Produção', 'gestor');
  const gestor2 = await criarUsuario('gestor2', 'Gestor TI', 'gestor');
  await pool.query('INSERT INTO usuario_diretorias (usuario_id, diretoria_id) VALUES ($1, $2)', [diretor, industrial!.id]);
  await pool.query('INSERT INTO usuario_divisoes (usuario_id, divisao_id) VALUES ($1, $2)', [gestor1, producao!.id]);
  await pool.query('INSERT INTO usuario_divisoes (usuario_id, divisao_id) VALUES ($1, $2)', [gestor2, ti!.id]);

  const criarColaborador = async (
    chapa: string, nome: string, divisaoId: number, diretoriaId: number, extras: Record<string, unknown> = {},
  ) => {
    const dados = { chapa, nome, situacao: 'ATIVO', salario_anual: 60000, ...extras };
    const linha = await consultarUm<{ id: number }>(
      `INSERT INTO colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [processoId, chapa, nome, String(dados.situacao), JSON.stringify(dados), diretoriaId, divisaoId],
    );
    return linha!.id;
  };

  const alice = await criarColaborador('1001', 'Alice', producao!.id, industrial!.id);
  const bruno = await criarColaborador('1002', 'Bruno', producao!.id, industrial!.id, {
    estabilidade: 'CIPA', data_fim_estabilidade: '2027-01-31',
  });
  const carla = await criarColaborador('1003', 'Carla', qualidade!.id, industrial!.id);
  const davi = await criarColaborador('1004', 'Davi', ti!.id, corporativa!.id, { situacao: 'DESLIGADO' });

  return {
    processoId,
    diretorias: { industrial: industrial!.id, corporativa: corporativa!.id },
    divisoes: { producao: producao!.id, qualidade: qualidade!.id, ti: ti!.id },
    usuarios: { rh, diretor, gestor1, gestor2 },
    colaboradores: { alice, bruno, carla, davi },
  };
}

export async function planilhaDeTeste(linhas: Array<Record<string, unknown>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const aba = workbook.addWorksheet('2. BASE DECISÕES_CONS');
  aba.addRow(['CHAPA', 'NOME', 'DIRETORIA', 'DIVISAO', 'DES_CARGO', 'SITUACAO', 'SALÁRIO ANUAL', 'AÇÃO INDICADA']);
  for (const linha of linhas) {
    aba.addRow([
      linha.chapa, linha.nome, linha.diretoria, linha.divisao,
      linha.cargo ?? 'ANALISTA', linha.situacao ?? 'ATIVO', linha.salario ?? 50000, linha.acao ?? '',
    ]);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
