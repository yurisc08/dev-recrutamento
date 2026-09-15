/** Leituras que quase toda rota precisa: processo, catálogo de campos, ações e regras. */
import { agora, normalizar } from './banco.mjs';

export function carregarContexto(acesso) {
  const processo = acesso.primeiro('SELECT * FROM processos WHERE ativo = 1 ORDER BY id LIMIT 1');
  if (!processo) throw new Error('Nenhum processo cadastrado.');
  return {
    processo: {
      id: processo.id,
      nome: processo.nome,
      data_base: processo.data_base,
      prazo: processo.prazo,
      aviso_confidencialidade: processo.aviso_confidencialidade,
    },
    campos: acesso.consultar('SELECT * FROM campos WHERE processo_id = ? ORDER BY ordem, id', processo.id),
    acoes: acesso.consultar('SELECT * FROM acoes WHERE processo_id = ? ORDER BY ordem, id', processo.id),
    regras: acesso.consultar('SELECT * FROM regras WHERE processo_id = ? ORDER BY ordem, id', processo.id),
  };
}

export function carregarUsuario(acesso, id) {
  const usuario = acesso.primeiro(
    'SELECT id, usuario, nome, email, perfil, trocar_senha FROM usuarios WHERE id = ? AND ativo = 1', id);
  if (!usuario) return null;
  return {
    ...usuario,
    diretorias: acesso.consultar('SELECT diretoria_id FROM usuario_diretorias WHERE usuario_id = ?', id)
      .map((d) => d.diretoria_id),
    divisoes: acesso.consultar('SELECT divisao_id FROM usuario_divisoes WHERE usuario_id = ?', id)
      .map((d) => d.divisao_id),
  };
}

const DESCRICAO = { admin: 'RH / Administrador', diretor: 'Diretor', gestor: 'Gestor' };

/** O que a interface usa para montar menus, filtros e permissões. */
export function contextoDoUsuario(acesso, usuario) {
  const { processo, campos, acoes, regras } = carregarContexto(acesso);

  const diretorias = acesso.consultar(
    'SELECT id, nome FROM diretorias WHERE processo_id = ? AND ativo = 1 ORDER BY nome', processo.id);
  const divisoes = acesso.consultar(`
    SELECT d.id, d.nome, d.diretoria_id FROM divisoes d
      JOIN diretorias dir ON dir.id = d.diretoria_id
     WHERE dir.processo_id = ? AND d.ativo = 1 ORDER BY d.nome`, processo.id);

  const minhasDiretorias = usuario.perfil === 'admin' ? diretorias
    : usuario.perfil === 'diretor' ? diretorias.filter((d) => usuario.diretorias.includes(d.id))
      : diretorias.filter((d) => divisoes.some((v) => usuario.divisoes.includes(v.id) && v.diretoria_id === d.id));
  const minhasDivisoes = usuario.perfil === 'gestor' ? divisoes.filter((d) => usuario.divisoes.includes(d.id))
    : usuario.perfil === 'diretor' ? divisoes.filter((d) => usuario.diretorias.includes(d.diretoria_id))
      : divisoes;

  // Campos sensíveis (CPF, nascimento) não saem da API para quem não é RH.
  const camposVisiveis = usuario.perfil === 'admin' ? campos : campos.filter((c) => !c.sensivel);

  return {
    usuario: {
      id: usuario.id, usuario: usuario.usuario, nome: usuario.nome, email: usuario.email,
      perfil: usuario.perfil, perfil_descricao: DESCRICAO[usuario.perfil] ?? usuario.perfil,
    },
    permissoes: {
      administrar: usuario.perfil === 'admin',
      gerir_gestores: usuario.perfil !== 'gestor',
      homologar: usuario.perfil !== 'gestor',
      avaliar: true,
      importar: usuario.perfil === 'admin',
      exportar: true,
      ver_auditoria: usuario.perfil !== 'gestor',
    },
    processo,
    campos: camposVisiveis,
    acoes: acoes.filter((a) => a.ativo),
    regras: usuario.perfil === 'admin' ? regras : [],
    diretorias: minhasDiretorias,
    divisoes: minhasDivisoes,
    todas_diretorias: minhasDiretorias,
    todas_divisoes: minhasDivisoes,
  };
}

/** Trilha de auditoria: só entra, nunca sai (o banco recusa alterar e apagar). */
export function auditar(acesso, evento) {
  acesso.executar(`
    INSERT INTO auditoria (usuario_id, usuario_nome, perfil, tipo, entidade, entidade_id, chapa, campo,
                           valor_anterior, valor_novo, detalhes, ip, criado_em)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    evento.usuario?.id ?? null,
    evento.usuario?.nome ?? null,
    evento.usuario?.perfil ?? null,
    evento.tipo,
    evento.entidade ?? null,
    evento.entidadeId === undefined || evento.entidadeId === null ? null : String(evento.entidadeId),
    evento.chapa ?? null,
    evento.campo ?? null,
    texto(evento.valorAnterior),
    texto(evento.valorNovo),
    evento.detalhes ? JSON.stringify(evento.detalhes) : null,
    evento.ip ?? null,
    agora(),
  );
}

const texto = (valor) => {
  if (valor === null || valor === undefined) return null;
  return typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
};

export { normalizar };
