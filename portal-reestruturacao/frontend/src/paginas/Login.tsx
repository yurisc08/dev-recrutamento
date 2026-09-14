import { useState, type FormEvent } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import type { Contexto } from '../tipos';

export function Login() {
  const { entrar } = useSessao();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(usuario.trim(), senha);
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setEnviando(false);
      setSenha('');
    }
  }

  return (
    <div className="login">
      <form className="login-cartao" onSubmit={enviar}>
        <div className="marca"><span className="marca-ponto" /> Portal de Decisões</div>
        <h1 style={{ fontSize: 20 }}>Acesso restrito</h1>
        <p className="texto-2" style={{ marginTop: 4, marginBottom: 20 }}>
          Processo de reestruturação — uso interno. Informe suas credenciais do portal.
        </p>
        {erro && <div className="msg msg-erro">{erro}</div>}
        <div className="campo">
          <label htmlFor="usuario">Usuário</label>
          <input id="usuario" value={usuario} onChange={(e) => setUsuario(e.target.value)} autoComplete="username" required autoFocus />
        </div>
        <div className="campo" style={{ marginTop: 10 }}>
          <label htmlFor="senha">Senha</label>
          <input id="senha" type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" required />
        </div>
        <button className="btn btn-primario btn-largo" style={{ marginTop: 16 }} disabled={enviando} type="submit">
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
        <p className="pequeno texto-3" style={{ marginTop: 16 }}>
          Conteúdo confidencial. Acessos e alterações são registrados na auditoria.
        </p>
      </form>
    </div>
  );
}

export function TrocarSenha() {
  const { definirContexto, avisar } = useSessao();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);
    if (nova !== confirmacao) {
      setErro('A confirmação não confere com a nova senha.');
      return;
    }
    try {
      const contexto = await api.post<Contexto>('/api/auth/senha', { senha_atual: atual, nova_senha: nova });
      definirContexto(contexto);
      avisar('Senha atualizada.');
    } catch (falha) {
      setErro((falha as Error).message);
    }
  }

  return (
    <div className="login">
      <form className="login-cartao" onSubmit={enviar}>
        <div className="marca"><span className="marca-ponto" /> Portal de Decisões</div>
        <h1 style={{ fontSize: 20 }}>Defina uma nova senha</h1>
        <p className="texto-2" style={{ marginTop: 4, marginBottom: 20 }}>
          Sua senha é provisória. Escolha uma nova para continuar.
        </p>
        {erro && <div className="msg msg-erro">{erro}</div>}
        <div className="campo">
          <label>Senha atual</label>
          <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} required />
        </div>
        <div className="campo" style={{ marginTop: 10 }}>
          <label>Nova senha (mín. 10 caracteres, com letras e números)</label>
          <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} required />
        </div>
        <div className="campo" style={{ marginTop: 10 }}>
          <label>Repita a nova senha</label>
          <input type="password" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} required />
        </div>
        <button className="btn btn-primario btn-largo" style={{ marginTop: 16 }} type="submit">Salvar e entrar</button>
      </form>
    </div>
  );
}
