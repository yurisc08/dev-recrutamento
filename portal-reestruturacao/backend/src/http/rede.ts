/**
 * Lista de IPs autorizados.
 *
 * Quando o portal fica hospedado fora da empresa, esta é a trava que devolve
 * o perímetro: mesmo com o endereço público, só responde a quem vem da rede
 * corporativa (ou da VPN). Vazio = aberto a qualquer origem — aceitável só
 * enquanto a base for fictícia.
 */
export interface FiltroIp {
  ativo: boolean;
  permitido: (ip: string) => boolean;
  regras: string[];
}

function ipv4ParaNumero(ip: string): number | null {
  const partes = ip.trim().split('.');
  if (partes.length !== 4) return null;
  let valor = 0;
  for (const parte of partes) {
    const octeto = Number(parte);
    if (!Number.isInteger(octeto) || octeto < 0 || octeto > 255) return null;
    valor = (valor * 256) + octeto;
  }
  return valor >>> 0;
}

function normalizarIp(ip: string): string {
  const limpo = ip.trim().toLowerCase();
  // Endereços IPv4 encapsulados em IPv6 (::ffff:10.0.0.1) chegam assim atrás de proxy.
  const encapsulado = limpo.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  return encapsulado ? encapsulado[1] : limpo;
}

export function criarFiltroIp(lista: string | undefined): FiltroIp {
  const regras = String(lista ?? '')
    .split(',')
    .map((regra) => regra.trim())
    .filter(Boolean);

  if (regras.length === 0) {
    return { ativo: false, permitido: () => true, regras: [] };
  }

  const faixas: Array<{ base: number; mascara: number }> = [];
  const exatos = new Set<string>();

  for (const regra of regras) {
    const [endereco, bits] = regra.split('/');
    const base = ipv4ParaNumero(endereco);
    if (base !== null) {
      const prefixo = bits === undefined ? 32 : Number(bits);
      if (!Number.isInteger(prefixo) || prefixo < 0 || prefixo > 32) continue;
      const mascara = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
      faixas.push({ base: (base & mascara) >>> 0, mascara });
    } else {
      exatos.add(normalizarIp(regra));
    }
  }

  return {
    ativo: true,
    regras,
    permitido(ip: string): boolean {
      const alvo = normalizarIp(ip);
      if (exatos.has(alvo)) return true;
      const numero = ipv4ParaNumero(alvo);
      if (numero === null) return false;
      return faixas.some((faixa) => ((numero & faixa.mascara) >>> 0) === faixa.base);
    },
  };
}
