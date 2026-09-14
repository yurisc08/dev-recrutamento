import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { consultar, consultarUm, emTransacao } from '../db/pool.js';
import { Construtor } from '../db/construtor.js';
import { ErroHttp } from '../http/erros.js';
import { auditar } from '../http/auditoria.js';
import { condicaoEscopo, dentroDoEscopo } from '../dominio/escopo.js';
import { avaliarAlertas, validarAvaliacao } from '../dominio/regras.js';
import { converter } from '../dominio/valores.js';
import { carregarContexto, type ContextoProcesso } from './processo.js';
import type { Alerta, Campo, UsuarioSessao } from '../dominio/tipos.js';

export interface LinhaColaborador {
  id: number;
  chapa: string;
  nome: string | null;
  situacao: string | null;
  dados: Record<string, unknown>;
  diretoria_id: number | null;
  divisao_id: number | null;
  diretoria_nome: string | null;
  divisao_nome: string | null;
  acao: string | null;
  justificativa: string | null;
  destino_livre: string | null;
  nova_diretoria_id: number | null;
  nova_divisao_id: number | null;
  nova_diretoria_nome: string | null;
  nova_divisao_nome: string | null;
  status: string | null;
  atualizado_em: Date | null;
  atualizado_por_nome: string | null;
  homologado_em: Date | null;
  homologado_por_nome: string | null;
}

const SELECT_BASE = `
  SELECT c.id, c.chapa, c.nome, c.situacao, c.dados, c.diretoria_id, c.divisao_id,
         dir.nome  AS diretoria_nome,
         dvs.nome  AS divisao_nome,
         a.acao, a.justificativa, a.destino_livre, a.nova_diretoria_id, a.nova_divisao_id,
         ndir.nome AS nova_diretoria_nome,
         ndvs.nome AS nova_divisao_nome,
         a.status, a.atualizado_em, a.homologado_em,
         ua.nome   AS atualizado_por_nome,
         uh.nome   AS homologado_por_nome
    FROM colaboradores c
    LEFT JOIN diretorias dir  ON dir.id  = c.diretoria_id
    LEFT JOIN divisoes  dvs   ON dvs.id  = c.divisao_id
    LEFT JOIN avaliacoes a    ON a.colaborador_id = c.id
    LEFT JOIN diretorias ndir ON ndir.id = a.nova_diretoria_id
    LEFT JOIN divisoes  ndvs  ON ndvs.id = a.nova_divisao_id
    LEFT JOIN usuarios   ua   ON ua.id   = a.atualizado_por
    LEFT JOIN usuarios   uh   ON uh.id   = a.homologado_por
`;

export interface Filtros {
  busca?: string;
  diretoria_id?: number;
  divisao_id?: number;
  status?: string;
  acao?: string;
  com_alerta?: boolean;
  campos?: Record<string, string>;
  ordenar?: string;
  direcao?: 'asc' | 'desc';
  pagina?: number;
  por_pagina?: number;
}

export function montarItem(linha: LinhaColaborador, contexto: ContextoProcesso) {
  const alertas: Alerta[] = avaliarAlertas(
    { ...linha.dados, situacao: linha.situacao ?? linha.dados.situacao },
    contexto.regras,
  );
  return {
    id: linha.id,
    chapa: linha.chapa,
    nome: linha.nome,
    situacao: linha.situacao,
    diretoria: linha.diretoria_id ? { id: linha.diretoria_id, nome: linha.diretoria_nome } : null,
    divisao: linha.divisao_id ? { id: linha.divisao_id, nome: linha.divisao_nome } : null,
    dados: linha.dados,
    avaliacao: {
      acao: linha.acao,
      justificativa: linha.justificativa,
      destino: linha.destino_livre,
      nova_diretoria: linha.nova_diretoria_id ? { id: linha.nova_diretoria_id, nome: linha.nova_diretoria_nome } : null,
      nova_divisao: linha.nova_divisao_id ? { id: linha.nova_divisao_id, nome: linha.nova_divisao_nome } : null,
      status: linha.status ?? 'pendente',
      atualizado_em: linha.atualizado_em,
      atualizado_por: linha.atualizado_por_nome,
      homologado_em: linha.homologado_em,
      homologado_por: linha.homologado_por_nome,
    },
    alertas,
  };
}

export type ItemColaborador = ReturnType<typeof montarItem>;

