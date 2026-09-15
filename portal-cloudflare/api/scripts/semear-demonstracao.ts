/**
 * Carga de DEMONSTRAÇÃO: estrutura, usuários e colaboradores fictícios.
 *
 * Serve para ver o portal funcionando antes da carga real. Nenhum dado aqui vem
 * de planilha de verdade — são nomes e valores inventados.
 *
 *   DATABASE_URL="postgres://..." npx tsx scripts/semear-demonstracao.ts
 *
 * Para limpar depois:  npx tsx scripts/semear-demonstracao.ts --remover
 */
import postgres from 'postgres';
import { gerarHash } from '../src/senha.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Defina DATABASE_URL com a string de conexão do banco.');
  process.exit(1);
}
const remover = process.argv.includes('--remover');

const sql = postgres(url, { ssl: process.env.DB_SSL === 'false' ? false : 'require', prepare: false, max: 1 });

const ESTRUTURA: Record<string, string[]> = {
  'Diretoria Industrial': ['Divisão Produção', 'Divisão Manutenção'],
  'Diretoria Comercial': ['Divisão Vendas', 'Divisão Pós-Venda'],
  'Diretoria Administrativa': ['Divisão Financeiro', 'Divisão Pessoas'],
};

const NOMES = [
  'Ana Beatriz Moraes', 'Bruno Carvalho Lima', 'Carla Simões Prado', 'Diego Nunes Ferraz',
  'Eduarda Campos Rocha', 'Felipe Andrade Melo', 'Gabriela Tavares Pinto', 'Henrique Barros Cunha',
  'Isabela Fontes Ramos', 'João Vitor Almeida', 'Karina Duarte Neves', 'Leonardo Pires Matos',
  'Mariana Esteves Cruz', 'Nelson Aguiar Braga', 'Olívia Marques Teles', 'Paulo Renato Vieira',
  'Queila Santana Reis', 'Rafael Godoy Bastos', 'Sabrina Lopes Freire', 'Thiago Amorim Serra',
  'Úrsula Vieira Paz', 'Vinícius Rangel Dias', 'Wagner Peixoto Lisboa', 'Yara Coelho Bandeira',
];

const CARGOS = ['Analista', 'Assistente', 'Coordenador', 'Especialista', 'Operador', 'Supervisor'];

/** Gestor imediato de cada Divisão — é a coluna que vem na planilha. */
const GESTORES: Record<string, string> = {
  'Divisão Produção': 'Gestor de Demonstração',
  'Divisão Manutenção': 'Marcos Vilela Antunes',
  'Divisão Vendas': 'Patrícia Lemos Farias',
  'Divisão Pós-Venda': 'Patrícia Lemos Farias',
  'Divisão Financeiro': 'Rogério Sales Pontes',
  'Divisão Pessoas': 'Rogério Sales Pontes',
};
const SITUACOES = ['ATIVO', 'ATIVO', 'ATIVO', 'ATIVO', 'AFASTADO', 'FÉRIAS'];

