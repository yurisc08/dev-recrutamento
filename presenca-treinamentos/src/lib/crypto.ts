const encoder = new TextEncoder();

const PBKDF2_ITERATIONS = 100_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function base64UrlEncode(value: string | Uint8Array): string {
  const bytes = typeof value === 'string' ? encoder.encode(value) : value;
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlDecodeToString(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(fromBase64(padded + '='.repeat((4 - (padded.length % 4)) % 4)));
}

export function randomId(prefix = ''): string {
  return prefix + crypto.randomUUID().replace(/-/g, '');
}

/** Chave de ingestao entregue ao leitor de cracha. So e exibida uma vez. */
export function generateDeviceKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return 'dev_' + base64UrlEncode(bytes);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iterations, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2') return false;
  const computed = await pbkdf2(password, fromBase64(salt), Number(iterations));
  return timingSafeEqual(toBase64(computed), hash);
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hmacSign(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}
