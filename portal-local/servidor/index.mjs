/**
 * Portal de Decisões — versão local (rede da empresa).
 *
 * Um único processo Node: banco SQLite em arquivo, HTTPS com certificado
 * próprio e a interface já compilada. Não instala nada, não precisa de
 * administrador da máquina e não fala com a internet.
 *
 *   node servidor/index.mjs
 */
// O SQLite embutido no Node ainda é marcado como experimental; o aviso no console
// só confunde quem vai usar o portal.
process.removeAllListeners('warning');

import { createServer as criarHttp } from 'node:http';
import { createServer as criarHttps } from 'node:https';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hostname, networkInterfaces } from 'node:os';

import { abrirBanco, agora, criarAcesso } from './banco.mjs';
import { obterCertificado } from './certificado.mjs';
import { ErroApi } from './dominio.mjs';
import { auditar, carregarUsuario } from './contexto.mjs';
import { novoConvite, resumoConvite } from './senha.mjs';
import { COOKIE, rotasSessao } from './rotas/sessao.mjs';
import { rotasDados } from './rotas/dados.mjs';
import { rotasAdmin } from './rotas/admin.mjs';
import { rotasPlanilha } from './rotas/planilha.mjs';
import { rotasEquipe } from './rotas/equipe.mjs';

const RAIZ = resolve(fileURLToPath(new URL('..', import.meta.url)));
// PORTAL_DADOS existe para testes e para quem quiser guardar os dados em outra pasta.
const PASTA_DADOS = process.env.PORTAL_DADOS ? resolve(process.env.PORTAL_DADOS) : join(RAIZ, 'dados');
const PASTA_PUBLICO = join(RAIZ, 'publico');

/* --------------------------- configuração ---------------------------- */
const padrao = {
  porta: 8443,
  endereco: '0.0.0.0',
  https: true,
  sessao_horas: 8,
  // Vazio = qualquer máquina da rede. Ex.: ["192.168.0.0/24", "10.1.2.0/24"]
  redes_permitidas: [],
};
const arquivoConfig = join(RAIZ, 'portal.config.json');
const config = { ...padrao, ...(existsSync(arquivoConfig) ? JSON.parse(readFileSync(arquivoConfig, 'utf8')) : {}) };
if (process.env.PORTAL_PORTA) config.porta = Number(process.env.PORTAL_PORTA);
if (process.env.PORTAL_HTTP === '1') config.https = false;

/* ----------------------- endereços desta máquina ---------------------- */
function enderecosLocais() {
  const lista = [];
  for (const enderecos of Object.values(networkInterfaces())) {
    for (const item of enderecos ?? []) {
      if (item.family === 'IPv4' && !item.internal) lista.push(item.address);
    }
  }
  return lista;
}

const ips = enderecosLocais();
const nomeMaquina = hostname();

/* ------------------------- faixas de rede ----------------------------- */
function paraNumeroIp(ip) {
  const partes = String(ip).replace(/^::ffff:/, '').split('.');
  if (partes.length !== 4) return null;
  return partes.reduce((total, parte) => (total << 8) + (Number(parte) & 255), 0) >>> 0;
}

function criarFiltroRede(faixas) {
  const regras = (faixas ?? []).map((faixa) => {
    const [base, bits] = String(faixa).trim().split('/');
    const numero = paraNumeroIp(base);
    if (numero === null) return null;
    const prefixo = bits === undefined ? 32 : Number(bits);
    const mascara = prefixo === 0 ? 0 : (0xffffffff << (32 - prefixo)) >>> 0;
    return { rede: (numero & mascara) >>> 0, mascara };
  }).filter(Boolean);

  return {
    ativo: regras.length > 0,
    permitido(ip) {
      if (!regras.length) return true;
      const numero = paraNumeroIp(ip);
      if (numero === null) return false;
      return regras.some((regra) => ((numero & regra.mascara) >>> 0) === regra.rede);
    },
  };
}
const filtroRede = criarFiltroRede(config.redes_permitidas);

/* ------------------------------- banco -------------------------------- */
const bd = abrirBanco(join(PASTA_DADOS, 'portal.sqlite'));
const acesso = criarAcesso(bd);

