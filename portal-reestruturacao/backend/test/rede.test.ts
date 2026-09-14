import test from 'node:test';
import assert from 'node:assert/strict';
import { criarFiltroIp } from '../src/http/rede.js';

test('sem lista configurada, qualquer origem passa', () => {
  const filtro = criarFiltroIp('');
  assert.equal(filtro.ativo, false);
  assert.equal(filtro.permitido('8.8.8.8'), true);
});

test('faixa CIDR libera só os endereços de dentro', () => {
  const filtro = criarFiltroIp('200.150.10.0/24');
  assert.equal(filtro.ativo, true);
  assert.equal(filtro.permitido('200.150.10.1'), true);
  assert.equal(filtro.permitido('200.150.10.254'), true);
  assert.equal(filtro.permitido('200.150.11.1'), false);
  assert.equal(filtro.permitido('8.8.8.8'), false);
});

test('aceita endereço avulso, várias regras e IPv4 encapsulado em IPv6', () => {
  const filtro = criarFiltroIp('187.44.7.9, 10.0.0.0/8');
  assert.equal(filtro.permitido('187.44.7.9'), true);
  assert.equal(filtro.permitido('10.34.2.7'), true);
  assert.equal(filtro.permitido('::ffff:10.34.2.7'), true);
  assert.equal(filtro.permitido('11.0.0.1'), false);
});

test('regra inválida não abre a porta', () => {
  const filtro = criarFiltroIp('faixa-errada/99');
  assert.equal(filtro.ativo, true);
  assert.equal(filtro.permitido('200.150.10.1'), false);
});
