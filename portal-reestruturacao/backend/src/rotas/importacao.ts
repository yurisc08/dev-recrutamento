import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import type { PoolClient } from 'pg';
import { config } from '../config.js';
import { consultar, consultarUm, emTransacao } from '../db/pool.js';
import { ErroHttp, rota } from '../http/erros.js';
import { exigirPerfil } from '../http/auth.js';
import { auditar, ipDe } from '../http/auditoria.js';
import { carregarContexto } from '../servicos/processo.js';
import * as planilha from '../servicos/planilha.js';
import type { Campo } from '../dominio/tipos.js';

export const rotasImportacao = Router();
rotasImportacao.use(exigirPerfil('admin'));

const PASTA_TEMP = process.env.UPLOAD_DIR ?? path.join(process.cwd(), 'dados', 'uploads');
fs.mkdirSync(PASTA_TEMP, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadMB * 1024 * 1024, files: 1 },
  fileFilter: (_req, arquivo, cb) => {
    if (/\.(xlsx|xlsm)$/i.test(arquivo.originalname)) cb(null, true);
    else cb(new ErroHttp(422, 'Envie um arquivo .xlsx (Excel).'));
  },
});

function limparTemporarios(): void {
  const limite = Date.now() - 2 * 3600 * 1000;
  for (const nome of fs.readdirSync(PASTA_TEMP)) {
    const alvo = path.join(PASTA_TEMP, nome);
    try {
      if (fs.statSync(alvo).mtimeMs < limite) fs.unlinkSync(alvo);
    } catch { /* já removido */ }
  }
}

function caminhoDoToken(token: unknown): string {
  if (!/^[a-f0-9]{32}$/.test(String(token ?? ''))) throw new ErroHttp(400, 'Envio inválido.');
  const alvo = path.join(PASTA_TEMP, `${String(token)}.xlsx`);
  if (!fs.existsSync(alvo)) throw new ErroHttp(410, 'Arquivo expirado. Envie a planilha novamente.');
  return alvo;
}

interface Existente {
  id: number;
  chapa: string;
  nome: string | null;
  dados: Record<string, unknown>;
  diretoria_id: number | null;
  divisao_id: number | null;
  tem_avaliacao: boolean;
}

interface Comparacao {
  novos: Array<{ linha: number; chapa: string; nome: string }>;
  alterados: Array<{ linha: number; chapa: string; nome: string; mudancas: Array<{ campo: string; de: unknown; para: unknown }> }>;
  inalterados: number;
  erros: Array<{ linha: number; chapa: string; erros: string[] }>;
  com_avaliacao: number;
}

/** Compara o arquivo com a base atual sem gravar nada — alimenta a tela de conferência. */
async function comparar(
  linhas: planilha.LinhaPreparada[],
  processoId: number,
  campos: Campo[],
): Promise<{ comparacao: Comparacao; existentes: Map<string, Existente> }> {
  const chapas = linhas.map((linha) => linha.chapa).filter(Boolean);
  const registros = chapas.length
    ? await consultar<Existente>(
        `SELECT c.id, c.chapa, c.nome, c.dados, c.diretoria_id, c.divisao_id,
                (a.id IS NOT NULL AND a.acao IS NOT NULL) AS tem_avaliacao
           FROM colaboradores c LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
          WHERE c.processo_id = $1 AND c.chapa = ANY($2::text[])`,
        [processoId, chapas],
      )
    : [];
  const existentes = new Map(registros.map((registro) => [registro.chapa, registro]));

  const comparacao: Comparacao = { novos: [], alterados: [], inalterados: 0, erros: [], com_avaliacao: 0 };
  const rotulos = new Map(campos.map((campo) => [campo.chave, campo.rotulo]));

  for (const linha of linhas) {
    if (linha.erros.length > 0) {
      comparacao.erros.push({ linha: linha.linha, chapa: linha.chapa, erros: linha.erros });
      continue;
    }
    const existente = existentes.get(linha.chapa);
    const nome = String(linha.dados.nome ?? existente?.nome ?? '');
    if (!existente) {
      comparacao.novos.push({ linha: linha.linha, chapa: linha.chapa, nome });
      continue;
    }
    if (existente.tem_avaliacao) comparacao.com_avaliacao += 1;

    const mudancas = Object.entries(linha.dados)
      .filter(([chave, valor]) => String(existente.dados[chave] ?? '') !== String(valor ?? ''))
      .map(([chave, valor]) => ({ campo: rotulos.get(chave) ?? chave, de: existente.dados[chave] ?? null, para: valor }));

    if (mudancas.length > 0) comparacao.alterados.push({ linha: linha.linha, chapa: linha.chapa, nome, mudancas });
    else comparacao.inalterados += 1;
  }
  return { comparacao, existentes };
}

