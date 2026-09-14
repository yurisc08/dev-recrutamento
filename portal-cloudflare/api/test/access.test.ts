import test from 'node:test';
import assert from 'node:assert/strict';
import { validarAccess } from '../src/access.js';

/**
 * O crachá do Cloudflare Access é a primeira porta do portal. Aqui a chave é
 * gerada na hora e o JWKS é servido por um fetch de mentira, para conferir que
 * o Worker aceita só o que deve.
 */
const DOMINIO = 'empresa.cloudflareaccess.com';
const AUDIENCIA = 'aud-de-teste';

const paraBase64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const textoParaBase64url = (texto: string) => paraBase64url(new TextEncoder().encode(texto));

const par = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'chave-1' };

const intruso = await crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['sign', 'verify'],
);

async function montarToken(opcoes: {
  kid?: string;
  alg?: string;
  aud?: string | string[];
  exp?: number;
  iss?: string;
  chave?: CryptoKey;
} = {}) {
  const cabecalho = { alg: opcoes.alg ?? 'RS256', kid: opcoes.kid ?? 'chave-1', typ: 'JWT' };
  const dados = {
    aud: opcoes.aud ?? AUDIENCIA,
    exp: opcoes.exp ?? Math.floor(Date.now() / 1000) + 3600,
    iss: opcoes.iss ?? `https://${DOMINIO}`,
    email: 'pessoa@empresa.com.br',
  };
  const corpo = `${textoParaBase64url(JSON.stringify(cabecalho))}.${textoParaBase64url(JSON.stringify(dados))}`;
  const assinatura = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    opcoes.chave ?? par.privateKey,
    new TextEncoder().encode(corpo),
  );
  return `${corpo}.${paraBase64url(new Uint8Array(assinatura))}`;
}

/** Cada teste usa um domínio próprio para não reaproveitar o cache de chaves. */
let contador = 0;
function ambienteDeTeste() {
  contador += 1;
  const dominio = `t${contador}.${DOMINIO}`;
  const buscar = (async (url: string | URL) => {
    assert.equal(String(url), `https://${dominio}/cdn-cgi/access/certs`);
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { dominio, buscar };
}

test('aceita crachá assinado pela chave publicada', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ iss: `https://${dominio}` });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, true, resultado.motivo);
  assert.equal(resultado.email, 'pessoa@empresa.com.br');
});

test('recusa quando não há crachá', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const resultado = await validarAccess(null, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /ausente/i);
});

test('recusa assinatura de outra chave', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ chave: intruso.privateKey, iss: `https://${dominio}` });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /assinatura/i);
});

test('recusa crachá expirado', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ exp: Math.floor(Date.now() / 1000) - 60, iss: `https://${dominio}` });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /expirado/i);
});

test('recusa crachá emitido para outra aplicação', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ aud: 'outra-aplicacao', iss: `https://${dominio}` });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /outra aplica/i);
});

test('recusa emissor de outro domínio', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ iss: 'https://impostor.exemplo.com' });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /emissor/i);
});

test('recusa algoritmo diferente de RS256 (inclusive "none")', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ alg: 'none', iss: `https://${dominio}` });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /[Aa]lgoritmo/);
});

test('recusa kid desconhecido', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const token = await montarToken({ kid: 'chave-que-nao-existe', iss: `https://${dominio}` });
  const resultado = await validarAccess(token, dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /[Cc]have/);
});

test('recusa token malformado', async () => {
  const { dominio, buscar } = ambienteDeTeste();
  const resultado = await validarAccess('isto-nao-e-um-jwt', dominio, AUDIENCIA, buscar);
  assert.equal(resultado.valido, false);
  assert.match(resultado.motivo ?? '', /malformado/i);
});