/** Lista paginada já restrita ao escopo do usuário. */
export async function listar(usuario: UsuarioSessao, filtros: Filtros, contexto: ContextoProcesso) {
  const construtor = new Construtor();
  const condicoes = [
    `c.processo_id = ${construtor.p(contexto.processo.id)}`,
    'c.ativo = true',
    condicaoEscopo(usuario, construtor),
  ];

  if (filtros.busca) {
    const termo = `%${filtros.busca.trim().toLowerCase()}%`;
    condicoes.push(
      `(lower(coalesce(c.nome, '')) LIKE ${construtor.p(termo)}
        OR lower(c.chapa) LIKE ${construtor.p(termo)}
        OR lower(c.dados::text) LIKE ${construtor.p(termo)})`,
    );
  }
  if (filtros.diretoria_id) condicoes.push(`c.diretoria_id = ${construtor.p(filtros.diretoria_id)}`);
  if (filtros.divisao_id) condicoes.push(`c.divisao_id = ${construtor.p(filtros.divisao_id)}`);
  if (filtros.acao === '__sem__') condicoes.push('a.acao IS NULL');
  else if (filtros.acao) condicoes.push(`a.acao = ${construtor.p(filtros.acao)}`);
  if (filtros.status === 'pendente') condicoes.push("coalesce(a.status, 'pendente') = 'pendente'");
  else if (filtros.status) condicoes.push(`a.status = ${construtor.p(filtros.status)}`);

  for (const [chave, valor] of Object.entries(filtros.campos ?? {})) {
    const campo = contexto.campos.find((item) => item.chave === chave && item.ativo);
    if (!campo || valor === '') continue;
    condicoes.push(`c.dados->>${construtor.p(campo.chave)} = ${construtor.p(valor)}`);
  }

  const where = condicoes.join(' AND ');
  const ordenaveis = new Set(['chapa', 'nome', 'situacao']);
  let ordem = 'c.nome';
  if (filtros.ordenar === 'acao') ordem = 'a.acao';
  else if (filtros.ordenar === 'status') ordem = "coalesce(a.status, 'pendente')";
  else if (filtros.ordenar && ordenaveis.has(filtros.ordenar)) ordem = `c.${filtros.ordenar}`;
  else if (filtros.ordenar && contexto.campos.some((campo) => campo.chave === filtros.ordenar)) {
    ordem = `c.dados->>'${filtros.ordenar.replace(/'/g, "''")}'`;
  }
  const direcao = filtros.direcao === 'desc' ? 'DESC' : 'ASC';

  const porPagina = Math.min(Math.max(filtros.por_pagina ?? 50, 1), 500);
  const pagina = Math.max(filtros.pagina ?? 1, 1);

  const totalLinha = await consultarUm<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM colaboradores c
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
      WHERE ${where}`,
    construtor.params,
  );
  const total = Number(totalLinha?.total ?? 0);

  const linhas = await consultar<LinhaColaborador>(
    `${SELECT_BASE} WHERE ${where}
      ORDER BY ${ordem} ${direcao} NULLS LAST, c.chapa
      LIMIT ${construtor.p(porPagina)} OFFSET ${construtor.p((pagina - 1) * porPagina)}`,
    construtor.params,
  );

  let itens = linhas.map((linha) => montarItem(linha, contexto));
  if (filtros.com_alerta) itens = itens.filter((item) => item.alertas.length > 0);

  return { total, pagina, por_pagina: porPagina, paginas: Math.max(Math.ceil(total / porPagina), 1), itens };
}

export async function buscar(usuario: UsuarioSessao, id: number, contexto: ContextoProcesso): Promise<ItemColaborador> {
  const linha = await consultarUm<LinhaColaborador>(
    `${SELECT_BASE} WHERE c.id = $1 AND c.processo_id = $2`,
    [id, contexto.processo.id],
  );
  if (!linha) throw new ErroHttp(404, 'Colaborador não encontrado.');
  if (!dentroDoEscopo(usuario, linha)) {
    throw new ErroHttp(403, 'Este colaborador está fora da sua área de responsabilidade.');
  }
  return montarItem(linha, contexto);
}

function podeEditarAvaliacao(usuario: UsuarioSessao, item: ItemColaborador): void {
  if (usuario.perfil === 'gestor' && item.avaliacao.status === 'homologada') {
    throw new ErroHttp(409, 'Avaliação já homologada. Procure a Diretoria ou o RH para reabrir.');
  }
}

function podeEditarCampo(usuario: UsuarioSessao, campo: Campo): boolean {
  if (!campo.ativo || campo.somente_leitura || campo.editavel_por === 'ninguem') return false;
  const nivel = { gestor: 1, diretor: 2, admin: 3 } as const;
  const exigido = { ninguem: 9, gestor: 1, diretor: 2, admin: 3 } as const;
  return nivel[usuario.perfil] >= exigido[campo.editavel_por];
}

export interface EntradaSalvar {
  acao?: string | null;
  justificativa?: string | null;
  destino?: string | null;
  nova_diretoria_id?: number | null;
  nova_divisao_id?: number | null;
  dados?: Record<string, unknown>;
}

/**
 * Grava a avaliação (e, para quem tem permissão, campos da base).
 * Cada alteração vira um registro de auditoria com valor anterior e novo.
 */
export async function salvar(
  req: Request,
  usuario: UsuarioSessao,
  id: number,
  entrada: EntradaSalvar,
): Promise<ItemColaborador> {
  const contexto = await carregarContexto();
  const atual = await buscar(usuario, id, contexto);
  podeEditarAvaliacao(usuario, atual);

  const tocaAvaliacao =
    'acao' in entrada || 'justificativa' in entrada || 'destino' in entrada ||
    'nova_diretoria_id' in entrada || 'nova_divisao_id' in entrada;

  const acao = 'acao' in entrada ? (entrada.acao || null) : atual.avaliacao.acao;
  const justificativa = 'justificativa' in entrada
    ? (entrada.justificativa ?? '').toString().trim().slice(0, 4000) || null
    : atual.avaliacao.justificativa;
  const destino = 'destino' in entrada
    ? (entrada.destino ?? '').toString().trim().slice(0, 500) || null
    : atual.avaliacao.destino;
  const novaDiretoria = 'nova_diretoria_id' in entrada ? entrada.nova_diretoria_id ?? null : atual.avaliacao.nova_diretoria?.id ?? null;
  const novaDivisao = 'nova_divisao_id' in entrada ? entrada.nova_divisao_id ?? null : atual.avaliacao.nova_divisao?.id ?? null;

  if (tocaAvaliacao) {
    validarAvaliacao(
      { acao, justificativa, destino, nova_diretoria_id: novaDiretoria, nova_divisao_id: novaDivisao },
      { acoes: contexto.acoes, campos: contexto.campos, alertas: atual.alertas },
    );
  }

  // Campos da base só podem ser corrigidos por quem tem permissão explícita no catálogo de campos.
  const dadosNovos: Record<string, unknown> = { ...atual.dados };
  const mudancasDados: Array<{ campo: Campo; anterior: unknown; novo: unknown }> = [];
  for (const [chave, valor] of Object.entries(entrada.dados ?? {})) {
    const campo = contexto.campos.find((item) => item.chave === chave);
    if (!campo) throw new ErroHttp(422, `Campo desconhecido: ${chave}`);
    if (campo.origem !== 'base') continue;
    if (!podeEditarCampo(usuario, campo)) {
      throw new ErroHttp(403, `Você não pode editar o campo "${campo.rotulo}".`);
    }
    const convertido = converter(valor, campo);
    if (convertido.erro) throw new ErroHttp(422, convertido.erro);
    if (campo.obrigatorio && (convertido.valor === null || convertido.valor === '')) {
      throw new ErroHttp(422, `O campo "${campo.rotulo}" é obrigatório.`);
    }
    if (String(atual.dados[chave] ?? '') !== String(convertido.valor ?? '')) {
      mudancasDados.push({ campo, anterior: atual.dados[chave], novo: convertido.valor });
    }
    dadosNovos[chave] = convertido.valor;
  }

  const status = tocaAvaliacao
    ? (atual.avaliacao.status === 'homologada' ? 'homologada' : acao ? 'preenchida' : 'pendente')
    : atual.avaliacao.status;

  await emTransacao(async (cliente: PoolClient) => {
    if (tocaAvaliacao) {
      await cliente.query(
        `INSERT INTO avaliacoes (colaborador_id, acao, justificativa, destino_livre, nova_diretoria_id, nova_divisao_id, status, atualizado_por, atualizado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
         ON CONFLICT (colaborador_id) DO UPDATE
            SET acao = EXCLUDED.acao,
                justificativa = EXCLUDED.justificativa,
                destino_livre = EXCLUDED.destino_livre,
                nova_diretoria_id = EXCLUDED.nova_diretoria_id,
                nova_divisao_id = EXCLUDED.nova_divisao_id,
                status = EXCLUDED.status,
                atualizado_por = EXCLUDED.atualizado_por,
                atualizado_em = now()`,
        [id, acao, justificativa, destino, novaDiretoria, novaDivisao, status, usuario.id],
      );

      const anteriores: Record<string, unknown> = {
        acao: atual.avaliacao.acao,
        justificativa: atual.avaliacao.justificativa,
        destino: atual.avaliacao.destino,
      };
      const novos: Record<string, unknown> = { acao, justificativa, destino };
      for (const campo of ['acao', 'justificativa', 'destino']) {
        if (String(anteriores[campo] ?? '') === String(novos[campo] ?? '')) continue;
        await auditar(req, {
          tipo: 'avaliacao',
          entidade: 'colaborador',
          entidadeId: id,
          chapa: atual.chapa,
          campo,
          valorAnterior: anteriores[campo] ?? 'Sem decisão',
          valorNovo: novos[campo] ?? 'Sem decisão',
        }, cliente);
      }
    }

    if (mudancasDados.length > 0) {
      await cliente.query(
        'UPDATE colaboradores SET dados = $1, nome = COALESCE($2, nome), atualizado_em = now() WHERE id = $3',
        [JSON.stringify(dadosNovos), (dadosNovos.nome as string | null) ?? null, id],
      );
      for (const mudanca of mudancasDados) {
        await auditar(req, {
          tipo: 'dado',
          entidade: 'colaborador',
          entidadeId: id,
          chapa: atual.chapa,
          campo: mudanca.campo.chave,
          valorAnterior: mudanca.anterior,
          valorNovo: mudanca.novo,
        }, cliente);
      }
    }
  });

  return buscar(usuario, id, contexto);
}

/**
 * Aplica a mesma decisão a vários colaboradores de uma vez (marcação em lote na lista).
 * Cada linha passa pelas mesmas validações e auditoria da edição individual;
 * quem não puder ser gravado volta na lista de erros, sem travar o restante.
 */
export async function avaliarLote(
  req: Request,
  usuario: UsuarioSessao,
  ids: number[],
  entrada: EntradaSalvar,
): Promise<{ aplicados: number; erros: Array<{ id: number; chapa: string | null; erro: string }> }> {
  const erros: Array<{ id: number; chapa: string | null; erro: string }> = [];
  let aplicados = 0;

  for (const id of ids) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await salvar(req, usuario, id, entrada);
      aplicados += 1;
    } catch (erro) {
      const http = erro as ErroHttp;
      let chapa: string | null = null;
      try {
        // eslint-disable-next-line no-await-in-loop
        const linha = await consultarUm<{ chapa: string }>('SELECT chapa FROM colaboradores WHERE id = $1', [id]);
        chapa = linha?.chapa ?? null;
      } catch { /* apenas para a mensagem */ }
      erros.push({ id, chapa, erro: http?.message ?? 'Falha ao gravar.' });
    }
  }

  return { aplicados, erros };
}

/** Homologação (diretor/RH) — trava a avaliação para o gestor. */
export async function homologar(
  req: Request,
  usuario: UsuarioSessao,
  ids: number[],
  homologado: boolean,
): Promise<ItemColaborador[]> {
  const contexto = await carregarContexto();
  const resultado: ItemColaborador[] = [];

  await emTransacao(async (cliente) => {
    for (const id of ids) {
      const item = await buscar(usuario, id, contexto);
      if (homologado && !item.avaliacao.acao) {
        throw new ErroHttp(422, `A matrícula ${item.chapa} ainda não tem ação indicada.`);
      }
      await cliente.query(
        `INSERT INTO avaliacoes (colaborador_id, status, homologado_por, homologado_em)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (colaborador_id) DO UPDATE
            SET status = $2, homologado_por = $3, homologado_em = $4`,
        [id, homologado ? 'homologada' : 'preenchida', homologado ? usuario.id : null, homologado ? new Date() : null],
      );
      await auditar(req, {
        tipo: 'homologacao',
        entidade: 'colaborador',
        entidadeId: id,
        chapa: item.chapa,
        campo: 'status',
        valorAnterior: item.avaliacao.status,
        valorNovo: homologado ? 'homologada' : 'preenchida',
      }, cliente);
    }
  });

  for (const id of ids) resultado.push(await buscar(usuario, id, contexto));
  return resultado;
}
