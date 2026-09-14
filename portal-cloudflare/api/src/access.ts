/**
 * Verificação do crachá do Cloudflare Access.
 *
 * O Access já barra quem não passou pelo login corporativo, mas o Worker
 * confere a assinatura do token na entrada: assim, mesmo que alguém
 * descubra a URL do Worker e tente falar direto com ele, sem o crachá
 * válido não entra.
 */
interface ChaveJwk extends JsonWebKey {
  kid?: string;
}

interface CacheChaves {
  chaves: Map<string, CryptoKey>;
  buscadoEm: number;
}

const cachePorDominio = new Map<string, CacheChaves>();
const VALIDADE_CACHE = 30 * 60 * 1000;

const base64urlParaBytes = (texto: string): Uint8Array => {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=');
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
};

const decodificarJson = (parte: string): Record<string, unknown> =>
  JSON.parse(new TextDecoder().decode(base64urlParaBytes(parte)));

async function carregarChaves(dominio: string, buscar: typeof fetch): Promise<Map<string, CryptoKey>> {
  const cache = cachePorDominio.get(dominio);
  if (cache && Date.now() - cache.buscadoEm < VALIDADE_CACHE) return cache.chaves;

  const resposta = await buscar(`https://${dominio}/cdn-cgi/access/certs`);
  if (!resposta.ok) throw new Error('Não foi possível obter as chaves do Cloudflare Access.');
  const corpo = (await resposta.json()) as { keys?: ChaveJwk[] };

  const chaves = new Map<string, CryptoKey>();
  for (const jwk of corpo.keys ?? []) {
    if (!jwk.kid) continue;
    const chave = await crypto.subtle.importKey(
      'jwk',
      { ...jwk, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    chaves.set(jwk.kid, chave);
  }
  cachePorDominio.set(dominio, { chaves, buscadoEm: Date.now() });
  return chaves;
}

export interface ResultadoAccess {
  valido: boolean;
  motivo?: string;
  email?: string;
}

export async function validarAccess(
  token: string | null,
  dominio: string,
  audienciaEsperada: string,
  buscar: typeof fetch = fetch,
): Promise<ResultadoAccess> {
  if (!token) return { valido: false, motivo: 'Crachá do Cloudflare Access ausente.' };
  const partes = token.split('.');
  if (partes.length !== 3) return { valido: false, motivo: 'Crachá do Access malformado.' };

  try {
    const cabecalho = decodificarJson(partes[0]) as { kid?: string; alg?: string };
    if (cabecalho.alg !== 'RS256') return { valido: false, motivo: 'Algoritmo do crachá não suportado.' };

    const chaves = await carregarChaves(dominio, buscar);
    const chave = cabecalho.kid ? chaves.get(cabecalho.kid) : undefined;
    if (!chave) return { valido: false, motivo: 'Chave do crachá desconhecida.' };

    const assinado = new TextEncoder().encode(`${partes[0]}.${partes[1]}`);
    const assinatura = base64urlParaBytes(partes[2]);
    const confere = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      chave,
      assinatura as unknown as BufferSource,
      assinado as unknown as BufferSource,
    );
    if (!confere) return { valido: false, motivo: 'Assinatura do crachá inválida.' };

    const dados = decodificarJson(partes[1]) as { aud?: string | string[]; exp?: number; email?: string; iss?: string };
    const agora = Math.floor(Date.now() / 1000);
    if (typeof dados.exp === 'number' && dados.exp < agora) return { valido: false, motivo: 'Crachá do Access expirado.' };
    if (audienciaEsperada) {
      const audiencias = Array.isArray(dados.aud) ? dados.aud : [dados.aud];
      if (!audiencias.includes(audienciaEsperada)) return { valido: false, motivo: 'Crachá emitido para outra aplicação.' };
    }
    if (dados.iss && !dados.iss.includes(dominio)) return { valido: false, motivo: 'Emissor do crachá inesperado.' };

    return { valido: true, email: dados.email };
  } catch (erro) {
    return { valido: false, motivo: (erro as Error).message };
  }
}