/** Primeira execução: cria o acesso do RH e mostra o link para definir a senha. */
function primeiroAcesso() {
  const total = Number(acesso.primeiro('SELECT COUNT(*) AS total FROM usuarios')?.total ?? 0);
  if (total > 0) return null;
  const convite = novoConvite();
  const expira = new Date(Date.now() + 7 * 86400 * 1000);
  acesso.executar(`
    INSERT INTO usuarios (usuario, nome, perfil, senha_hash, trocar_senha, criado_em, ativacao_hash, ativacao_expira_em)
    VALUES ('rh.admin', 'Administração RH', 'admin', NULL, 0, ?, ?, ?)`,
    agora(), resumoConvite(convite), expira.toISOString());
  writeFileSync(join(PASTA_DADOS, 'primeiro-acesso.txt'),
    `Link de primeiro acesso do RH (uso único, vale até ${expira.toLocaleString('pt-BR')}):\n`
    + `${enderecoPrincipal()}/ativar?t=${convite}\n\nUsuário: rh.admin\n`, { mode: 0o600 });
  return convite;
}

const enderecoPrincipal = () =>
  `${config.https ? 'https' : 'http'}://${ips[0] ?? 'localhost'}:${config.porta}`;

/* ------------------------------- rotas -------------------------------- */
const ROTAS = [...rotasSessao, ...rotasDados, ...rotasAdmin, ...rotasPlanilha, ...rotasEquipe];

