export function dataBR(valor?: string | null): string {
  if (!valor) return '';
  const partes = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : String(valor);
}

export function dataHoraBR(valor?: string | Date | null): string {
  if (!valor) return '';
  const data = new Date(valor);
  return Number.isNaN(data.getTime())
    ? String(valor)
    : data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function moedaBR(valor: number | string | null | undefined, casas = 0): string {
  const numero = Number(valor ?? 0);
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: casas });
}

export function numeroBR(valor: number | string | null | undefined): string {
  return Number(valor ?? 0).toLocaleString('pt-BR');
}

export function formatarCampo(valor: unknown, tipo: string): string {
  if (valor === null || valor === undefined || valor === '') return '';
  switch (tipo) {
    case 'data': return dataBR(String(valor));
    case 'moeda': return moedaBR(Number(valor), 2);
    case 'numero': return numeroBR(Number(valor));
    case 'booleano': return valor ? 'Sim' : 'Não';
    default: return String(valor);
  }
}

const CORES: Record<string, string> = {
  desligamento: 'var(--desligamento)',
  transferencia: 'var(--transferencia)',
  manter: 'var(--manter)',
  pendente: 'var(--pendente)',
  atencao: 'var(--atencao)',
};

export function corDaAcao(cor?: string | null): string {
  return CORES[cor ?? ''] ?? 'var(--extra)';
}

export function classeSelo(cor?: string | null): string {
  return ['desligamento', 'transferencia', 'manter', 'pendente', 'atencao'].includes(cor ?? '')
    ? `selo-${cor}`
    : 'selo-neutra';
}

export function diasAte(data?: string | null): number | null {
  if (!data) return null;
  return Math.ceil((new Date(`${data}T23:59:59`).getTime() - Date.now()) / 86400000);
}
