/**
 * Certificado próprio do portal (HTTPS na rede interna).
 *
 * Sem TI e sem certificado comprado, a alternativa honesta é esta: o portal
 * gera na primeira execução um certificado dele mesmo, com o IP e o nome da
 * máquina dentro. Daí o tráfego entre o navegador do gestor e o portal vai
 * cifrado — senha e decisão não trafegam em texto puro pela rede.
 *
 * O navegador vai avisar que "não confia" no certificado, porque ele não foi
 * emitido por uma autoridade conhecida. Isso é esperado; o COMECE-AQUI.md
 * explica como confirmar (e, se quiserem, instalar o certificado de uma vez).
 *
 * Tudo aqui é feito com node:crypto — nenhuma dependência externa.
 */
import { generateKeyPairSync, sign } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/* ----------------------------- DER básico ----------------------------- */

function tamanho(bytes) {
  if (bytes < 0x80) return Buffer.from([bytes]);
  const partes = [];
  let resto = bytes;
  while (resto > 0) { partes.unshift(resto & 0xff); resto >>= 8; }
  return Buffer.from([0x80 | partes.length, ...partes]);
}

const tlv = (etiqueta, conteudo) => Buffer.concat([Buffer.from([etiqueta]), tamanho(conteudo.length), conteudo]);

const sequencia = (...partes) => tlv(0x30, Buffer.concat(partes));
const conjunto = (...partes) => tlv(0x31, Buffer.concat(partes));
const contexto = (numero, conteudo, construido = true) =>
  tlv(0x80 | (construido ? 0x20 : 0) | numero, conteudo);

function inteiro(valor) {
  let bytes = typeof valor === 'number'
    ? Buffer.from(valor.toString(16).padStart(2, '0').replace(/^(.(..)*)$/, '0$1'), 'hex')
    : Buffer.from(valor);
  while (bytes.length > 1 && bytes[0] === 0 && (bytes[1] & 0x80) === 0) bytes = bytes.subarray(1);
  if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
  return tlv(0x02, bytes);
}

function oid(texto) {
  const partes = texto.split('.').map(Number);
  const bytes = [partes[0] * 40 + partes[1]];
  for (const parte of partes.slice(2)) {
    const pilha = [];
    let resto = parte;
    do { pilha.unshift(resto & 0x7f); resto >>= 7; } while (resto > 0);
    for (let i = 0; i < pilha.length - 1; i += 1) pilha[i] |= 0x80;
    bytes.push(...pilha);
  }
  return tlv(0x06, Buffer.from(bytes));
}

const nulo = () => tlv(0x05, Buffer.alloc(0));
const octetos = (conteudo) => tlv(0x04, conteudo);
const bits = (conteudo) => tlv(0x03, Buffer.concat([Buffer.from([0]), conteudo]));
const booleano = (valor) => tlv(0x01, Buffer.from([valor ? 0xff : 0x00]));
const utf8 = (texto) => tlv(0x0c, Buffer.from(texto, 'utf8'));

