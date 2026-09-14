import { Router } from 'express';
import { consultar } from '../db/pool.js';
import { Construtor } from '../db/construtor.js';
import { rota } from '../http/erros.js';
import { exigirPerfil } from '../http/auth.js';

export const rotasAuditoria = Router();

rotasAuditoria.use(exigirPerfil('admin', 'diretor'));

/** Consulta da trilha. Nenhuma rota altera ou remove registros de auditoria. */
rotasAuditoria.get('/', rota(async (req, res) => {
  const construtor = new Construtor();
  const condicoes = ['true'];
  if (req.query.chapa) condicoes.push(`a.chapa = ${construtor.p(String(req.query.chapa))}`);
  if (req.query.tipo) condicoes.push(`a.tipo = ${construtor.p(String(req.query.tipo))}`);
  if (req.query.usuario) condicoes.push(`a.usuario_nome ILIKE ${construtor.p(`%${String(req.query.usuario)}%`)}`);
  if (req.query.desde) condicoes.push(`a.criado_em >= ${construtor.p(String(req.query.desde))}`);
  if (req.query.ate) condicoes.push(`a.criado_em <= ${construtor.p(`${String(req.query.ate)} 23:59:59`)}`);

  const limite = Math.min(Number(req.query.limite) || 300, 2000);
  const itens = await consultar(
    `SELECT a.*, c.nome AS colaborador_nome
       FROM auditoria a
       LEFT JOIN colaboradores c ON c.id::text = a.entidade_id AND a.entidade = 'colaborador'
      WHERE ${condicoes.join(' AND ')}
      ORDER BY a.criado_em DESC, a.id DESC
      LIMIT ${construtor.p(limite)}`,
    construtor.params,
  );
  res.json({ itens });
}));

rotasAuditoria.get('/importacoes', rota(async (_req, res) => {
  const itens = await consultar(
    `SELECT i.*, u.nome AS usuario FROM importacoes i
       LEFT JOIN usuarios u ON u.id = i.usuario_id
      ORDER BY i.criado_em DESC LIMIT 100`,
  );
  res.json({ itens });
}));

rotasAuditoria.get('/acessos', exigirPerfil('admin'), rota(async (_req, res) => {
  const itens = await consultar(
    'SELECT usuario, ip, sucesso, criado_em FROM tentativas_login ORDER BY criado_em DESC LIMIT 300',
  );
  res.json({ itens });
}));
