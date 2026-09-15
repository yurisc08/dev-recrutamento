/**
 * Senhas e convites de primeiro acesso.
 *
 * Senha nunca é guardada: fica só o hash PBKDF2-SHA256 (210 mil iterações).
 * O convite também não: fica só o resumo SHA-256 dele. Quem abrir o arquivo do
 * banco não consegue entrar no lugar de ninguém.
 */
import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const ITERACOES = 210000;
const TAMANHO = 32;

export function gerarHash(senha) {
  const sal = randomBytes(16);
  const derivada = pbkdf2Sync(String(senha), sal, ITERACOES, TAMANHO, 'sha256');
  return `pbkdf2$${ITERACOES}$${sal.toString('hex')}$${derivada.toString('hex')}`;
}

export function conferirSenha(senha, hash) {
  try {
    const [algoritmo, iteracoes, salHex, chaveHex] = String(hash).split('$');
    if (algoritmo !== 'pbkdf2') return false;
    const esperado = Buffer.from(chaveHex, 'hex');
    const obtido = pbkdf2Sync(String(senha), Buffer.from(salHex, 'hex'), Number(iteracoes), esperado.length, 'sha256');
    return timingSafeEqual(esperado, obtido);
  } catch {
    return false;
  }
}

export function validarSenha(senha) {
  const valor = String(senha ?? '');
  if (valor.length < 10) return 'A senha deve ter ao menos 10 caracteres.';
  if (!/[A-Za-z]/.test(valor) || !/[0-9]/.test(valor)) return 'A senha deve conter letras e números.';
  return null;
}

export const novoConvite = () => randomBytes(32).toString('hex');
export const resumoConvite = (convite) => createHash('sha256').update(String(convite)).digest('hex');
export const novoIdSessao = () => randomBytes(32).toString('hex');
