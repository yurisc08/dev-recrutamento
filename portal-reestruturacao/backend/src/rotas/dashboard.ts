import { Router } from 'express';
import { consultar, consultarUm } from '../db/pool.js';
import { Construtor } from '../db/construtor.js';
import { rota } from '../http/erros.js';
import { condicaoEscopo } from '../dominio/escopo.js';
import { carregarContexto } from '../servicos/processo.js';

export const rotasDashboard = Router();

/**
 * Indicadores do processo, sempre dentro do escopo de quem consulta:
 * gestor vê a sua Divisão, diretor a sua Diretoria, RH a empresa toda.
 */
rotasDashboard.get('/', rota(async (req, res) => {
  const usuario = req.usuario!;
  const contexto = await carregarContexto();
  const campoSoma = contexto.campos.find((campo) => campo.somar && campo.ativo);
  const soma = campoSoma ? `coalesce((c.dados->>'${campoSoma.chave}')::numeric, 0)` : '0';

  const construtor = new Construtor();
  const condicoes = [
    `c.processo_id = ${construtor.p(contexto.processo.id)}`,
    'c.ativo = true',
    condicaoEscopo(usuario, construtor),
  ];
  if (req.query.diretoria_id) condicoes.push(`c.diretoria_id = ${construtor.p(Number(req.query.diretoria_id))}`);
  if (req.query.divisao_id) condicoes.push(`c.divisao_id = ${construtor.p(Number(req.query.divisao_id))}`);
  const where = condicoes.join(' AND ');
  const juncao = `FROM colaboradores c LEFT JOIN avaliacoes a ON a.colaborador_id = c.id WHERE ${where}`;

  const totais = await consultarUm<Record<string, string>>(
    `SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE upper(coalesce(c.situacao, '')) = 'DESLIGADO')::text AS desligados_base,
            COUNT(*) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados,
            COUNT(*) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
            COUNT(*) FILTER (WHERE a.status = 'homologada')::text AS homologadas,
            coalesce(SUM(${soma}), 0)::text AS custo_total,
            coalesce(SUM(${soma}) FILTER (WHERE ac.considera_desligamento), 0)::text AS custo_reducao
       FROM colaboradores c
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
       LEFT JOIN acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
      WHERE ${where}`,
    construtor.params,
  );

  const porAcao = await consultar<{ acao: string | null; total: string; custo: string }>(
    `SELECT a.acao, COUNT(*)::text AS total, coalesce(SUM(${soma}), 0)::text AS custo
       ${juncao} GROUP BY a.acao ORDER BY a.acao NULLS FIRST`,
    construtor.params,
  );

  const porDiretoria = await consultar(
    `SELECT dir.id, dir.nome,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados,
            COUNT(*) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
            COUNT(*) FILTER (WHERE ac.considera_desligamento)::text AS desligamentos,
            COUNT(*) FILTER (WHERE ac.exige_destino)::text AS transferencias
       FROM colaboradores c
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
       LEFT JOIN acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
       JOIN diretorias dir ON dir.id = c.diretoria_id
      WHERE ${where}
      GROUP BY dir.id, dir.nome ORDER BY dir.nome`,
    construtor.params,
  );

  const porDivisao = await consultar(
    `SELECT dvs.id, dvs.nome, dir.nome AS diretoria,
            COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados,
            COUNT(*) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
            COUNT(*) FILTER (WHERE ac.considera_desligamento)::text AS desligamentos,
            COUNT(*) FILTER (WHERE ac.exige_destino)::text AS transferencias
       FROM colaboradores c
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
       LEFT JOIN acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
       JOIN divisoes dvs ON dvs.id = c.divisao_id
       JOIN diretorias dir ON dir.id = dvs.diretoria_id
      WHERE ${where}
      GROUP BY dvs.id, dvs.nome, dir.nome ORDER BY dir.nome, dvs.nome`,
    construtor.params,
  );

  const porGestor = usuario.perfil === 'gestor' ? [] : await consultar(
    `SELECT u.id, u.nome,
            COUNT(c.id)::text AS total,
            COUNT(c.id) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
            COUNT(c.id) FILTER (WHERE a.acao IS NOT NULL)::text AS avaliados
       FROM usuarios u
       JOIN usuario_divisoes ud ON ud.usuario_id = u.id
       JOIN colaboradores c ON c.divisao_id = ud.divisao_id
       LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
      WHERE u.perfil = 'gestor' AND u.ativo = true AND ${where}
      GROUP BY u.id, u.nome ORDER BY pendentes DESC, u.nome`,
    construtor.params,
  );

  // Quebras adicionais pelos campos marcados como "agrupar" no catálogo.
  const quebras = [];
  for (const campo of contexto.campos.filter((item) => item.agrupar && item.ativo).slice(0, 6)) {
    // "valor" também é coluna de "acoes": por isso o agrupamento repete a expressão, sem usar o apelido.
    const expressao = `coalesce(nullif(c.dados->>'${campo.chave.replace(/'/g, "''")}', ''), '(não informado)')`;
    const linhas = await consultar(
      `SELECT ${expressao} AS valor,
              COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE a.acao IS NULL)::text AS pendentes,
              COUNT(*) FILTER (WHERE ac.considera_desligamento)::text AS desligamentos
         FROM colaboradores c
         LEFT JOIN avaliacoes a ON a.colaborador_id = c.id
         LEFT JOIN acoes ac ON ac.processo_id = c.processo_id AND ac.valor = a.acao
        WHERE ${where}
        GROUP BY ${expressao} ORDER BY COUNT(*) DESC LIMIT 20`,
      construtor.params,
    );
    quebras.push({ chave: campo.chave, rotulo: campo.rotulo, linhas });
  }

  const total = Number(totais?.total ?? 0);
  const avaliados = Number(totais?.avaliados ?? 0);

  res.json({
    processo: contexto.processo,
    campo_soma: campoSoma ? { chave: campoSoma.chave, rotulo: campoSoma.rotulo } : null,
    totais: {
      total,
      avaliados,
      pendentes: Number(totais?.pendentes ?? 0),
      homologadas: Number(totais?.homologadas ?? 0),
      desligados_base: Number(totais?.desligados_base ?? 0),
      custo_total: Number(totais?.custo_total ?? 0),
      custo_reducao: Number(totais?.custo_reducao ?? 0),
      percentual: total ? Math.round((avaliados / total) * 100) : 0,
    },
    acoes: contexto.acoes.filter((acao) => acao.ativo).map((acao) => {
      const linha = porAcao.find((item) => item.acao === acao.valor);
      return { valor: acao.valor, cor: acao.cor, total: Number(linha?.total ?? 0), custo: Number(linha?.custo ?? 0) };
    }).concat([{
      valor: 'Sem decisão',
      cor: 'pendente',
      total: Number(porAcao.find((item) => item.acao === null)?.total ?? 0),
      custo: Number(porAcao.find((item) => item.acao === null)?.custo ?? 0),
    }]),
    por_diretoria: porDiretoria,
    por_divisao: porDivisao,
    por_gestor: porGestor,
    quebras,
  });
}));
