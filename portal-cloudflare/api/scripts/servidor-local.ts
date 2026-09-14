/**
 * Servidor local SÓ PARA TESTE: roda o mesmo código do Worker em Node e serve
 * também o front já compilado (../web/dist), para ver o portal inteiro na
 * máquina antes de publicar na Cloudflare.
 *
 *   DATABASE_URL="postgres://..." DB_SSL=false npx tsx scripts/servidor-local.ts
 *
 * Em produção quem executa é a Cloudflare (Workers + Pages); este arquivo não
 * vai para o deploy.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import app from '../src/index.js';

const porta = Number(process.env.PORTA ?? 8787);
const raizWeb = new URL('../../web/dist/', import.meta.url).pathname;

const ambiente = {
  DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://portal@127.0.0.1:5433/portal_demo',
  DB_SSL: process.env.DB_SSL ?? 'false',
  IPS_PERMITIDOS: process.env.IPS_PERMITIDOS ?? '',
  ACCESS_DOMINIO: process.env.ACCESS_DOMINIO ?? '',
  ACCESS_AUD: process.env.ACCESS_AUD ?? '',
  SESSAO_HORAS: process.env.SESSAO_HORAS ?? '8',
  COOKIE_SEGURO: 'false',
};

const TIPOS: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
};

async function servirEstatico(caminho: string) {
  const relativo = normalize(caminho).replace(/^(\.\.[/\\])+/, '').replace(/^\//, '');
  const alvo = relativo && !relativo.endsWith('/') ? join(raizWeb, relativo) : join(raizWeb, 'index.html');
  try {
    return { corpo: await readFile(alvo), tipo: TIPOS[extname(alvo)] ?? 'application/octet-stream' };
  } catch {
    return { corpo: await readFile(join(raizWeb, 'index.html')), tipo: TIPOS['.html'] };
  }
}

const servidor = createServer(async (requisicao, resposta) => {
  const url = new URL(requisicao.url ?? '/', `http://127.0.0.1:${porta}`);

  if (!url.pathname.startsWith('/api/')) {
    const { corpo, tipo } = await servirEstatico(url.pathname);
    resposta.writeHead(200, { 'content-type': tipo, 'cache-control': 'no-store' });
    resposta.end(corpo);
    return;
  }

  const pedacos: Buffer[] = [];
  for await (const pedaco of requisicao) pedacos.push(pedaco as Buffer);
  const corpo = pedacos.length ? Buffer.concat(pedacos) : undefined;

  const cabecalhos = new Headers();
  for (const [chave, valor] of Object.entries(requisicao.headers)) {
    if (Array.isArray(valor)) valor.forEach((item) => cabecalhos.append(chave, item));
    else if (valor) cabecalhos.set(chave, valor);
  }

  const pedido = new Request(url, {
    method: requisicao.method,
    headers: cabecalhos,
    body: corpo as BodyInit | undefined,
  });

  const retorno = await app.fetch(pedido, ambiente);
  const saida: Record<string, string | string[]> = {};
  retorno.headers.forEach((valor, chave) => {
    if (chave === 'set-cookie') saida[chave] = retorno.headers.getSetCookie();
    else saida[chave] = valor;
  });
  resposta.writeHead(retorno.status, saida);
  resposta.end(Buffer.from(await retorno.arrayBuffer()));
});

servidor.listen(porta, '127.0.0.1', () => {
  console.log(`Portal de teste em http://127.0.0.1:${porta}`);
});
