/**
 * Hash de senha com PBKDF2-SHA256 via WebCrypto (o que existe no Workers).
 * Formato: pbkdf2$<iterações>$<sal em hex>$<derivada em hex>.
 */
const ITERACOES = 210000;
const TAMANHO = 32;

const paraHex = (buffer: ArrayBuffer): string =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');

const deHex = (texto: string): Uint8Array =>
  new Uint8Array((texto.match(/.{1,2}/g) ?? []).map((par) => parseInt(par, 16)));

async function derivar(senha: string, sal: Uint8Array, iteracoes: number): Promise<ArrayBuffer> {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal as unknown as BufferSource, iterations: iteracoes, hash: 'SHA-256' },
    chave,
    TAMANHO * 8,
  );
}

export async function gerarHash(senha: string): Promise<string> {
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const derivada = await derivar(senha, sal, ITERACOES);
  return `pbkdf2$${ITERACOES}$${paraHex(sal.buffer)}$${paraHex(derivada)}`;
}

export async function conferirSenha(senha: string, hash: string): Promise<boolean> {
  try {
    const [algoritmo, iteracoes, salHex, chaveHex] = String(hash).split('$');
    if (algoritmo !== 'pbkdf2') return false;
    const derivada = await derivar(senha, deHex(salHex), Number(iteracoes));
    const esperado = deHex(chaveHex);
    const obtido = new Uint8Array(derivada);
    if (esperado.length !== obtido.length) return false;
    // comparação em tempo constante
    let diferenca = 0;
    for (let i = 0; i < esperado.length; i += 1) diferenca |= esperado[i] ^ obtido[i];
    return diferenca === 0;
  } catch {
    return false;
  }
}

export function validarSenha(senha: string): string | null {
  const valor = String(senha ?? '');
  if (valor.length < 10) return 'A senha deve ter ao menos 10 caracteres.';
  if (!/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) return 'A senha deve conter letras e números.';
  return null;
}

/**
 * Convite de primeiro acesso.
 *
 * O portal nunca cria senha por ninguém: gera um convite de uso único, que vale
 * por alguns dias, e a pessoa define a própria senha ao abrir o link. No banco
 * fica só o resumo (SHA-256) do convite — quem tiver acesso ao banco não
 * consegue usá-lo para entrar.
 */
export function novoConvite(): string {
  return [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function resumoConvite(convite: string): Promise<string> {
  const digerido = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(convite)));
  return paraHex(digerido);
}

export function senhaProvisoria(): string {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const numeros = '23456789';
  const sorteio = crypto.getRandomValues(new Uint32Array(12));
  let senha = '';
  for (let i = 0; i < 8; i += 1) senha += letras[sorteio[i] % letras.length];
  for (let i = 8; i < 12; i += 1) senha += numeros[sorteio[i] % numeros.length];
  return senha;
}

export function novoIdSessao(): string {
  return paraHex(crypto.getRandomValues(new Uint8Array(32)).buffer);
}
