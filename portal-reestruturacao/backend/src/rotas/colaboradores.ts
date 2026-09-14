import { Router } from 'express';
import { ErroHttp, rota } from '../http/erros.js';
import { exigirPerfil } from '../http/auth.js';
import { carregarContexto } from '../servicos/processo.js';
import * as servico from '../servicos/colaboradores.js';
import { consultar } from '../db/pool.js';

export const rotasColaboradores = Router();

function numero(valor: unknown): number | undefined {
  const convertido = Number(valor);
  return Number.isFinite(convertido) && convertido > 0 ? convertido : undefined;
}

rotasColaboradores.get('/', rota(async (req, res) => {
  const contexto = await carregarContexto();
  const camposFiltro: Record<string, string> = {};
  for (const [chave, valor] of Object.entries(req.query)) {
    if (chave.startsWith('f_') && typeof valor === 'string') camposFiltro[chave.slice(2)] = valor;
  }

  const resultado = await servico.listar(
    req.usuario!,
    {
      busca: typeof req.query.busca === 'string' ? req.query.busca : undefined,
      diretoria_id: numero(req.query.diretoria_id),
      divisao_id: numero(req.query.divisao_id),
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      acao: typeof req.query.acao === 'string' ? req.query.acao : undefined,
      com_alerta: req.query.com_alerta === '1',
      campos: camposFiltro,
      ordenar: typeof req.query.ordenar === 'string' ? req.query.ordenar : undefined,
      direcao: req.query.direcao === 'desc' ? 'desc' : 'asc',
      pagina: numero(req.query.pagina),
      por_pagina: numero(req.query.por_pagina),
    },
    contexto,
  );
  res.json(resultado);
}));

rotasColaboradores.get('/:id', rota(async (req, res) => {
  const contexto = await carregarContexto();
  res.json(await servico.buscar(req.usuario!, Number(req.params.id), contexto));
}));

rotasColaboradores.get('/:id/historico', rota(async (req, res) => {
  const contexto = await carregarContexto();
  const item = await servico.buscar(req.usuario!, Number(req.params.id), contexto);
  const itens = await consultar(
    `SELECT id, usuario_nome, perfil, tipo, campo, valor_anterior, valor_novo, criado_em
       FROM auditoria WHERE entidade = 'colaborador' AND entidade_id = $1
      ORDER BY criado_em DESC, id DESC LIMIT 200`,
    [String(item.id)],
  );
  res.json({ itens });
}));

rotasColaboradores.patch('/:id', rota(async (req, res) => {
  const item = await servico.salvar(req, req.usuario!, Number(req.params.id), req.body ?? {});
  res.json(item);
}));

rotasColaboradores.post('/homologar', exigirPerfil('admin', 'diretor'), rota(async (req, res) => {
  const ids: number[] = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  if (ids.length === 0) throw new ErroHttp(400, 'Selecione ao menos um colaborador.');
  if (ids.length > 500) throw new ErroHttp(400, 'Selecione no máximo 500 colaboradores por vez.');
  const itens = await servico.homologar(req, req.usuario!, ids, req.body?.homologado !== false);
  res.json({ ok: true, itens });
}));
