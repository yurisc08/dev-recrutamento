import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, ErroApi } from './api';
import type { Contexto } from './tipos';

interface EstadoSessao {
  contexto: Contexto | null;
  carregando: boolean;
  trocarSenha: boolean;
  entrar: (usuario: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
  recarregar: () => Promise<void>;
  definirContexto: (contexto: Contexto) => void;
  avisar: (texto: string, tipo?: 'ok' | 'erro') => void;
}

const SessaoContexto = createContext<EstadoSessao | null>(null);

export function ProvedorSessao({ children }: { children: ReactNode }) {
  const [contexto, setContexto] = useState<Contexto | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [trocarSenha, setTrocarSenha] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tipo: string } | null>(null);

  const avisar = useCallback((texto: string, tipo: 'ok' | 'erro' = 'ok') => {
    setAviso({ texto, tipo });
    window.setTimeout(() => setAviso(null), tipo === 'erro' ? 7000 : 3500);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const dados = await api.get<any>('/api/auth/eu');
      if (dados.trocar_senha) {
        setTrocarSenha(true);
        setContexto(null);
      } else {
        setTrocarSenha(false);
        setContexto(dados as Contexto);
      }
    } catch (erro) {
      if (erro instanceof ErroApi && erro.status === 403 && erro.detalhes?.trocar_senha) setTrocarSenha(true);
      else { setContexto(null); setTrocarSenha(false); }
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void recarregar(); }, [recarregar]);

  const entrar = useCallback(async (usuario: string, senha: string) => {
    const dados = await api.post<any>('/api/auth/login', { usuario, senha });
    if (dados.trocar_senha) { setTrocarSenha(true); setContexto(null); return; }
    setContexto(dados as Contexto);
    setTrocarSenha(false);
  }, []);

  const sair = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } catch { /* sessão já encerrada */ }
    setContexto(null);
    setTrocarSenha(false);
  }, []);

  const valor = useMemo<EstadoSessao>(() => ({
    contexto, carregando, trocarSenha, entrar, sair, recarregar,
    definirContexto: (novo: Contexto) => { setContexto(novo); setTrocarSenha(false); },
    avisar,
  }), [contexto, carregando, trocarSenha, entrar, sair, recarregar, avisar]);

  return (
    <SessaoContexto.Provider value={valor}>
      {children}
      {aviso && <div className={`aviso-flutuante ${aviso.tipo}`}>{aviso.texto}</div>}
    </SessaoContexto.Provider>
  );
}

export function useSessao(): EstadoSessao {
  const estado = useContext(SessaoContexto);
  if (!estado) throw new Error('useSessao precisa estar dentro de ProvedorSessao.');
  return estado;
}

/** Contexto garantido para telas internas (já autenticadas). */
export function useContextoApp(): Contexto {
  const { contexto } = useSessao();
  if (!contexto) throw new Error('Contexto indisponível.');
  return contexto;
}
