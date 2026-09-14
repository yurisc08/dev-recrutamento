import { consultarUm, emTransacao, encerrarPool } from './pool.js';
import { ACOES_PADRAO, CAMPOS_PADRAO, PROCESSO_PADRAO, REGRAS_PADRAO } from './padroes.js';
import { migrar } from './migrar.js';

/**
 * Cria o processo inicial com os campos, ações e regras derivados da planilha.
 * Roda quantas vezes for preciso: nada é duplicado nem sobrescrito.
 */
export async function semear(): Promise<number> {
  await migrar();

  return emTransacao(async (cliente) => {
    let processo = await consultarUm<{ id: number }>(
      'SELECT id FROM processos WHERE ativo = true ORDER BY id LIMIT 1',
    );
    if (!processo) {
      const criado = await cliente.query<{ id: number }>(
        `INSERT INTO processos (nome, data_base, prazo, aviso_confidencialidade)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [PROCESSO_PADRAO.nome, PROCESSO_PADRAO.data_base, PROCESSO_PADRAO.prazo, PROCESSO_PADRAO.aviso_confidencialidade],
      );
      processo = criado.rows[0];
    }
    const processoId = processo.id;

    for (const [indice, campo] of CAMPOS_PADRAO.entries()) {
      await cliente.query(
        `INSERT INTO campos (processo_id, chave, rotulo, tipo, opcoes, grupo, origem, obrigatorio,
                             somente_leitura, editavel_por, visivel_lista, somar, agrupar, ordem, ajuda)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (processo_id, chave) DO NOTHING`,
        [
          processoId,
          campo.chave,
          campo.rotulo,
          campo.tipo,
          campo.opcoes ? JSON.stringify(campo.opcoes) : null,
          campo.grupo,
          campo.origem ?? 'base',
          campo.obrigatorio ?? false,
          (campo.editavel_por ?? 'admin') === 'ninguem',
          campo.editavel_por ?? 'admin',
          campo.visivel_lista ?? false,
          campo.somar ?? false,
          campo.agrupar ?? false,
          (indice + 1) * 10,
          campo.ajuda ?? null,
        ],
      );
    }

    for (const [indice, acao] of ACOES_PADRAO.entries()) {
      await cliente.query(
        `INSERT INTO acoes (processo_id, valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (processo_id, valor) DO NOTHING`,
        [processoId, acao.valor, acao.cor, acao.exige_justificativa, acao.exige_destino, acao.considera_desligamento, (indice + 1) * 10],
      );
    }

    const jaTemRegras = await cliente.query('SELECT 1 FROM regras WHERE processo_id = $1 LIMIT 1', [processoId]);
    if (jaTemRegras.rowCount === 0) {
      for (const [indice, regra] of REGRAS_PADRAO.entries()) {
        await cliente.query(
          `INSERT INTO regras (processo_id, nome, campo, operador, valor, mensagem, severidade, aplica_acao, exige_justificativa, ordem)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [processoId, regra.nome, regra.campo, regra.operador, regra.valor, regra.mensagem, regra.severidade, regra.aplica_acao, regra.exige_justificativa, (indice + 1) * 10],
        );
      }
    }

    return processoId;
  });
}

if (require.main === module) {
  semear()
    .then((id) => console.log(`Processo inicial pronto (id ${id}).`))
    .catch((erro) => {
      console.error('Falha ao semear:', erro);
      process.exitCode = 1;
    })
    .finally(() => encerrarPool());
}
