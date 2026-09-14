import { Router } from 'express';
import { consultar } from '../db/pool.js';
import { Construtor } from '../db/construtor.js';
import { rota } from '../http/erros.js';
import { auditar } from '../http/auditoria.js';
import { condicaoEscopo } from '../dominio/escopo.js';
import { avaliarAlertas } from '../dominio/regras.js';
import { carregarContexto } from '../servicos/processo.js';
import { gerarExportacao, type ItemExportacao } from '../servicos/planilha.js';
import type { LinhaColaborador } from '../servicos/colaboradores.js';

export const rotasExportacao = Router();

/** Exporta somente o que o usuário pode ver — o recorte é aplicado na consulta. */
rotasExportacao.get('/', rota(async (req, res) => {
  const usuario = req.usuario!;
  const contexto = await carregarContexto();
  const construtor = new Construtor();
  const condicoes = [
    `c.processo_id = ${construtor.p(contexto.processo.id)}`,
    'c.ativo = true',
    condicaoEscopo(usuario, construtor),
  ];
  if (req.query.diretoria_id) condicoes.push(`c.diretoria_id = ${construtor.p(Number(req.query.diretoria_id))}`);
  if (req.query.divisao_id) condicoes.push(`c.divisao_id = ${construtor.p(Number(req.query.divisao_id))}`);
  const where = condicoes.join(' AND ');

  const linhas = await consultar<LinhaColaborador>(
    `SELECT c.id, c.chapa, c.nome, c.situacao, c.dados, c.diretoria_id, c.divisao_id,
            dir.nome AS diretoria_nome, dvs.nome AS divisao_nome,
            a.acao, a.justificativa, a.destino_livre, a.status, a.atualizado_em,
            ua.nome AS atualizado_por_nome
       FROM colaboradores c
       LEFT JOIN diretorias dir ON dir.id = c.diretoria_id
       LEFT JOIN divisoes  dvs ON dvs.id = c.divisao_id
       LEFT JOIN avaliacoes a  ON a.colaborador_id = c.id
       LEFT JOIN usuarios   ua ON ua.id = a.atualizado_por
      WHERE ${where}
      ORDER BY dir.nome, dvs.nome, c.nome`,
    construtor.params,
  );

  const campoSoma = contexto.campos.find((campo) => campo.somar && campo.ativo);
  const itens: ItemExportacao[] = linhas.map((linha) => ({
    chapa: linha.chapa,
    nome: linha.nome,
    diretoria: linha.diretoria_nome,
    divisao: linha.divisao_nome,
    dados: linha.dados,
    acao: linha.acao,
    destino: linha.destino_livre,
    justificativa: linha.justificativa,
    status: linha.status ?? 'pendente',
    alertas: avaliarAlertas({ ...linha.dados, situacao: linha.situacao }, contexto.regras).map((alerta) => alerta.mensagem),
    atualizado_por: linha.atualizado_por_nome,
    atualizado_em: linha.atualizado_em,
  }));

  const custo = (item: ItemExportacao): number =>
    campoSoma ? Number(item.dados[campoSoma.chave] ?? 0) || 0 : 0;

  const totais: Record<string, number> = {
    'Total de colaboradores': itens.length,
    'Desligados na posição-base': itens.filter((item) => String(item.dados.situacao ?? '').toUpperCase() === 'DESLIGADO').length,
    'Avaliações preenchidas': itens.filter((item) => item.acao).length,
    'Pendentes de avaliação': itens.filter((item) => !item.acao).length,
    'Homologadas': itens.filter((item) => item.status === 'homologada').length,
    'Com alerta do RH': itens.filter((item) => item.alertas.length > 0).length,
  };

  const acoesResumo = contexto.acoes.filter((acao) => acao.ativo).map((acao) => ({
    valor: acao.valor,
    total: itens.filter((item) => item.acao === acao.valor).length,
    custo: itens.filter((item) => item.acao === acao.valor).reduce((soma, item) => soma + custo(item), 0),
  }));
  acoesResumo.push({
    valor: 'Sem decisão',
    total: itens.filter((item) => !item.acao).length,
    custo: itens.filter((item) => !item.acao).reduce((soma, item) => soma + custo(item), 0),
  });

  const porDivisao = await consultar(
    `SELECT dvs.nome, dir.nome AS diretoria,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE a.acao IS NOT NULL)::int AS avaliados,
            COUNT(*) FILTER (WHERE a.acao IS NULL)::int AS pendentes
       FROM colaboradores c
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
       JOIN divisoes dvs ON dvs.id = c.divisao_id
       JOIN diretorias dir ON dir.id = dvs.diretoria_id
      WHERE ${where}
      GROUP BY dvs.nome, dir.nome ORDER BY dir.nome, dvs.nome`,
    construtor.params,
  );

  const workbook = await gerarExportacao({
    processo: contexto.processo,
    campos: contexto.campos,
    acoes: contexto.acoes.filter((acao) => acao.ativo).map((acao) => acao.valor),
    itens,
    resumo: { totais, acoes: acoesResumo, por_divisao: porDivisao },
    geradoPor: `${usuario.nome} (${usuario.perfil})`,
  });

  await auditar(req, {
    tipo: 'exportacao',
    entidade: 'planilha',
    detalhes: { registros: itens.length, diretoria_id: req.query.diretoria_id ?? null, divisao_id: req.query.divisao_id ?? null },
  });

  const nome = `decisoes-${contexto.processo.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nome}"`);
  await workbook.xlsx.write(res);
  res.end();
}));
