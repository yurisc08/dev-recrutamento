import { consultarUm, emTransacao, encerrarPool, pool } from './pool.js';
import { gerarHash } from '../http/auth.js';
import { semear } from './semear.js';

/**
 * Dados FICTÍCIOS para demonstração e treinamento.
 * Nenhuma informação real de colaborador é usada aqui.
 * Execute com: npm run semear-demo -- --confirmar
 */
const SENHA_DEMO = 'Portal@2026';

const ESTRUTURA = [
  { diretoria: 'DIRETORIA INDUSTRIAL', divisoes: ['DIVISAO PRODUCAO', 'DIVISAO MANUTENCAO', 'DIVISAO QUALIDADE'] },
  { diretoria: 'DIRETORIA DE ENGENHARIA', divisoes: ['DIVISAO PRODUTO', 'DIVISAO PROCESSOS'] },
  { diretoria: 'DIRETORIA CORPORATIVA', divisoes: ['DIVISAO ADMINISTRATIVA', 'DIVISAO TECNOLOGIA'] },
];

const NOMES = ['Ana', 'Bruno', 'Carla', 'Diego', 'Eduarda', 'Felipe', 'Gabriela', 'Henrique', 'Isabela', 'João',
  'Karina', 'Lucas', 'Mariana', 'Nelson', 'Olívia', 'Paulo', 'Queila', 'Rafael', 'Sabrina', 'Tiago'];
const SOBRENOMES = ['Almeida', 'Barbosa', 'Cardoso', 'Dias', 'Esteves', 'Ferreira', 'Gomes', 'Haas',
  'Iglesias', 'Jung', 'Klein', 'Lima', 'Moraes', 'Nunes', 'Oliveira', 'Pereira'];
const CARGOS = ['ANALISTA I', 'ANALISTA II', 'ANALISTA SENIOR', 'COORDENADOR', 'ESPECIALISTA', 'ASSISTENTE',
  'TECNICO', 'SUPERVISOR', 'OPERADOR', 'ENGENHEIRO'];
const NATUREZAS = ['ADMINISTRATIVO', 'OPERACIONAL', 'GERENCIA', 'TECNICO'];

