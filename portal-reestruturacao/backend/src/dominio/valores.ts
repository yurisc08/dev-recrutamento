import type { Campo, TipoCampo } from './tipos.js';

/** Normaliza texto (sem acento, minúsculo) para comparar cabeçalhos e chaves. */
export function normalizar(texto: unknown): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function chaveDeRotulo(rotulo: string): string {
  const base = normalizar(rotulo)
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'campo';
}

export function paraDataISO(valor: unknown): string | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    const ms = Math.round((valor - 25569) * 86400 * 1000);
    const data = new Date(ms);
    return Number.isNaN(data.getTime()) ? null : data.toISOString().slice(0, 10);
  }
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

export function paraNumero(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  let texto = String(valor).trim().replace(/[R$\s ]/gi, '');
  if (!texto) return null;
  if (/,\d{1,2}$/.test(texto)) texto = texto.replace(/\./g, '').replace(',', '.');
  else texto = texto.replace(/,/g, '');
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
}

export interface Convertido {
  valor: string | number | boolean | null;
  erro?: string;
}

/** Converte um valor cru (planilha ou formulário) para o tipo declarado do campo. */
export function converter(valor: unknown, campo: Pick<Campo, 'tipo' | 'rotulo' | 'opcoes'>): Convertido {
  const bruto = typeof valor === 'string' ? valor.trim() : valor;
  if (bruto === '' || bruto === null || bruto === undefined) return { valor: null };

  switch (campo.tipo as TipoCampo) {
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
      const texto = normalizar(bruto);
      if (['sim', 's', 'true', '1', 'x', 'verdadeiro'].includes(texto)) return { valor: true };
      if (['nao', 'n', 'false', '0', 'falso'].includes(texto)) return { valor: false };
      return { valor: null, erro: `"${campo.rotulo}" deve ser Sim ou Não.` };
    }
    case 'lista': {
      const opcoes = campo.opcoes ?? [];
      if (opcoes.length === 0) return { valor: String(bruto) };
      const achado = opcoes.find((opcao) => normalizar(opcao) === normalizar(bruto));
      if (!achado) return { valor: null, erro: `"${String(bruto)}" não é opção válida de "${campo.rotulo}".` };
      return { valor: achado };
    }
    default:
      return { valor: String(bruto) };
  }
}

export function formatarBR(valor: unknown, tipo: TipoCampo): string {
  if (valor === null || valor === undefined || valor === '') return '';
  if (tipo === 'data') {
    const partes = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : String(valor);
  }
  if (tipo === 'moeda') {
    const numero = Number(valor);
    return Number.isFinite(numero)
      ? numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : String(valor);
  }
  if (tipo === 'booleano') return valor ? 'Sim' : 'Não';
  return String(valor);
}
