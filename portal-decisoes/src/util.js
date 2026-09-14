'use strict';

/** Remove acentos, espaços e pontuação — usado para gerar chaves de coluna e casar cabeçalhos do Excel. */
function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function chaveDeRotulo(rotulo) {
  const base = normalizar(rotulo)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'coluna';
}

/** Data ISO (YYYY-MM-DD) a partir de string BR, ISO ou Date/serial do Excel. */
function paraDataISO(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !isNaN(valor)) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    // Serial do Excel (1900-based, com o bug do ano bissexto de 1900).
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return isNaN(d) ? null : d.toISOString().slice(0, 10);
  }
  const texto = String(valor).trim();
  let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const ano = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return null;
}

function paraNumero(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/[R$\s ]/gi, '');
  if (texto === '') return null;
  // 1.234,56 -> 1234.56 ; 1,234.56 -> 1234.56
  if (/,\d{1,2}$/.test(texto)) texto = texto.replace(/\./g, '').replace(',', '.');
  else texto = texto.replace(/,/g, '');
  const n = Number(texto);
  return Number.isFinite(n) ? n : null;
}

function agora() {
  return new Date().toISOString();
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

/** Converte o valor recebido para o tipo declarado da coluna. Devolve { valor, erro }. */
function converterParaTipo(valor, coluna) {
  const bruto = typeof valor === 'string' ? valor.trim() : valor;
  if (bruto === '' || bruto === null || bruto === undefined) return { valor: null };
  switch (coluna.tipo) {
    case 'numero':
    case 'moeda': {
      const n = paraNumero(bruto);
      if (n === null) return { valor: null, erro: `"${coluna.rotulo}" deve ser numérico.` };
      return { valor: n };
    }
    case 'data': {
      const d = paraDataISO(bruto);
      if (!d) return { valor: null, erro: `"${coluna.rotulo}" deve ser uma data válida.` };
      return { valor: d };
    }
    case 'booleano': {
      const t = normalizar(bruto);
      if (['sim', 's', 'true', '1', 'x', 'verdadeiro'].includes(t)) return { valor: 1 };
      if (['nao', 'n', 'false', '0', '', 'falso'].includes(t)) return { valor: 0 };
      return { valor: null, erro: `"${coluna.rotulo}" deve ser Sim ou Não.` };
    }
    case 'lista': {
      const opcoes = coluna.opcoes || [];
      if (opcoes.length === 0) return { valor: String(bruto) };
      const achado = opcoes.find((o) => normalizar(o) === normalizar(bruto));
      if (!achado) {
        return { valor: null, erro: `"${bruto}" não é uma opção válida de "${coluna.rotulo}".` };
      }
      return { valor: achado };
    }
    default:
      return { valor: String(bruto) };
  }
}

function formatarBR(valor, tipo) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (tipo === 'data') {
    const m = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(valor);
  }
  if (tipo === 'moeda') {
    const n = Number(valor);
    return Number.isFinite(n)
      ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : String(valor);
  }
  if (tipo === 'booleano') return Number(valor) ? 'Sim' : 'Não';
  return String(valor);
}

class ErroHttp extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Envolve handlers async para que rejeições cheguem no middleware de erro do Express 4. */
const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = {
  normalizar, chaveDeRotulo, paraDataISO, paraNumero, agora, hoje,
  converterParaTipo, formatarBR, ErroHttp, rota,
};