export async function semearDemo(): Promise<void> {
  const processoId = await semear();

  await emTransacao(async (cliente) => {
    const diretoriaIds: Record<string, number> = {};
    const divisaoIds: Record<string, number> = {};

    for (const bloco of ESTRUTURA) {
      const diretoria = await cliente.query<{ id: number }>(
        `INSERT INTO diretorias (processo_id, nome) VALUES ($1, $2)
         ON CONFLICT (processo_id, nome) DO UPDATE SET ativo = true RETURNING id`,
        [processoId, bloco.diretoria],
      );
      diretoriaIds[bloco.diretoria] = diretoria.rows[0].id;
      for (const nomeDivisao of bloco.divisoes) {
        const divisao = await cliente.query<{ id: number }>(
          `INSERT INTO divisoes (diretoria_id, nome) VALUES ($1, $2)
           ON CONFLICT (diretoria_id, nome) DO UPDATE SET ativo = true RETURNING id`,
          [diretoria.rows[0].id, nomeDivisao],
        );
        divisaoIds[nomeDivisao] = divisao.rows[0].id;
      }
    }

    const criarUsuario = async (
      usuario: string, nome: string, perfil: string,
      diretorias: number[] = [], divisoes: number[] = [],
    ): Promise<void> => {
      const criado = await cliente.query<{ id: number }>(
        `INSERT INTO usuarios (usuario, nome, senha_hash, perfil, trocar_senha)
         VALUES ($1, $2, $3, $4, false)
         ON CONFLICT (usuario) DO UPDATE SET nome = EXCLUDED.nome, senha_hash = EXCLUDED.senha_hash,
                                             perfil = EXCLUDED.perfil, ativo = true, trocar_senha = false
         RETURNING id`,
        [usuario, nome, gerarHash(SENHA_DEMO), perfil],
      );
      const id = criado.rows[0].id;
      await cliente.query('DELETE FROM usuario_diretorias WHERE usuario_id = $1', [id]);
      await cliente.query('DELETE FROM usuario_divisoes WHERE usuario_id = $1', [id]);
      for (const diretoriaId of diretorias) {
        await cliente.query('INSERT INTO usuario_diretorias (usuario_id, diretoria_id) VALUES ($1, $2)', [id, diretoriaId]);
      }
      for (const divisaoId of divisoes) {
        await cliente.query('INSERT INTO usuario_divisoes (usuario_id, divisao_id) VALUES ($1, $2)', [id, divisaoId]);
      }
    };

    await criarUsuario('rh.demo', 'Equipe de RH (demonstração)', 'admin');
    await criarUsuario('diretor.industrial', 'Diretor Industrial (demonstração)', 'diretor', [diretoriaIds['DIRETORIA INDUSTRIAL']]);
    await criarUsuario('diretor.corporativo', 'Diretor Corporativo (demonstração)', 'diretor', [diretoriaIds['DIRETORIA CORPORATIVA']]);
    await criarUsuario('gestor.producao', 'Gestor de Produção (demonstração)', 'gestor', [], [divisaoIds['DIVISAO PRODUCAO']]);
    await criarUsuario('gestor.qualidade', 'Gestor de Qualidade (demonstração)', 'gestor', [], [divisaoIds['DIVISAO QUALIDADE'], divisaoIds['DIVISAO MANUTENCAO']]);
    await criarUsuario('gestor.ti', 'Gestor de Tecnologia (demonstração)', 'gestor', [], [divisaoIds['DIVISAO TECNOLOGIA']]);

    const divisoesLista = Object.entries(divisaoIds);
    for (let indice = 1; indice <= 180; indice += 1) {
      const [nomeDivisao, divisaoId] = divisoesLista[indice % divisoesLista.length];
      const bloco = ESTRUTURA.find((item) => item.divisoes.includes(nomeDivisao))!;
      const nome = `${NOMES[indice % NOMES.length]} ${SOBRENOMES[(indice * 3) % SOBRENOMES.length]}`;
      const desligado = indice % 19 === 0;
      const comEstabilidade = indice % 13 === 0;
      const chapa = String(200000 + indice);
      const salario = 3800 + (indice % 27) * 820;

      const dados = {
        concatenar: `2026-${chapa}`,
        competencia: '2026',
        chapa,
        nome,
        diretoria: bloco.diretoria,
        divisao: nomeDivisao,
        departamento: `DEPART. ${nomeDivisao.replace('DIVISAO ', '')}`,
        area_ajustada: `AREA ${String.fromCharCode(65 + (indice % 5))}`,
        filial: indice % 3 === 0 ? 'MATRIZ' : 'FILIAL 2',
        des_cargo: CARGOS[indice % CARGOS.length],
        des_conjunto_cargo: CARGOS[indice % CARGOS.length],
        natureza: NATUREZAS[indice % NATUREZAS.length],
        mo: indice % 2 === 0 ? 'MOD' : 'MOI',
        situacao: desligado ? 'DESLIGADO' : 'ATIVO',
        dt_admissao: `20${10 + (indice % 15)}-${String(1 + (indice % 12)).padStart(2, '0')}-1${indice % 9}`,
        tempo_casa: 1 + (indice % 20),
        idade: 22 + (indice % 38),
        horario: 'MENSALISTA',
        hrs_teor_mes: 220,
        salario,
        salario_total: salario,
        salario_anual: salario * 13,
        vlr_mediana: salario * 1.05,
        avaliacao_performar: `${(2 + (indice % 3)).toFixed(2).replace('.', ',')} - PERFORMAR 2025`,
        centro_custo_sap: `010014${String(indice % 9000).padStart(4, '0')}`,
        estabilidade: comEstabilidade ? (indice % 26 === 0 ? 'GESTANTE' : 'CIPA') : '',
        data_fim_estabilidade: comEstabilidade ? `2026-1${indice % 2 === 0 ? '1' : '2'}-2${indice % 8}` : '',
        tipo_invalidez: indice % 47 === 0 ? 'AUXILIO DOENCA' : '',
      };

      await cliente.query(
        `INSERT INTO colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (processo_id, chapa) DO UPDATE
            SET nome = EXCLUDED.nome, situacao = EXCLUDED.situacao, dados = EXCLUDED.dados,
                diretoria_id = EXCLUDED.diretoria_id, divisao_id = EXCLUDED.divisao_id`,
        [processoId, chapa, nome, dados.situacao, JSON.stringify(dados), diretoriaIds[bloco.diretoria], divisaoId],
      );
    }

    // Parte das avaliações já preenchida, para a demonstração mostrar o processo em andamento.
    const usuarioRh = await cliente.query<{ id: number }>("SELECT id FROM usuarios WHERE usuario = 'rh.demo'");
    const colaboradores = await cliente.query<{ id: number; situacao: string }>(
      'SELECT id, situacao FROM colaboradores WHERE processo_id = $1 ORDER BY id', [processoId],
    );
    const acoesDemo = ['ATIVO', 'DESLIGAMENTO', 'TRANSFERÊNCIA DE ÁREA', 'ATIVO', 'ATIVO'];
    for (const [indice, colaborador] of colaboradores.rows.entries()) {
      if (colaborador.situacao === 'DESLIGADO' || indice % 5 === 4) continue;
      const acao = acoesDemo[indice % acoesDemo.length];
      await cliente.query(
        `INSERT INTO avaliacoes (colaborador_id, acao, justificativa, destino_livre, status, atualizado_por, atualizado_em)
         VALUES ($1, $2, $3, $4, 'preenchida', $5, now())
         ON CONFLICT (colaborador_id) DO NOTHING`,
        [
          colaborador.id,
          acao,
          acao === 'DESLIGAMENTO'
            ? 'Estrutura redesenhada; atividades absorvidas pela equipe remanescente. (exemplo fictício)'
            : acao === 'TRANSFERÊNCIA DE ÁREA'
              ? 'Perfil aderente à necessidade de outra Diretoria. (exemplo fictício)'
              : 'Permanece na estrutura proposta. (exemplo fictício)',
          acao === 'TRANSFERÊNCIA DE ÁREA' ? 'DIRETORIA CORPORATIVA / processo 1234' : null,
          usuarioRh.rows[0]?.id ?? null,
        ],
      );
    }
  });

  const total = await consultarUm<{ total: string }>('SELECT COUNT(*)::text AS total FROM colaboradores');
  console.log(`Base fictícia pronta: ${total?.total} colaboradores.`);
  console.log(`Usuários de demonstração (senha "${SENHA_DEMO}"):`);
  console.log('  rh.demo · diretor.industrial · diretor.corporativo · gestor.producao · gestor.qualidade · gestor.ti');
}

if (require.main === module) {
  if (!process.argv.includes('--confirmar')) {
    console.error('Este script insere dados fictícios. Confirme com: npm run semear-demo -- --confirmar');
    process.exit(1);
  }
  semearDemo()
    .catch((erro) => {
      console.error('Falha ao semear demonstração:', erro);
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
