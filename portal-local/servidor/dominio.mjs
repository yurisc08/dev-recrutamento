/**
 * Regras do processo — as mesmas da versão em nuvem.
 *
 * Aqui não tem SQL: são as conversões de valor, os alertas (que avisam, nunca
 * decidem) e as validações de decisão. Quem chama é a camada de rotas.
 */

export class ErroApi extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

export const semAcento = (texto) =>
  String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export function paraNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/[R$\s ]/gi, '');
  if (!texto) return null;
  if (/,\d{1,2}$/.test(texto)) texto = texto.replace(/\./g, '').replace(',', '.');
  else texto = texto.replace(/,/g, '');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export function paraDataISO(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}`;
  }
  return null;
}

export function converter(valor, campo) {
  const bruto = typeof valor === 'string' ? valor.trim() : valor;
  if (bruto === '' || bruto === null || bruto === undefined) return { valor: null };
  switch (campo.tipo) {
    case 'numero':
    case 'moeda': {
      const numero = paraNumero(bruto);
      if (numero === null) return { valor: null, erro: `"${campo.rotulo}" deve ser numérico.` };
      return { valor: numero };
    }
    case 'data': {
      const data = paraDataISO(bruto);
      if (!data) return { valor: null, erro: `"${campo.rotulo}" deve ser uma data válida.` };
      return { valor: data };
    }
    case 'booleano': {
      const texto = semAcento(bruto);
      if (['sim', 's', 'true', '1', 'x'].includes(texto)) return { valor: true };
      if (['nao', 'n', 'false', '0'].includes(texto)) return { valor: false };
      return { valor: null, erro: `"${campo.rotulo}" deve ser Sim ou Não.` };
    }
    case 'lista': {
      const opcoes = campo.opcoes ?? [];
      if (opcoes.length === 0) return { valor: String(bruto) };
      const achado = opcoes.find((o) => semAcento(o) === semAcento(bruto));
      if (!achado) return { valor: null, erro: `"${String(bruto)}" não é opção válida de "${campo.rotulo}".` };
      return { valor: achado };
    }
    default:
      return { valor: String(bruto) };
  }
}

/** Alertas: só avisam. Nenhuma regra decide nada por ninguém. */
export function avaliarAlertas(dados, regras) {
  const hoje = new Date().toISOString().slice(0, 10);
  return regras
    .filter((regra) => {
      if (!regra.ativo) return false;
      const valor = dados[regra.campo];
      const vazio = valor === null || valor === undefined || String(valor).trim() === '';
      switch (regra.operador) {
        case 'preenchido': return !vazio;
        case 'vazio': return vazio;
        case 'igual': return semAcento(valor) === semAcento(regra.valor);
        case 'diferente': return !vazio && semAcento(valor) !== semAcento(regra.valor);
        case 'contem': return !vazio && semAcento(valor).includes(semAcento(regra.valor));
        case 'data_futura': return !vazio && String(valor).slice(0, 10) >= hoje;
        case 'data_passada': return !vazio && String(valor).slice(0, 10) < hoje;
        default: return false;
      }
    })
    .map((regra) => ({
      regra: regra.nome,
      mensagem: regra.mensagem,
      severidade: regra.severidade,
      exige_justificativa: regra.exige_justificativa,
      aplica_acao: regra.aplica_acao,
    }));
}

export function validarAvaliacao(entrada, contexto) {
  if (entrada.acao === null) return;
  const configurada = contexto.acoes.find((a) => a.valor === entrada.acao && a.ativo);
  if (!configurada) {
    const disponiveis = contexto.acoes.filter((a) => a.ativo).map((a) => a.valor).join(', ');
    throw new ErroApi(422, `Ação inválida. Opções disponíveis: ${disponiveis}.`);
  }

  const semJustificativa = !entrada.justificativa || entrada.justificativa.trim() === '';
  const campoJust = contexto.campos.find((c) => c.chave === 'justificativa');
  const alertaExige = contexto.alertas.some(
    (a) => a.exige_justificativa && (a.aplica_acao === null || a.aplica_acao === entrada.acao),
  );
  if (semJustificativa && (configurada.exige_justificativa || campoJust?.obrigatorio || alertaExige)) {
    throw new ErroApi(422, alertaExige
      ? 'Este colaborador possui alerta que exige justificativa para esta ação.'
      : `A ação "${entrada.acao}" exige o preenchimento da justificativa.`);
  }
  if (configurada.exige_destino && !entrada.nova_diretoria_id && !(entrada.destino && entrada.destino.trim())) {
    throw new ErroApi(422, `A ação "${entrada.acao}" exige a indicação do destino (nova Diretoria ou setor).`);
  }
}

/** Gestor responde por quem está sob ele; diretor, pela Diretoria dele. */
export function dentroDoEscopo(usuario, colaborador) {
  if (usuario.perfil === 'admin') return true;
  if (usuario.perfil === 'diretor') {
    return colaborador.diretoria_id !== null && usuario.diretorias.includes(colaborador.diretoria_id);
  }
  if (colaborador.responsavel_id && colaborador.responsavel_id === usuario.id) return true;
  return colaborador.divisao_id !== null && usuario.divisoes.includes(colaborador.divisao_id);
}

const NIVEL = { gestor: 1, diretor: 2, admin: 3 };
const EXIGIDO = { ninguem: 9, gestor: 1, diretor: 2, admin: 3 };

export function podeEditarCampo(usuario, campo) {
  if (campo.somente_leitura && usuario.perfil !== 'admin') return false;
  return NIVEL[usuario.perfil] >= (EXIGIDO[campo.editavel_por] ?? 9);
}

export function exigirPerfil(usuario, ...perfis) {
  if (!usuario) throw new ErroApi(401, 'Sessão expirada. Faça login novamente.');
  if (!perfis.includes(usuario.perfil)) throw new ErroApi(403, 'Você não tem permissão para esta operação.');
  return usuario;
}

/**
 * Fragmento de SQL que limita o que cada perfil enxerga. Fica no banco, não na
 * tela: mesmo quem chamasse a API direto não veria além do que pode.
 */
export function escopoSql(usuario, prefixo = 'c') {
  if (usuario.perfil === 'admin') return { sql: '1 = 1', params: [] };
  if (usuario.perfil === 'diretor') {
    if (!usuario.diretorias.length) return { sql: '1 = 0', params: [] };
    return {
      sql: `${prefixo}.diretoria_id IN (${usuario.diretorias.map(() => '?').join(', ')})`,
      params: [...usuario.diretorias],
    };
  }
  if (!usuario.divisoes.length) return { sql: `${prefixo}.responsavel_id = ?`, params: [usuario.id] };
  return {
    sql: `(${prefixo}.responsavel_id = ? OR ${prefixo}.divisao_id IN (${usuario.divisoes.map(() => '?').join(', ')}))`,
    params: [usuario.id, ...usuario.divisoes],
  };
}