/** UTCTime no formato AAMMDDHHMMSSZ (padrão para datas até 2049). */
function horario(data) {
  const d = (n) => String(n).padStart(2, '0');
  const texto = `${d(data.getUTCFullYear() % 100)}${d(data.getUTCMonth() + 1)}${d(data.getUTCDate())}`
    + `${d(data.getUTCHours())}${d(data.getUTCMinutes())}${d(data.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(texto, 'ascii'));
}

const nome = (pares) => sequencia(...pares.map(([tipo, valor]) => conjunto(sequencia(oid(tipo), utf8(valor)))));

const OID_CN = '2.5.4.3';
const OID_O = '2.5.4.10';
const OID_SHA256_RSA = '1.2.840.113549.1.1.11';
const OID_SAN = '2.5.29.17';
const OID_BASIC = '2.5.29.19';
const OID_KEY_USAGE = '2.5.29.15';
const OID_EXT_KEY_USAGE = '2.5.29.37';
const OID_SERVER_AUTH = '1.3.6.1.5.5.7.3.1';

const ehIPv4 = (texto) => /^\d{1,3}(\.\d{1,3}){3}$/.test(texto);

function alternativos(enderecos) {
  const itens = enderecos.map((endereco) => (ehIPv4(endereco)
    ? contexto(7, Buffer.from(endereco.split('.').map(Number)), false)   // iPAddress
    : contexto(2, Buffer.from(endereco, 'ascii'), false)));              // dNSName
  return sequencia(...itens);
}

const extensao = (identificador, critica, conteudo) =>
  sequencia(oid(identificador), ...(critica ? [booleano(true)] : []), octetos(conteudo));

/**
 * Gera um certificado autoassinado válido por `anos`, cobrindo os endereços
 * indicados (IP da máquina, nome da máquina, localhost).
 */
export function gerarCertificado(enderecos, anos = 3) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const spki = publicKey.export({ type: 'spki', format: 'der' });

  const identidade = nome([[OID_CN, 'Portal de Decisões'], [OID_O, 'Uso interno']]);
  const inicio = new Date(Date.now() - 86400 * 1000);
  const fim = new Date(Date.now() + anos * 365 * 86400 * 1000);
  const algoritmo = sequencia(oid(OID_SHA256_RSA), nulo());

  const extensoes = contexto(3, sequencia(
    extensao(OID_BASIC, true, sequencia(booleano(true))),
    // digitalSignature + keyEncipherment + keyCertSign
    extensao(OID_KEY_USAGE, true, tlv(0x03, Buffer.from([0x01, 0xa4]))),
    extensao(OID_EXT_KEY_USAGE, false, sequencia(oid(OID_SERVER_AUTH))),
    extensao(OID_SAN, false, alternativos(enderecos)),
  ));

  const corpo = sequencia(
    contexto(0, inteiro(2)),                       // versão 3
    inteiro(randomSerial()),                       // número de série aleatório
    algoritmo,
    identidade,
    sequencia(horario(inicio), horario(fim)),
    identidade,
    spki,
    extensoes,
  );

  const assinatura = sign('sha256', corpo, privateKey);
  const certificado = sequencia(corpo, algoritmo, bits(assinatura));

  return {
    chave: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    certificado: paraPem(certificado, 'CERTIFICATE'),
  };
}

function randomSerial() {
  const bytes = Buffer.alloc(16);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[0] &= 0x7f;
  return bytes;
}

function paraPem(der, rotulo) {
  const base64 = der.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${rotulo}-----\n${base64}\n-----END ${rotulo}-----\n`;
}

/**
 * Devolve o par chave/certificado da pasta de dados, gerando na primeira vez ou
 * quando os endereços da máquina mudaram (trocou de IP, por exemplo).
 */
export function obterCertificado(pasta, enderecos) {
  mkdirSync(pasta, { recursive: true });
  const arquivoChave = join(pasta, 'portal-chave.pem');
  const arquivoCert = join(pasta, 'portal-certificado.pem');
  const arquivoMarca = join(pasta, 'portal-certificado.enderecos');
  const marca = enderecos.join(',');

  if (existsSync(arquivoChave) && existsSync(arquivoCert) && existsSync(arquivoMarca)
      && readFileSync(arquivoMarca, 'utf8') === marca) {
    return {
      chave: readFileSync(arquivoChave, 'utf8'),
      certificado: readFileSync(arquivoCert, 'utf8'),
      novo: false,
    };
  }

  const gerado = gerarCertificado(enderecos);
  mkdirSync(dirname(arquivoChave), { recursive: true });
  writeFileSync(arquivoChave, gerado.chave, { mode: 0o600 });
  writeFileSync(arquivoCert, gerado.certificado, { mode: 0o644 });
  writeFileSync(arquivoMarca, marca);
  return { ...gerado, novo: true };
}