try {
  const [processo] = await sql<{ id: number }[]>`SELECT id FROM portal.processos ORDER BY id LIMIT 1`;
  if (!processo) throw new Error('Rode antes o 03-carga-inicial.sql: não há processo cadastrado.');

  if (remover) {
    await sql`DELETE FROM portal.colaboradores WHERE processo_id = ${processo.id} AND chapa LIKE 'DEMO%'`;
    await sql`DELETE FROM portal.usuarios WHERE usuario IN ('demo.diretor', 'demo.gestor')`;
    console.log('Dados de demonstração removidos (a trilha de auditoria permanece, por definição).');
    process.exit(0);
  }

  const diretorias = new Map<string, number>();
  const divisoes = new Map<string, number>();

  for (const [nomeDiretoria, listaDivisoes] of Object.entries(ESTRUTURA)) {
    const [diretoria] = await sql<{ id: number }[]>`
      INSERT INTO portal.diretorias (processo_id, nome) VALUES (${processo.id}, ${nomeDiretoria})
      ON CONFLICT (processo_id, nome) DO UPDATE SET ativo = true RETURNING id`;
    diretorias.set(nomeDiretoria, diretoria.id);
    for (const nomeDivisao of listaDivisoes) {
      const [divisao] = await sql<{ id: number }[]>`
        INSERT INTO portal.divisoes (diretoria_id, nome) VALUES (${diretoria.id}, ${nomeDivisao})
        ON CONFLICT (diretoria_id, nome) DO UPDATE SET ativo = true RETURNING id`;
      divisoes.set(nomeDivisao, divisao.id);
    }
  }

  const hash = await gerarHash('Demo@2026');
  const [diretor] = await sql<{ id: number }[]>`
    INSERT INTO portal.usuarios (usuario, nome, perfil, senha_hash, trocar_senha, ativo)
    VALUES ('demo.diretor', 'Diretor de Demonstração', 'diretor', ${hash}, false, true)
    ON CONFLICT (usuario) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, ativo = true RETURNING id`;
  const [gestor] = await sql<{ id: number }[]>`
    INSERT INTO portal.usuarios (usuario, nome, perfil, senha_hash, trocar_senha, ativo)
    VALUES ('demo.gestor', 'Gestor de Demonstração', 'gestor', ${hash}, false, true)
    ON CONFLICT (usuario) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, ativo = true RETURNING id`;

  await sql`DELETE FROM portal.usuario_diretorias WHERE usuario_id = ${diretor.id}`;
  for (const nomeDiretoria of ['Diretoria Industrial', 'Diretoria Comercial']) {
    await sql`INSERT INTO portal.usuario_diretorias (usuario_id, diretoria_id)
              VALUES (${diretor.id}, ${diretorias.get(nomeDiretoria)!})`;
  }
  await sql`DELETE FROM portal.usuario_divisoes WHERE usuario_id = ${gestor.id}`;
  await sql`INSERT INTO portal.usuario_divisoes (usuario_id, divisao_id)
            VALUES (${gestor.id}, ${divisoes.get('Divisão Produção')!})`;

  const listaDivisoes = [...divisoes.entries()];
  let criados = 0;
  for (let i = 0; i < NOMES.length; i += 1) {
    const [nomeDivisao, divisaoId] = listaDivisoes[i % listaDivisoes.length];
    const nomeDiretoria = Object.entries(ESTRUTURA).find(([, lista]) => lista.includes(nomeDivisao))![0];
    const chapa = `DEMO${String(1000 + i)}`;
    const salario = 3200 + ((i * 737) % 9800);
    const dados = {
      chapa,
      nome: NOMES[i],
      diretoria: nomeDiretoria,
      divisao: nomeDivisao,
      cargo: `${CARGOS[i % CARGOS.length]} ${['I', 'II', 'III'][i % 3]}`,
      gestor_imediato: GESTORES[nomeDivisao] ?? '',
      situacao: SITUACOES[i % SITUACOES.length],
      salario,
      // mesma chave que o catálogo de campos soma no painel
      salario_anual: Math.round(salario * 13.33),
      custo_total: Math.round(salario * 1.68),
      dt_admissao: `20${13 + (i % 12)}-0${1 + (i % 9)}-1${i % 9}`,
      estabilidade: i % 7 === 0 ? 'SIM' : 'NÃO',
    };
    // só o gestor de demonstração já tem acesso; os outros ficam "sem acesso",
    // que é justamente o caso de o diretor criar e enviar o link
    const responsavel = dados.gestor_imediato === 'Gestor de Demonstração' ? gestor.id : null;
    await sql`
      INSERT INTO portal.colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id,
                                        gestor_nome, responsavel_id)
      VALUES (${processo.id}, ${chapa}, ${dados.nome}, ${dados.situacao}, ${sql.json(dados as never)},
              ${diretorias.get(nomeDiretoria)!}, ${divisaoId}, ${dados.gestor_imediato || null}, ${responsavel})
      ON CONFLICT (processo_id, chapa) DO UPDATE
        SET nome = EXCLUDED.nome, situacao = EXCLUDED.situacao, dados = EXCLUDED.dados,
            diretoria_id = EXCLUDED.diretoria_id, divisao_id = EXCLUDED.divisao_id,
            gestor_nome = EXCLUDED.gestor_nome, responsavel_id = EXCLUDED.responsavel_id, ativo = true`;
    criados += 1;
  }

  console.log(`Demonstração pronta: ${criados} colaboradores fictícios em ${diretorias.size} diretorias.`);
  console.log('Usuários de teste: demo.diretor e demo.gestor (senha Demo@2026).');
  console.log('Apague tudo antes de usar com dados reais: npx tsx scripts/semear-demonstracao.ts --remover');
} finally {
  await sql.end();
}