rotasImportacao.post('/analisar', upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) throw new ErroHttp(400, 'Selecione o arquivo da planilha.');
  limparTemporarios();
  const contexto = await carregarContexto();
  const analise = await planilha.analisar(req.file.buffer, {
    aba: req.body?.aba,
    linhaCabecalho: req.body?.linha_cabecalho ? Number(req.body.linha_cabecalho) : undefined,
  });
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(path.join(PASTA_TEMP, `${token}.xlsx`), req.file.buffer);

  res.json({
    token,
    arquivo: req.file.originalname,
    ...analise,
    mapeamento_sugerido: planilha.sugerirMapeamento(analise.cabecalhos, contexto.campos),
    campos: contexto.campos
      .filter((campo) => campo.ativo)
      .map((campo) => ({ chave: campo.chave, rotulo: campo.rotulo, origem: campo.origem, tipo: campo.tipo })),
  });
}));

rotasImportacao.post('/simular', rota(async (req, res) => {
  const contexto = await carregarContexto();
  const arquivo = caminhoDoToken(req.body?.token);
  const { linhas, aba } = await planilha.prepararLinhas(
    fs.readFileSync(arquivo),
    { aba: req.body?.aba, linhaCabecalho: req.body?.linha_cabecalho, mapeamento: req.body?.mapeamento ?? {} },
    contexto.campos,
  );
  const { comparacao } = await comparar(linhas, contexto.processo.id, contexto.campos);

  res.json({
    aba,
    total_linhas: linhas.length,
    novos: comparacao.novos.length,
    alterados: comparacao.alterados.length,
    inalterados: comparacao.inalterados,
    erros: comparacao.erros.length,
    com_avaliacao: comparacao.com_avaliacao,
    amostra_novos: comparacao.novos.slice(0, 20),
    amostra_alterados: comparacao.alterados.slice(0, 20),
    amostra_erros: comparacao.erros.slice(0, 20),
  });
}));

