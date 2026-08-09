/*
 * shared/hash.js
 * -----------------------------------------------------------------------------
 * Guarda de códigos de acesso.
 *
 * O código nunca é gravado. O que fica no banco é o resultado de SHA-256 sobre
 * "sal + código": dá para conferir quem digitou o código certo, mas não dá para
 * descobrir o código a partir do arquivo. Quem abrir o data/db.json não
 * consegue entrar no lugar de ninguém.
 *
 * Por isso um código perdido não é "consultado", é **substituído**: gera-se um
 * novo e reenvia-se por e-mail.
 *
 * A implementação de SHA-256 é feita aqui, em JavaScript puro, para que o
 * navegador (modo local, sem servidor) e o Node cheguem exatamente ao mesmo
 * resultado. No servidor, usamos o módulo nativo, que é mais rápido — o
 * resultado é idêntico, é o mesmo algoritmo.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Hash = api; Object.assign(root, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

/* ------------------------------- SHA-256 --------------------------------- */
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

/* Texto UTF-8 em bytes, sem depender de TextEncoder. */
function utf8Bytes(text) {
  const out = [];
  for (const char of String(text)) {
    let code = char.codePointAt(0);
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return out;
}

function sha256(text) {
  const bytes = utf8Bytes(text);
  const bitLength = bytes.length * 8;

  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);

  // Comprimento em 64 bits, big-endian. Textos aqui são curtos, então os
  // 32 bits altos são sempre zero.
  bytes.push(0, 0, 0, 0, (bitLength >>> 24) & 255, (bitLength >>> 16) & 255, (bitLength >>> 8) & 255, bitLength & 255);

  let [h0, h1, h2, h3, h4, h5, h6, h7] =
    [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

  const w = new Array(64);

  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      w[t] = (bytes[i + t * 4] << 24) | (bytes[i + t * 4 + 1] << 16) | (bytes[i + t * 4 + 2] << 8) | bytes[i + t * 4 + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(w[t - 15], 7) ^ rotr(w[t - 15], 18) ^ (w[t - 15] >>> 3);
      const s1 = rotr(w[t - 2], 17) ^ rotr(w[t - 2], 19) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = [h0, h1, h2, h3, h4, h5, h6, h7];

    for (let t = 0; t < 64; t++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g; g = f; f = e; e = (d + temp1) | 0;
      d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map(n => (n >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/* No servidor, o módulo nativo faz o mesmo cálculo mais rápido. */
let digest = sha256;
if (typeof module !== 'undefined' && module.exports) {
  try {
    const crypto = require('node:crypto');
    digest = text => crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
  } catch { /* segue com a implementação em JavaScript */ }
}

/* ------------------------------ Uso na ferramenta ------------------------ */
/* Códigos são comparados sem hífen, espaço ou maiúsculas — igual à digitação
 * tolerante da tela de entrada. */
const canonical = code => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function hashCode(code, salt) {
  return digest(`${salt}:${canonical(code)}`);
}

function newSalt(random = randomHex) {
  return random(16);
}

/* Guarda pronta para gravar: { salt, hash }, sem o código em lugar nenhum. */
function protect(code, random = randomHex) {
  const salt = newSalt(random);
  return { codeSalt: salt, codeHash: hashCode(code, salt) };
}

/* Confere o código digitado contra um registro protegido. */
function matches(record, code) {
  if (!record || !record.codeHash || !record.codeSalt) return false;
  if (!canonical(code)) return false;
  return hashCode(code, record.codeSalt) === record.codeHash;
}

/* Aleatoriedade: no servidor vem do módulo nativo; no navegador, do crypto do
 * próprio navegador. Math.random só entraria em cenário sem nenhum dos dois. */
function randomHex(bytes) {
  if (typeof module !== 'undefined' && module.exports) {
    try { return require('node:crypto').randomBytes(bytes).toString('hex'); } catch { /* abaixo */ }
  }
  if (typeof globalThis !== 'undefined' && globalThis.crypto && globalThis.crypto.getRandomValues) {
    const buffer = new Uint8Array(bytes);
    globalThis.crypto.getRandomValues(buffer);
    return Array.from(buffer, b => b.toString(16).padStart(2, '0')).join('');
  }
  return Array.from({ length: bytes }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join('');
}

/* Só para a tela: mostra o formato sem revelar nada. */
function maskFor(role) {
  const prefixo = { hr: 'CR', approver: 'AP', manager: 'DC' }[role] || 'DC';
  return `${prefixo}-••••-••••`;
}

return { sha256, hashCode, protect, matches, maskFor, canonical, randomHex };

});
