import postgres from 'postgres';
import app from '../src/index.js';
import { gerarHash } from '../src/senha.js';

export const URL_BANCO = process.env.DATABASE_URL ?? 'postgres://portal@127.0.0.1:5433/portal_cf';

export const ambiente = {
  DATABASE_URL: URL_BANCO,
  DB_SSL: 'false',
  IPS_PERMITIDOS: '',
  ACCESS_DOMINIO: '',
  ACCESS_AUD: '',
  SESSAO_HORAS: '8',
  COOKIE_SEGURO: 'false',
};

export function conexaoDeTeste() {
  return postgres(URL_BANCO, { prepare: false, max: 2, onnotice: () => {} });
}

export interface Resposta<T = any> {
  status: number;
  corpo: T;
  cookie: string | null;
}

export async function chamar<T = any>(
  caminho: string,
  opcoes: { metodo?: string; corpo?: unknown; cookie?: string | null; ip?: string; env?: Record<string, string> } = {},
): Promise<Resposta<T>> {
  const cabecalhos: Record<string, string> = { 'x-portal': '1' };
  if (opcoes.cookie) cabecalhos.cookie = opcoes.cookie;
  if (opcoes.ip) cabecalhos['cf-connecting-ip'] = opcoes.ip;
  let corpo: string | undefined;
  if (opcoes.corpo !== undefined) {
    cabecalhos['content-type'] = 'application/json';
    corpo = JSON.stringify(opcoes.corpo);
  }
  const requisicao = new Request(`https://portal.teste${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers: cabecalhos,
    body: corpo,
  });
  const resposta = await app.fetch(requisicao, { ...ambiente, ...(opcoes.env ?? {}) } as never);
  const texto = await resposta.text();
  return {
    status: resposta.status,
    cookie: resposta.headers.get('set-cookie'),
    corpo: texto ? JSON.parse(texto) : ({} as T),
  };
}

/** Base limpa: estrutura, usuários e colaboradores fictícios. */
export async function prepararBase() {
  const sql = conexaoDeTeste();
  await sql`TRUNCATE portal.auditoria, portal.avaliacoes, portal.colaboradores, portal.importacoes,
            portal.tentativas_login, portal.sessoes, portal.usuario_divisoes, portal.usuario_diretorias,
            portal.usuarios, portal.divisoes, portal.diretorias RESTART IDENTITY CASCADE`;

  const [processo] = await sql<{ id: number }[]>`SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1`;

  const [industrial] = await sql<{ id: number }[]>`
    INSERT INTO portal.diretorias (processo_id, nome) VALUES (${processo.id}, 'DIRETORIA INDUSTRIAL') RETURNING id`;
  const [corporativa] = await sql<{ id: number }[]>`
    INSERT INTO portal.diretorias (processo_id, nome) VALUES (${processo.id}, 'DIRETORIA CORPORATIVA') RETURNING id`;
  const [producao] = await sql<{ id: number }[]>`
    INSERT INTO portal.divisoes (diretoria_id, nome) VALUES (${industrial.id}, 'DIVISAO PRODUCAO') RETURNING id`;
  const [qualidade] = await sql<{ id: number }[]>`
    INSERT INTO portal.divisoes (diretoria_id, nome) VALUES (${industrial.id}, 'DIVISAO QUALIDADE') RETURNING id`;
  const [ti] = await sql<{ id: number }[]>`
    INSERT INTO portal.divisoes (diretoria_id, nome) VALUES (${corporativa.id}, 'DIVISAO TI') RETURNING id`;

  const senha = await gerarHash('Senha123456');
  const criarUsuario = async (usuario: string, nome: string, perfil: string) => {
    const [linha] = await sql<{ id: number }[]>`
      INSERT INTO portal.usuarios (usuario, nome, senha_hash, perfil, trocar_senha)
      VALUES (${usuario}, ${nome}, ${senha}, ${perfil}, false) RETURNING id`;
    return linha.id;
  };
  const rh = await criarUsuario('rh', 'RH Teste', 'admin');
  const diretor = await criarUsuario('diretor', 'Diretor Industrial', 'diretor');
  const gestor1 = await criarUsuario('gestor1', 'Gestor Produção', 'gestor');
  const gestor2 = await criarUsuario('gestor2', 'Gestor TI', 'gestor');
  await sql`INSERT INTO portal.usuario_diretorias (usuario_id, diretoria_id) VALUES (${diretor}, ${industrial.id})`;
  await sql`INSERT INTO portal.usuario_divisoes (usuario_id, divisao_id) VALUES (${gestor1}, ${producao.id})`;
  await sql`INSERT INTO portal.usuario_divisoes (usuario_id, divisao_id) VALUES (${gestor2}, ${ti.id})`;

  const criarColaborador = async (chapa: string, nome: string, divisao: number, diretoria: number, extras: Record<string, unknown> = {}) => {
    const dados = { chapa, nome, situacao: 'ATIVO', salario_anual: 60000, cpf: '000.000.000-00', ...extras };
    const [linha] = await sql<{ id: number }[]>`
      INSERT INTO portal.colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id)
      VALUES (${processo.id}, ${chapa}, ${nome}, ${String(dados.situacao)}, ${sql.json(dados as never)}, ${diretoria}, ${divisao})
      RETURNING id`;
    return linha.id;
  };

  const alice = await criarColaborador('1001', 'Alice', producao.id, industrial.id);
  const bruno = await criarColaborador('1002', 'Bruno', producao.id, industrial.id, {
    estabilidade: 'CIPA', data_fim_estabilidade: '2027-01-31',
  });
  const carla = await criarColaborador('1003', 'Carla', qualidade.id, industrial.id);
  const davi = await criarColaborador('1004', 'Davi', ti.id, corporativa.id, { situacao: 'DESLIGADO' });

  await sql.end();
  return {
    processoId: processo.id,
    diretorias: { industrial: industrial.id, corporativa: corporativa.id },
    divisoes: { producao: producao.id, qualidade: qualidade.id, ti: ti.id },
    colaboradores: { alice, bruno, carla, davi },
  };
}

export async function entrar(usuario: string, senha = 'Senha123456'): Promise<string> {
  const resposta = await chamar('/api/auth/login', { metodo: 'POST', corpo: { usuario, senha } });
  if (resposta.status !== 200) throw new Error(`login de ${usuario} falhou: ${JSON.stringify(resposta.corpo)}`);
  return (resposta.cookie ?? '').split(';')[0];
}
