import { consultarUm, emTransacao, encerrarPool, pool } from './pool.js';
import { gerarHash, validarSenha } from '../http/auth.js';
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

/**
 * Cria o administrador inicial a partir de variáveis de ambiente.
 * Serve para quem implanta pelo navegador, sem terminal: basta preencher
 * ADMIN_USUARIO / ADMIN_NOME / ADMIN_SENHA no painel do provedor.
 * A senha informada é provisória — o portal exige a troca no primeiro acesso.
 */
export async function criarAdminInicial(): Promise<void> {
  const usuario = String(process.env.ADMIN_USUARIO ?? '').trim().toLowerCase();
  const nome = String(process.env.ADMIN_NOME ?? '').trim();
  const senha = String(process.env.ADMIN_SENHA ?? '');
  if (!usuario || !senha) return;

  const problema = validarSenha(senha);
  if (problema) {
    console.warn('ADMIN_SENHA não atende à política de senha: ' + problema);
    return;
  }

  const existente = await consultarUm<{ id: number }>('SELECT id FROM usuarios WHERE lower(usuario) = $1', [usuario]);
  if (existente) {
    console.log('Administrador "' + usuario + '" já existe — nada alterado.');
    return;
  }
  await pool.query(
    'INSERT INTO usuarios (usuario, nome, senha_hash, perfil, trocar_senha) VALUES ($1, $2, $3, $4, true)',
    [usuario, nome || 'Administrador', gerarHash(senha), 'admin'],
  );
  console.log('Administrador inicial "' + usuario + '" criado (senha provisória: troca obrigatória no 1º acesso).');
}

if (require.main === module) {
  semear()
    .then(async (id) => {
      console.log(`Processo inicial pronto (id ${id}).`);
      await criarAdminInicial();
    })
    .catch((erro) => {
      console.error('Falha ao semear:', erro);
      process.exitCode = 1;
    })
    .finally(() => encerrarPool());
}
