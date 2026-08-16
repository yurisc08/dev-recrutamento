#!/usr/bin/env node
/**
 * Coletor local — para leitores de cracha que NAO conseguem enviar HTTP sozinhos.
 *
 * Roda em qualquer maquina da rede da empresa (um PC, um mini-servidor, um
 * Raspberry Pi), consulta o leitor de tempos em tempos e envia as leituras novas
 * para o Worker na Cloudflare. Guarda o ultimo registro enviado em disco, entao
 * pode ser reiniciado a vontade sem duplicar nada (o servidor tambem ignora
 * duplicatas).
 *
 * Uso:
 *   INGEST_URL=https://presenca.suaempresa.workers.dev/api/ingest \
 *   DEVICE_KEY=dev_sua_chave \
 *   LEITOR_URL=http://192.168.0.50/api/logs \
 *   node tools/coletor.mjs
 *
 * Variaveis opcionais:
 *   INTERVALO_S=30           intervalo entre consultas (padrao 30s)
 *   ESTADO=./coletor.json    onde guardar o ultimo registro enviado
 *   LEITOR_USUARIO / LEITOR_SENHA   autenticacao basica no leitor
 */

import { readFile, writeFile } from 'node:fs/promises';

const config = {
  ingestUrl: requireEnv('INGEST_URL'),
  deviceKey: requireEnv('DEVICE_KEY'),
  leitorUrl: requireEnv('LEITOR_URL'),
  intervaloMs: (Number(process.env.INTERVALO_S) || 30) * 1000,
  estado: process.env.ESTADO || './coletor.json',
  usuario: process.env.LEITOR_USUARIO,
  senha: process.env.LEITOR_SENHA,
};

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Falta a variavel de ambiente ${name}.`);
    process.exit(1);
  }
  return value;
}

/**
 * ADAPTE AQUI para o modelo do seu leitor.
 *
 * Precisa devolver uma lista de objetos com, no minimo, o numero do cracha e o
 * horario da leitura. Nomes aceitos pelo servidor: badge/card/cardNumber/codigo/
 * matricula para o cracha; timestamp/time/data_hora/datetime para o horario.
 */
function extrairRegistros(resposta) {
  if (Array.isArray(resposta)) return resposta;
  // Formatos comuns: {logs:[...]}, {values:[...]}, {data:[...]}
  for (const chave of ['logs', 'values', 'data', 'records', 'events', 'registros']) {
    if (Array.isArray(resposta?.[chave])) return resposta[chave];
  }
  return [];
}

/** Identificador crescente usado para saber o que ja foi enviado. */
function chaveDoRegistro(registro) {
  return String(
    registro.id ?? registro.log_id ?? registro.sequence ?? registro.timestamp ?? registro.time ?? '',
  );
}

async function lerEstado() {
  try {
    return JSON.parse(await readFile(config.estado, 'utf8'));
  } catch {
    return { ultimo: null };
  }
}

async function salvarEstado(estado) {
  await writeFile(config.estado, JSON.stringify(estado, null, 2));
}

async function consultarLeitor() {
  const headers = {};
  if (config.usuario) {
    headers.authorization = 'Basic ' + Buffer.from(`${config.usuario}:${config.senha ?? ''}`).toString('base64');
  }
  const resposta = await fetch(config.leitorUrl, { headers });
  if (!resposta.ok) throw new Error(`Leitor respondeu ${resposta.status}`);
  return extrairRegistros(await resposta.json());
}

async function enviar(registros) {
  const resposta = await fetch(config.ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-device-key': config.deviceKey },
    body: JSON.stringify({ events: registros }),
  });

  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new Error(`Servidor respondeu ${resposta.status}: ${JSON.stringify(corpo)}`);
  return corpo;
}

async function ciclo() {
  const estado = await lerEstado();
  const registros = await consultarLeitor();

  // Envia apenas o que veio depois do ultimo registro confirmado.
  const novos = estado.ultimo
    ? registros.slice(registros.findIndex((r) => chaveDoRegistro(r) === estado.ultimo) + 1)
    : registros;

  if (novos.length === 0) return;

  const resultado = await enviar(novos);
  estado.ultimo = chaveDoRegistro(novos[novos.length - 1]);
  await salvarEstado(estado);

  console.log(
    `[${new Date().toISOString()}] enviados=${novos.length} gravados=${resultado.stored} duplicados=${resultado.duplicates}`,
  );
}

console.log(`Coletor iniciado. Leitor: ${config.leitorUrl} -> ${config.ingestUrl}`);
console.log(`Consultando a cada ${config.intervaloMs / 1000}s. Ctrl+C para parar.`);

while (true) {
  try {
    await ciclo();
  } catch (erro) {
    // Falha de rede nao derruba o coletor: tenta de novo no proximo ciclo.
    console.error(`[${new Date().toISOString()}] erro: ${erro.message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, config.intervaloMs));
}
