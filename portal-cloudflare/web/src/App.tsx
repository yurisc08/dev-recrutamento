import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ProvedorSessao, useSessao } from './sessao';
import { Login, TrocarSenha } from './paginas/Login';
import { Ativar } from './paginas/Ativar';
import { Gestores } from './paginas/Gestores';
import { Dashboard } from './paginas/Dashboard';
import { Colaboradores } from './paginas/Colaboradores';
import { Importar } from './paginas/Importar';
import { Configuracoes } from './paginas/Configuracoes';
import { Auditoria } from './paginas/Auditoria';
import { dataBR, diasAte } from './formato';
import { exportarPlanilha } from './exportacao';

export default function App() {
  return (
    <ProvedorSessao>
      <Portal />
    </ProvedorSessao>
  );
}

function Portal() {
  const { contexto, carregando, trocarSenha } = useSessao();
  // /ativar?t=... é a única tela que abre sem sessão: é onde a pessoa define a senha dela.
  const local = useLocation();
  const convite = local.pathname === '/ativar' ? new URLSearchParams(local.search).get('t') : null;
  if (convite && !contexto) return <Ativar convite={convite} />;

  if (carregando) return <div className="carregando">Carregando portal...</div>;
  if (trocarSenha) return <TrocarSenha />;
  if (!contexto) return <Login />;
  return <Estrutura />;
}

function Estrutura() {
  const { contexto, sair, avisar } = useSessao();
  const local = useLocation();

  // A planilha é montada aqui no navegador, a partir do recorte que a API liberou.
  const exportar = async () => {
    try { await exportarPlanilha(); } catch (erro) { avisar((erro as Error).message, 'erro'); }
  };
  const [tema, setTema] = useState<string>(() => {
    try { return localStorage.getItem('portal-tema') ?? ''; } catch { return ''; }
  });

  useEffect(() => {
    if (tema) document.documentElement.dataset.tema = tema;
    else delete document.documentElement.dataset.tema;
    try { if (tema) localStorage.setItem('portal-tema', tema); } catch { /* indisponível */ }
  }, [tema]);

  if (!contexto) return null;
  const { permissoes, processo, usuario } = contexto;
  const dias = diasAte(processo.prazo);

  const titulos: Record<string, string> = {
    '/': 'Dashboard',
    '/colaboradores': 'Colaboradores',
    '/minhas-avaliacoes': 'Minhas avaliações',
    '/gestores': 'Gestores imediatos',
    '/importar': 'Importar Excel',
    '/configuracoes': 'Configurações',
    '/auditoria': 'Auditoria',
  };

  return (
    <div className="app">
      <nav className="lateral">
        <div className="titulo"><span className="marca-ponto" /> Portal de Decisões</div>
        <NavLink to="/" end className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Dashboard</NavLink>
        <NavLink to="/colaboradores" className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Colaboradores</NavLink>
        <NavLink to="/minhas-avaliacoes" className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Minhas avaliações</NavLink>
        <button className="menu-item" type="button" onClick={() => void exportar()}>Exportar Excel</button>
        {permissoes.gerir_gestores && (
          <>
            <div className="menu-sep">Coordenação</div>
            <NavLink to="/gestores" className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Gestores</NavLink>
          </>
        )}
        {permissoes.importar && (
          <>
            <div className="menu-sep">Administração</div>
            <NavLink to="/importar" className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Importar Excel</NavLink>
          </>
        )}
        {permissoes.administrar && (
          <NavLink to="/configuracoes" className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Configurações</NavLink>
        )}
        {permissoes.ver_auditoria && (
          <NavLink to="/auditoria" className={({ isActive }) => `menu-item${isActive ? ' ativo' : ''}`}>Auditoria</NavLink>
        )}
        <span style={{ flex: 1 }} />
        <div className="pequeno texto-3" style={{ padding: '0 8px' }}>
          {processo.nome}<br />Data-base {dataBR(processo.data_base)}
        </div>
      </nav>

      <div className="conteudo">
        <header className="topo">
          <h1>{titulos[local.pathname] ?? 'Portal de Decisões'}</h1>
          <span className="espaco" />
          {processo.prazo && (
            <span className={`selo ${dias !== null && dias < 0 ? 'selo-desligamento' : 'selo-atencao'}`}>
              Prazo {dataBR(processo.prazo)}{dias !== null && (dias >= 0 ? ` · ${dias} dia(s)` : ' · vencido')}
            </span>
          )}
          <span className="pequeno texto-2">{usuario.nome} · {usuario.perfil_descricao}</span>
          <button className="btn btn-pequeno" type="button" onClick={() => setTema(tema === 'escuro' ? 'claro' : 'escuro')}>Tema</button>
          <button className="btn btn-pequeno" type="button" onClick={() => void sair()}>Sair</button>
        </header>

        <main>
          {processo.aviso_confidencialidade && (
            <div className="aviso-conf">⚠ {processo.aviso_confidencialidade}</div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/colaboradores" element={<Colaboradores />} />
            <Route path="/minhas-avaliacoes" element={<Colaboradores apenasMinhas />} />
            {permissoes.gerir_gestores && <Route path="/gestores" element={<Gestores />} />}
            {permissoes.importar && <Route path="/importar" element={<Importar />} />}
            {permissoes.administrar && <Route path="/configuracoes" element={<Configuracoes />} />}
            {permissoes.ver_auditoria && <Route path="/auditoria" element={<Auditoria />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