rotasImportacao.post('/confirmar', rota(async (req, res) => {
  const contexto = await carregarContexto();
  const arquivo = caminhoDoToken(req.body?.token);
  const criarEstrutura = req.body?.criar_estrutura !== false;
  const importarDecisoes = req.body?.importar_decisoes === true;

  const { linhas, aba } = await planilha.prepararLinhas(
    fs.readFileSync(arquivo),
    { aba: req.body?.aba, linhaCabecalho: req.body?.linha_cabecalho, mapeamento: req.body?.mapeamento ?? {} },
    contexto.campos,
  );
  const { comparacao, existentes } = await comparar(linhas, contexto.processo.id, contexto.campos);

  const resultado = await emTransacao(async (cliente: PoolClient) => {
    const importacao = await cliente.query<{ id: number }>(
      `INSERT INTO importacoes (processo_id, usuario_id, usuario_nome, arquivo, aba, data_base, linhas, novos, alterados, inalterados, erros, status, resumo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'concluida', $12) RETURNING id`,
      [
        contexto.processo.id, req.usuario!.id, req.usuario!.nome,
        String(req.body?.arquivo ?? '').slice(0, 200), aba, contexto.processo.data_base,
        linhas.length, comparacao.novos.length, comparacao.alterados.length, comparacao.inalterados,
        comparacao.erros.length,
        JSON.stringify({
          erros: comparacao.erros.slice(0, 200),
          importou_decisoes: importarDecisoes,
          alterados: comparacao.alterados.slice(0, 200),
        }),
      ],
    );
    const importacaoId = importacao.rows[0].id;

    const cacheDiretorias = new Map<string, number>();
    const cacheDivisoes = new Map<string, number>();

    const acharDiretoria = async (nome: string): Promise<number | null> => {
      const chave = nome.trim();
      if (!chave) return null;
      if (cacheDiretorias.has(chave)) return cacheDiretorias.get(chave)!;
      const achada = await cliente.query<{ id: number }>(
        'SELECT id FROM diretorias WHERE processo_id = $1 AND nome = $2', [contexto.processo.id, chave],
      );
      let id = achada.rows[0]?.id;
      if (!id && criarEstrutura) {
        const criada = await cliente.query<{ id: number }>(
          'INSERT INTO diretorias (processo_id, nome) VALUES ($1, $2) RETURNING id', [contexto.processo.id, chave],
        );
        id = criada.rows[0].id;
      }
      if (id) cacheDiretorias.set(chave, id);
      return id ?? null;
    };

    const acharDivisao = async (nome: string, diretoriaId: number | null): Promise<number | null> => {
      const chave = `${diretoriaId ?? 0}::${nome.trim()}`;
      if (!nome.trim() || !diretoriaId) return null;
      if (cacheDivisoes.has(chave)) return cacheDivisoes.get(chave)!;
      const achada = await cliente.query<{ id: number }>(
        'SELECT id FROM divisoes WHERE diretoria_id = $1 AND nome = $2', [diretoriaId, nome.trim()],
      );
      let id = achada.rows[0]?.id;
      if (!id && criarEstrutura) {
        const criada = await cliente.query<{ id: number }>(
          'INSERT INTO divisoes (diretoria_id, nome) VALUES ($1, $2) RETURNING id', [diretoriaId, nome.trim()],
        );
        id = criada.rows[0].id;
      }
      if (id) cacheDivisoes.set(chave, id);
      return id ?? null;
    };

    let novos = 0;
    let alterados = 0;

    for (const linha of linhas) {
      if (linha.erros.length > 0) continue;
      const existente = existentes.get(linha.chapa);
      const dados = { ...(existente?.dados ?? {}), ...linha.dados };
      const diretoriaId = await acharDiretoria(String(dados.diretoria ?? '')) ?? existente?.diretoria_id ?? null;
      const divisaoId = await acharDivisao(String(dados.divisao ?? ''), diretoriaId) ?? existente?.divisao_id ?? null;
      const nome = (dados.nome as string | null) ?? existente?.nome ?? null;
      const situacao = (dados.situacao as string | null) ?? null;

      let colaboradorId: number;
      if (existente) {
        await cliente.query(
          `UPDATE colaboradores
              SET nome = $1, situacao = $2, dados = $3, diretoria_id = $4, divisao_id = $5,
                  ativo = true, importacao_id = $6, atualizado_em = now()
            WHERE id = $7`,
          [nome, situacao, JSON.stringify(dados), diretoriaId, divisaoId, importacaoId, existente.id],
        );
        colaboradorId = existente.id;
        alterados += 1;
      } else {
        const criado = await cliente.query<{ id: number }>(
          `INSERT INTO colaboradores (processo_id, chapa, nome, situacao, dados, diretoria_id, divisao_id, importacao_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
          [contexto.processo.id, linha.chapa, nome, situacao, JSON.stringify(dados), diretoriaId, divisaoId, importacaoId],
        );
        colaboradorId = criado.rows[0].id;
        novos += 1;
      }

      // Decisões da planilha só entram quando o RH confirma explicitamente.
      if (importarDecisoes && (linha.decisao.acao || linha.decisao.justificativa || linha.decisao.destino)) {
        const acaoValida = linha.decisao.acao
          ? contexto.acoes.find((acao) => acao.valor.toUpperCase() === String(linha.decisao.acao).toUpperCase())?.valor ?? null
          : null;
        await cliente.query(
          `INSERT INTO avaliacoes (colaborador_id, acao, justificativa, destino_livre, status, atualizado_por, atualizado_em)
           VALUES ($1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (colaborador_id) DO UPDATE
              SET acao = EXCLUDED.acao, justificativa = EXCLUDED.justificativa,
                  destino_livre = EXCLUDED.destino_livre, status = EXCLUDED.status,
                  atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now()`,
          [colaboradorId, acaoValida, linha.decisao.justificativa ?? null, linha.decisao.destino ?? null,
            acaoValida ? 'preenchida' : 'pendente', req.usuario!.id],
        );
      }
    }

    // Cada alteração de campo entra na trilha de auditoria com origem "importacao".
    for (const alterado of comparacao.alterados) {
      for (const mudanca of alterado.mudancas) {
        await cliente.query(
          `INSERT INTO auditoria (usuario_id, usuario_nome, perfil, tipo, entidade, entidade_id, chapa, campo, valor_anterior, valor_novo, detalhes, ip)
           VALUES ($1, $2, $3, 'importacao', 'colaborador', NULL, $4, $5, $6, $7, $8, $9)`,
          [
            req.usuario!.id, req.usuario!.nome, req.usuario!.perfil,
            alterado.chapa, mudanca.campo,
            mudanca.de === null || mudanca.de === undefined ? null : String(mudanca.de),
            mudanca.para === null || mudanca.para === undefined ? null : String(mudanca.para),
            JSON.stringify({ importacao_id: importacaoId }), ipDe(req),
          ],
        );
      }
    }

    await auditar(req, {
      tipo: 'importacao',
      entidade: 'importacao',
      entidadeId: importacaoId,
      detalhes: {
        arquivo: String(req.body?.arquivo ?? ''),
        aba,
        linhas: linhas.length,
        novos,
        alterados,
        erros: comparacao.erros.length,
        importou_decisoes: importarDecisoes,
      },
    }, cliente);

    return { importacaoId, novos, alterados, inalterados: comparacao.inalterados, erros: comparacao.erros };
  });

  try { fs.unlinkSync(arquivo); } catch { /* já removido */ }

  res.json({
    ok: true,
    importacao_id: resultado.importacaoId,
    linhas: linhas.length,
    novos: resultado.novos,
    alterados: resultado.alterados,
    inalterados: resultado.inalterados,
    erros: resultado.erros.slice(0, 50),
    total_erros: resultado.erros.length,
  });
}));

rotasImportacao.get('/historico', rota(async (_req, res) => {
  const itens = await consultar(
    `SELECT i.*, u.nome AS usuario FROM importacoes i
       LEFT JOIN usuarios u ON u.id = i.usuario_id
      ORDER BY i.criado_em DESC LIMIT 100`,
  );
  res.json({ itens });
}));

rotasImportacao.get('/historico/:id', rota(async (req, res) => {
  const item = await consultarUm('SELECT * FROM importacoes WHERE id = $1', [Number(req.params.id)]);
  if (!item) throw new ErroHttp(404, 'Importação não encontrada.');
  res.json(item);
}));