function acharRota(metodo, caminho) {
  for (const [metodoRota, padraoRota, manipulador] of ROTAS) {
    if (metodoRota !== metodo) continue;
    if (typeof padraoRota === 'string') {
      if (padraoRota === caminho) return { manipulador, params: [] };
    } else {
      const achado = padraoRota.exec(caminho);
      if (achado) return { manipulador, params: achado.slice(1) };
    }
  }
  return null;
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function servirEstatico(caminho, resposta) {
  const relativo = normalize(caminho).replace(/^(\.\.[/\\])+/, '').replace(/^\//, '');
  const alvo = relativo && !relativo.endsWith('/') ? join(PASTA_PUBLICO, relativo) : join(PASTA_PUBLICO, 'index.html');
  try {
    const conteudo = await readFile(alvo);
    resposta.writeHead(200, {
      'content-type': TIPOS[extname(alvo)] ?? 'application/octet-stream',
      'cache-control': extname(alvo) === '.html' ? 'no-store' : 'public, max-age=3600',
      ...CABECALHOS_SEGURANCA,
    });
    resposta.end(conteudo);
  } catch {
    // Rotas da interface (/colaboradores, /ativar, ...) caem no index.html
    try {
      const indice = await readFile(join(PASTA_PUBLICO, 'index.html'));
      resposta.writeHead(200, { 'content-type': TIPOS['.html'], 'cache-control': 'no-store', ...CABECALHOS_SEGURANCA });
      resposta.end(indice);
    } catch {
      resposta.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      resposta.end('A pasta "publico" não foi encontrada. Reinstale o pacote do portal.');
    }
  }
}

const CABECALHOS_SEGURANCA = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'x-robots-tag': 'noindex, nofollow, noarchive',
  'content-security-policy':
    "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
    + "connect-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'",
};

function lerCookie(cabecalho, nome) {
  for (const parte of String(cabecalho ?? '').split(';')) {
    const [chave, ...resto] = parte.trim().split('=');
    if (chave === nome) return decodeURIComponent(resto.join('='));
  }
  return null;
}

async function tratar(req, res) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'local'}`);
  const caminho = url.pathname;
  const ip = String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');

  if (!caminho.startsWith('/api/')) {
    await servirEstatico(caminho, res);
    return;
  }

  const cabecalhos = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CABECALHOS_SEGURANCA };
  const responder = (status, corpo) => {
    res.writeHead(status, cabecalhos);
    res.end(JSON.stringify(corpo));
  };

  try {
    if (caminho === '/api/saude') return responder(200, { ok: true, agora: agora() });

    // 1. só máquinas das faixas configuradas (quando houver configuração)
    if (filtroRede.ativo && !filtroRede.permitido(ip)) {
      return responder(403, { erro: 'Acesso permitido apenas pela rede da empresa.' });
    }

    // 2. o navegador precisa mandar o cabeçalho do portal (trava pedido de outro site)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-portal'] !== '1') {
      return responder(403, { erro: 'Requisição inválida.' });
    }

    // 3. sessão
    const ctx = {
      req, res, url, ip, acesso, config: { sessaoHoras: config.sessao_horas, seguro: config.https },
      query: Object.fromEntries(url.searchParams),
      params: [],
      usuario: null,
      sessaoId: null,
      cabecalho: (nome, valor) => { cabecalhos[nome.toLowerCase()] = valor; },
      corpo: async () => {
        const pedacos = [];
        for await (const pedaco of req) pedacos.push(pedaco);
        if (!pedacos.length) return {};
        try { return JSON.parse(Buffer.concat(pedacos).toString('utf8')); } catch { return {}; }
      },
    };

    const idSessao = lerCookie(req.headers.cookie, COOKIE);
    if (idSessao) {
      const sessao = acesso.primeiro('SELECT usuario_id, expira_em FROM sessoes WHERE id = ?', idSessao);
      if (sessao && sessao.expira_em > agora()) {
        const usuario = carregarUsuario(acesso, sessao.usuario_id);
        if (usuario) { ctx.usuario = usuario; ctx.sessaoId = idSessao; }
      } else if (sessao) {
        acesso.executar('DELETE FROM sessoes WHERE id = ?', idSessao);
      }
    }

    // 4. login obrigatório fora de /api/auth
    if (!caminho.startsWith('/api/auth/')) {
      if (!ctx.usuario) return responder(401, { erro: 'Sessão expirada. Faça login novamente.' });
      if (ctx.usuario.trocar_senha) {
        return responder(403, { erro: 'Defina uma nova senha antes de continuar.', detalhes: { trocar_senha: true } });
      }
    }

    const rota = acharRota(req.method, caminho);
    if (!rota) return responder(404, { erro: 'Recurso não encontrado.' });
    ctx.params = rota.params;

    const saida = await rota.manipulador(ctx);
    if (saida && typeof saida === 'object' && 'status' in saida && 'corpo' in saida) {
      return responder(saida.status, saida.corpo);
    }
    return responder(200, saida ?? { ok: true });
  } catch (erro) {
    const status = erro instanceof ErroApi ? erro.status : 500;
    if (status >= 500) console.error('[erro]', req.method, caminho, erro);
    return responder(status, {
      erro: status >= 500 ? 'Erro interno. Procure o administrador do portal.' : erro.message,
      ...(erro.detalhes ? { detalhes: erro.detalhes } : {}),
    });
  }
}

/* ------------------------------ subida -------------------------------- */
const convite = primeiroAcesso();

let servidor;
if (config.https) {
  const { certificado, chave, novo } = obterCertificado(PASTA_DADOS, ['localhost', nomeMaquina, ...ips]);
  servidor = criarHttps({ key: chave, cert: certificado }, (req, res) => { void tratar(req, res); });
  if (novo) console.log('Certificado próprio gerado em dados/portal-certificado.pem\n');
} else {
  servidor = criarHttp((req, res) => { void tratar(req, res); });
}

servidor.on('error', (erro) => {
  if (erro.code === 'EADDRINUSE') {
    console.error(`\nA porta ${config.porta} já está em uso. Feche o outro portal ou troque a porta em portal.config.json.\n`);
  } else if (erro.code === 'EACCES') {
    console.error(`\nSem permissão para usar a porta ${config.porta}. Escolha uma porta acima de 1024 em portal.config.json.\n`);
  } else {
    console.error('\nFalha ao iniciar o portal:', erro.message, '\n');
  }
  process.exit(1);
});

servidor.listen(config.porta, config.endereco, () => {
  const esquema = config.https ? 'https' : 'http';
  console.log('='.repeat(64));
  console.log('  PORTAL DE DECISÕES — rodando nesta máquina');
  console.log('='.repeat(64));
  console.log('\n  Endereço para os gestores (rede da empresa):');
  for (const ip of ips) console.log(`    ${esquema}://${ip}:${config.porta}`);
  console.log(`    ${esquema}://${nomeMaquina}:${config.porta}`);
  console.log('\n  Nesta máquina:');
  console.log(`    ${esquema}://localhost:${config.porta}`);
  if (config.https) {
    console.log('\n  Na primeira visita o navegador avisa que não conhece o certificado.');
    console.log('  É esperado: o certificado é desta máquina. Siga em "Avançado".');
  } else {
    console.log('\n  ATENÇÃO: modo sem HTTPS. As senhas trafegam em texto pela rede.');
  }
  if (filtroRede.ativo) console.log(`\n  Acesso limitado às faixas: ${config.redes_permitidas.join(', ')}`);
  if (convite) {
    console.log('\n' + '-'.repeat(64));
    console.log('  PRIMEIRO ACESSO (usuário rh.admin) — abra este link e defina a sua senha:');
    console.log(`\n    ${enderecoPrincipal()}/ativar?t=${convite}`);
    console.log('\n  (o link também ficou salvo em dados/primeiro-acesso.txt)');
    console.log('-'.repeat(64));
  }
  console.log('\n  Para encerrar: feche esta janela ou pressione Ctrl+C.\n');
});

process.on('SIGINT', () => {
  console.log('\nPortal encerrado. Os dados continuam em dados/portal.sqlite.');
  try { bd.close(); } catch { /* já fechado */ }
  process.exit(0);
});

void auditar;
