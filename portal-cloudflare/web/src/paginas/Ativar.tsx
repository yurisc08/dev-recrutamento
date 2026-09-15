import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import type { Contexto } from '../tipos';

/**
 * Primeiro acesso.
 *
 * Quem cria o acesso não cria senha: manda um link. A senha é escolhida aqui,
 * pela própria pessoa, e ninguém mais no portal conhece.
 */
export function Ativar({ convite }: { convite: string }) {
  const { definirContexto, avisar } = useSessao();
  const [dono, setDono] = useState<{ nome: string; usuario: string } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get<{ nome: string; usuario: string }>(`/api/auth/ativacao/${encodeURIComponent(convite)}`)
      .then(setDono)
      .catch((falha) => setErro((falha as Error).message));
  }, [convite]);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (senha !== confirmacao) {
      setErro('A confirmação não confere com a senha digitada.');
      return;
    }
    setEnviando(true);
    try {
      const contexto = await api.post<Contexto>(`/api/auth/ativacao/${encodeURIComponent(convite)}`, {
        senha, confirmacao,
      });
      window.history.replaceState(null, '', '/');
      definirContexto(contexto);
      avisar('Senha definida. Bem-vindo(a) ao portal.');
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login">
      <form className="login-cartao" onSubmit={enviar}>
        <div className="marca"><span className="marca-ponto" /> Portal de Decisões</div>
        <h1 style={{ fontSize: 20 }}>Primeiro acesso</h1>

        {!dono && !erro && <p className="texto-2">Conferindo o link...</p>}
        {erro && <div className="msg msg-erro">{erro}</div>}

        {dono && (
          <>
            <p className="texto-2" style={{ marginTop: 4, marginBottom: 20 }}>
              {dono.nome} — usuário <strong>{dono.usuario}</strong>. Defina a sua senha: ela é sua,
              ninguém do RH ou da Diretoria tem acesso a ela.
            </p>
            <div className="campo">
              <label htmlFor="nova-senha">Senha (mín. 10 caracteres, com letras e números)</label>
              <input id="nova-senha" type="password" value={senha} autoComplete="new-password" autoFocus required
                     onChange={(evento) => setSenha(evento.target.value)} />
            </div>
            <div className="campo" style={{ marginTop: 10 }}>
              <label htmlFor="confirma-senha">Repita a senha</label>
              <input id="confirma-senha" type="password" value={confirmacao} autoComplete="new-password" required
                     onChange={(evento) => setConfirmacao(evento.target.value)} />
            </div>
            <button className="btn btn-primario btn-largo" style={{ marginTop: 16 }} type="submit" disabled={enviando}>
              {enviando ? 'Salvando...' : 'Definir senha e entrar'}
            </button>
          </>
        )}

        <p className="pequeno texto-3" style={{ marginTop: 16 }}>
          O link é de uso único e vale por 7 dias. Se venceu, peça um novo ao RH ou à sua Diretoria.
        </p>
      </form>
    </div>
  );
}
