import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useContextoApp, useSessao } from '../sessao';
import { Cartao, Tabela } from '../componentes/Comuns';
import { dataHoraBR } from '../formato';

const TIPOS: Record<string, string> = {
  login: 'Login', login_falha: 'Login (falha)', logout: 'Logout', senha: 'Troca de senha',
  avaliacao: 'Avaliação', homologacao: 'Homologação', importacao: 'Importação', exportacao: 'Exportação',
  usuario: 'Usuário', permissao: 'Permissão', config: 'Configuração', campo: 'Campo',
  estrutura: 'Estrutura', dado: 'Dado da base',
};

export function Auditoria() {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [itens, setItens] = useState<any[]>([]);
  const [acessos, setAcessos] = useState<any[]>([]);
  const [chapa, setChapa] = useState('');
  const [tipo, setTipo] = useState('');
  const [usuario, setUsuario] = useState('');

  const carregar = useCallback(async () => {
    const parametros = new URLSearchParams({ limite: '400' });
    if (chapa) parametros.set('chapa', chapa);
    if (tipo) parametros.set('tipo', tipo);
    if (usuario) parametros.set('usuario', usuario);
    try {
      const dados = await api.get<{ itens: any[] }>(`/api/auditoria?${parametros}`);
      setItens(dados.itens);
      if (contexto.usuario.perfil === 'admin') {
        const acessosApi = await api.get<{ itens: any[] }>('/api/auditoria/acessos');
        setAcessos(acessosApi.itens);
      }
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }, [chapa, tipo, usuario, contexto.usuario.perfil, avisar]);

  useEffect(() => { void carregar(); }, [carregar]);

  return (
    <>
      <Cartao titulo="Trilha de auditoria" dica="registro permanente: nada é apagado pelo portal">
        <div className="linha" style={{ marginBottom: 12 }}>
          <div className="campo"><label>Matrícula</label>
            <input value={chapa} onChange={(evento) => setChapa(evento.target.value)} placeholder="Ex.: 200015" /></div>
          <div className="campo"><label>Tipo de evento</label>
            <select value={tipo} onChange={(evento) => setTipo(evento.target.value)}>
              <option value="">Todos</option>
              {Object.entries(TIPOS).map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
            </select></div>
          <div className="campo"><label>Usuário</label>
            <input value={usuario} onChange={(evento) => setUsuario(evento.target.value)} placeholder="Nome do usuário" /></div>
          <button className="btn" type="button" onClick={() => void carregar()}>Filtrar</button>
        </div>
        <Tabela
          cabecalhos={['Quando', 'Usuário', 'Perfil', 'Evento', 'Matrícula', 'Colaborador', 'Campo', 'De', 'Para']}
          vazio="Nenhum evento registrado."
          linhas={itens.map((item) => [
            dataHoraBR(item.criado_em),
            item.usuario_nome ?? '—',
            item.perfil ?? '—',
            TIPOS[item.tipo] ?? item.tipo,
            item.chapa ?? '',
            item.colaborador_nome ?? '',
            item.campo ?? '',
            item.valor_anterior ?? '',
            item.valor_novo ?? (item.detalhes ? JSON.stringify(item.detalhes).slice(0, 60) : ''),
          ])}
        />
      </Cartao>

      {contexto.usuario.perfil === 'admin' && (
        <Cartao titulo="Tentativas de acesso">
          <Tabela
            cabecalhos={['Quando', 'Usuário', 'IP', 'Resultado']}
            vazio="Sem registros."
            linhas={acessos.map((acesso) => [
              dataHoraBR(acesso.criado_em), acesso.usuario, acesso.ip,
              <span className={`selo ${acesso.sucesso ? 'selo-manter' : 'selo-desligamento'}`}>
                {acesso.sucesso ? 'Sucesso' : 'Falha'}
              </span>,
            ])}
          />
        </Cartao>
      )}
    </>
  );
}
