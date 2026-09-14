import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useContextoApp, useSessao } from '../sessao';
import { Alertas, Cartao, Modal } from '../componentes/Comuns';
import { classeSelo, dataHoraBR, formatarCampo, numeroBR } from '../formato';
import type { Colaborador } from '../tipos';

interface Pagina {
  total: number;
  pagina: number;
  paginas: number;
  por_pagina: number;
  itens: Colaborador[];
}

const ROTULO_STATUS: Record<string, string> = {
  pendente: 'Pendente', preenchida: 'Preenchida', homologada: 'Homologada',
};

export function Colaboradores({ apenasMinhas = false }: { apenasMinhas?: boolean }) {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [dados, setDados] = useState<Pagina | null>(null);
  const [busca, setBusca] = useState('');
  const [diretoriaId, setDiretoriaId] = useState('');
  const [divisaoId, setDivisaoId] = useState('');
  const [status, setStatus] = useState(apenasMinhas ? 'pendente' : '');
  const [acao, setAcao] = useState('');
  const [comAlerta, setComAlerta] = useState(false);
  const [pagina, setPagina] = useState(1);
  const [selecao, setSelecao] = useState<Set<number>>(new Set());
  const [aberto, setAberto] = useState<Colaborador | null>(null);
  const [carregando, setCarregando] = useState(true);

  const parametros = useMemo(() => {
    const query = new URLSearchParams();
    if (busca.trim()) query.set('busca', busca.trim());
    if (diretoriaId) query.set('diretoria_id', diretoriaId);
    if (divisaoId) query.set('divisao_id', divisaoId);
    if (status) query.set('status', status);
    if (acao) query.set('acao', acao);
    if (comAlerta) query.set('com_alerta', '1');
    query.set('pagina', String(pagina));
    query.set('por_pagina', '50');
    return query;
  }, [busca, diretoriaId, divisaoId, status, acao, comAlerta, pagina]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setDados(await api.get<Pagina>(`/api/colaboradores?${parametros}`));
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [parametros, avisar]);

  useEffect(() => {
    const atraso = window.setTimeout(() => { void carregar(); }, 250);
    return () => window.clearTimeout(atraso);
  }, [carregar]);

  const colunasExtras = contexto.campos.filter(
    (campo) => campo.ativo && campo.visivel_lista && campo.origem === 'base'
      && !['chapa', 'nome', 'diretoria', 'divisao'].includes(campo.chave),
  );

  async function homologar() {
    if (selecao.size === 0) { avisar('Selecione ao menos um colaborador.', 'erro'); return; }
    if (!window.confirm(`Homologar ${selecao.size} avaliação(ões)? O gestor não poderá mais alterá-las.`)) return;
    try {
      await api.post('/api/colaboradores/homologar', { ids: [...selecao], homologado: true });
      setSelecao(new Set());
      await carregar();
      avisar('Avaliações homologadas.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  const divisoesFiltro = diretoriaId
    ? contexto.todas_divisoes.filter((divisao) => String(divisao.diretoria_id) === diretoriaId)
    : contexto.todas_divisoes;

  return (
    <>
      <Cartao>
        <div className="linha">
          <div className="campo" style={{ flex: 2 }}>
            <label>Buscar</label>
            <input value={busca} onChange={(e) => { setBusca(e.target.value); setPagina(1); }}
                   placeholder="Nome, matrícula, cargo..." />
          </div>
          {contexto.usuario.perfil !== 'gestor' && (
            <div className="campo">
              <label>Diretoria</label>
              <select value={diretoriaId} onChange={(e) => { setDiretoriaId(e.target.value); setDivisaoId(''); setPagina(1); }}>
                <option value="">Todas</option>
                {contexto.todas_diretorias.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          )}
          <div className="campo">
            <label>Divisão</label>
            <select value={divisaoId} onChange={(e) => { setDivisaoId(e.target.value); setPagina(1); }}>
              <option value="">Todas</option>
              {divisoesFiltro.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
          </div>
          <div className="campo">
            <label>Status</label>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPagina(1); }}>
              <option value="">Todos</option>
              <option value="pendente">Pendentes</option>
              <option value="preenchida">Preenchidas</option>
              <option value="homologada">Homologadas</option>
            </select>
          </div>
          <div className="campo">
            <label>Ação</label>
            <select value={acao} onChange={(e) => { setAcao(e.target.value); setPagina(1); }}>
              <option value="">Todas</option>
              <option value="__sem__">Sem decisão</option>
              {contexto.acoes.map((item) => <option key={item.id} value={item.valor}>{item.valor}</option>)}
            </select>
          </div>
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={comAlerta} style={{ width: 'auto' }}
                   onChange={(e) => { setComAlerta(e.target.checked); setPagina(1); }} />
            Só com alerta
          </label>
          <span className="espaco" />
          {contexto.permissoes.homologar && (
            <button className="btn" type="button" onClick={homologar}>Homologar selecionados</button>
          )}
          <button className="btn" type="button" onClick={() => api.baixar(`/api/exportacao?${parametros}`)}>
            Exportar Excel
          </button>
        </div>
      </Cartao>

      <div className="tabela-caixa tabela-rolagem">
        <table>
          <thead>
            <tr>
              {contexto.permissoes.homologar && <th style={{ width: 34 }} />}
              <th>Matrícula</th>
              <th>Nome</th>
              <th>Diretoria / Divisão</th>
              <th>Ação indicada</th>
              <th>Justificativa</th>
              <th>Status</th>
              {colunasExtras.map((campo) => <th key={campo.chave}>{campo.rotulo}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td className="vazio" colSpan={9 + colunasExtras.length}>Carregando...</td></tr>
            )}
            {!carregando && dados?.itens.length === 0 && (
              <tr><td className="vazio" colSpan={9 + colunasExtras.length}>Nenhum colaborador encontrado com os filtros atuais.</td></tr>
            )}
            {!carregando && dados?.itens.map((item) => {
              const acaoConfig = contexto.acoes.find((configurada) => configurada.valor === item.avaliacao.acao);
              const alertaGrave = item.alertas.find((alerta) => alerta.severidade !== 'info');
              return (
                <tr key={item.id}>
                  {contexto.permissoes.homologar && (
                    <td>
                      <input
                        type="checkbox"
                        checked={selecao.has(item.id)}
                        onChange={(evento) => {
                          const novo = new Set(selecao);
                          if (evento.target.checked) novo.add(item.id); else novo.delete(item.id);
                          setSelecao(novo);
                        }}
                      />
                    </td>
                  )}
                  <td className="mono">{item.chapa}</td>
                  <td>
                    <button className="link" type="button" onClick={() => setAberto(item)}>
                      {item.nome ?? '(sem nome)'}
                    </button>
                  </td>
                  <td className="limite texto-2">
                    {item.diretoria?.nome ?? '—'}<br />
                    <span className="pequeno texto-3">{item.divisao?.nome ?? '—'}</span>
                  </td>
                  <td>
                    {item.avaliacao.acao
                      ? <span className={`selo ${classeSelo(acaoConfig?.cor)}`}>{item.avaliacao.acao}</span>
                      : <span className="selo selo-pendente">Sem decisão</span>}
                  </td>
                  <td className="limite texto-2" title={item.avaliacao.justificativa ?? ''}>
                    {item.avaliacao.justificativa ?? ''}
                  </td>
                  <td>
                    <span className={`selo ${item.avaliacao.status === 'homologada' ? 'selo-homologada'
                      : item.avaliacao.status === 'preenchida' ? 'selo-manter' : 'selo-pendente'}`}>
                      {ROTULO_STATUS[item.avaliacao.status]}
                    </span>
                    {alertaGrave && (
                      <span title={item.alertas.map((alerta) => alerta.mensagem).join('\n')}
                            style={{ color: 'var(--atencao)', fontWeight: 700, marginLeft: 6 }}>⚠</span>
                    )}
                  </td>
                  {colunasExtras.map((campo) => (
                    <td key={campo.chave} className="limite texto-2">
                      {formatarCampo(item.dados[campo.chave], campo.tipo)}
                    </td>
                  ))}
                  <td>
                    <button className="btn btn-pequeno btn-primario" type="button" onClick={() => setAberto(item)}>
                      Avaliar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="rodape-tabela">
        <span>{numeroBR(dados?.total ?? 0)} colaborador(es){selecao.size > 0 ? ` · ${selecao.size} selecionado(s)` : ''}</span>
        <span className="espaco" />
        <button className="btn btn-pequeno" type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹ Anterior</button>
        <span>Página {dados?.pagina ?? 1} de {dados?.paginas ?? 1}</span>
        <button className="btn btn-pequeno" type="button"
                disabled={(dados?.pagina ?? 1) >= (dados?.paginas ?? 1)} onClick={() => setPagina(pagina + 1)}>Próxima ›</button>
      </div>

      {aberto && (
        <ModalAvaliacao
          colaboradorId={aberto.id}
          aoFechar={() => setAberto(null)}
          aoSalvar={() => { setAberto(null); void carregar(); }}
        />
      )}
    </>
  );
}

function ModalAvaliacao({ colaboradorId, aoFechar, aoSalvar }: {
  colaboradorId: number; aoFechar: () => void; aoSalvar: () => void;
}) {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [item, setItem] = useState<Colaborador | null>(null);
  const [historico, setHistorico] = useState<any[]>([]);
  const [acao, setAcao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [destino, setDestino] = useState('');
  const [novaDiretoria, setNovaDiretoria] = useState('');
  const [novaDivisao, setNovaDivisao] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get<Colaborador>(`/api/colaboradores/${colaboradorId}`).then((dados) => {
      setItem(dados);
      setAcao(dados.avaliacao.acao ?? '');
      setJustificativa(dados.avaliacao.justificativa ?? '');
      setDestino(dados.avaliacao.destino ?? '');
      setNovaDiretoria(dados.avaliacao.nova_diretoria ? String(dados.avaliacao.nova_diretoria.id) : '');
      setNovaDivisao(dados.avaliacao.nova_divisao ? String(dados.avaliacao.nova_divisao.id) : '');
    }).catch((falha) => avisar(falha.message, 'erro'));
    api.get<{ itens: any[] }>(`/api/colaboradores/${colaboradorId}/historico`)
      .then((dados) => setHistorico(dados.itens))
      .catch(() => setHistorico([]));
  }, [colaboradorId, avisar]);

  if (!item) {
    return <Modal titulo="Carregando..." aoFechar={aoFechar}><div className="carregando">Carregando colaborador...</div></Modal>;
  }

  const configurada = contexto.acoes.find((opcao) => opcao.valor === acao);
  const bloqueadoParaGestor = contexto.usuario.perfil === 'gestor' && item.avaliacao.status === 'homologada';
  const camposFicha = contexto.campos.filter((campo) => campo.ativo && campo.origem === 'base');
  const ORDEM_GRUPOS = ['Identificação', 'Organização', 'Cargo', 'Situação', 'Desempenho', 'Estabilidade', 'Remuneração', 'Personalizados', 'Controle'];
  const grupos = [...new Set(camposFicha.map((campo) => campo.grupo ?? 'Outros'))].sort((a, b) => {
    const posicaoA = ORDEM_GRUPOS.indexOf(a);
    const posicaoB = ORDEM_GRUPOS.indexOf(b);
    return (posicaoA < 0 ? 50 : posicaoA) - (posicaoB < 0 ? 50 : posicaoB);
  });

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await api.patch(`/api/colaboradores/${colaboradorId}`, {
        acao: acao || null,
        justificativa,
        destino,
        nova_diretoria_id: novaDiretoria ? Number(novaDiretoria) : null,
        nova_divisao_id: novaDivisao ? Number(novaDivisao) : null,
      });
      avisar('Avaliação registrada.');
      aoSalvar();
    } catch (falha) {
      setErro((falha as Error).message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      titulo={`${item.nome ?? 'Colaborador'} · matrícula ${item.chapa}`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button className="btn" type="button" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" type="button" onClick={salvar} disabled={salvando || bloqueadoParaGestor}>
            {salvando ? 'Salvando...' : 'Salvar avaliação'}
          </button>
        </>
      }
    >
      <Alertas alertas={item.alertas} />
      {bloqueadoParaGestor && (
        <div className="msg msg-info">Avaliação homologada pela Diretoria — somente Diretoria ou RH podem alterar.</div>
      )}
      {erro && <div className="msg msg-erro">{erro}</div>}

      <div className="cartao" style={{ margin: 0, marginBottom: 16 }}>
        <h2>Decisão</h2>
        <div className="grade-2">
          <div className="campo">
            <label>Ação indicada</label>
            <select value={acao} onChange={(evento) => setAcao(evento.target.value)} disabled={bloqueadoParaGestor}>
              <option value="">Sem decisão</option>
              {contexto.acoes.map((opcao) => <option key={opcao.id} value={opcao.valor}>{opcao.valor}</option>)}
            </select>
          </div>
          {configurada?.exige_destino && (
            <>
              <div className="campo">
                <label>Nova Diretoria</label>
                <select value={novaDiretoria} onChange={(evento) => { setNovaDiretoria(evento.target.value); setNovaDivisao(''); }}
                        disabled={bloqueadoParaGestor}>
                  <option value="">Selecione</option>
                  {contexto.todas_diretorias.map((diretoria) => (
                    <option key={diretoria.id} value={diretoria.id}>{diretoria.nome}</option>
                  ))}
                </select>
              </div>
              <div className="campo">
                <label>Nova Divisão (opcional)</label>
                <select value={novaDivisao} onChange={(evento) => setNovaDivisao(evento.target.value)} disabled={bloqueadoParaGestor}>
                  <option value="">Selecione</option>
                  {contexto.todas_divisoes
                    .filter((divisao) => !novaDiretoria || String(divisao.diretoria_id) === novaDiretoria)
                    .map((divisao) => <option key={divisao.id} value={divisao.id}>{divisao.nome}</option>)}
                </select>
              </div>
              <div className="campo">
                <label>Setor / área / nº do processo</label>
                <input value={destino} onChange={(evento) => setDestino(evento.target.value)} disabled={bloqueadoParaGestor}
                       placeholder="Ex.: Engenharia de Processos / proc. 1234" />
              </div>
            </>
          )}
        </div>
        <div className="campo" style={{ marginTop: 10 }}>
          <label>
            Justificativa{configurada?.exige_justificativa ? ' (obrigatória para esta ação)' : ''}
          </label>
          <textarea
            value={justificativa}
            onChange={(evento) => setJustificativa(evento.target.value)}
            disabled={bloqueadoParaGestor}
            rows={4}
            placeholder="Critérios considerados: cultura, desempenho, custo x entrega, polivalência, impacto na continuidade..."
          />
        </div>
        {item.avaliacao.atualizado_em && (
          <p className="pequeno texto-3" style={{ marginTop: 8, marginBottom: 0 }}>
            Última alteração por {item.avaliacao.atualizado_por ?? '—'} em {dataHoraBR(item.avaliacao.atualizado_em)}.
            {item.avaliacao.homologado_em && ` Homologada por ${item.avaliacao.homologado_por} em ${dataHoraBR(item.avaliacao.homologado_em)}.`}
          </p>
        )}
      </div>

      <div className="cartao" style={{ margin: 0, marginBottom: 16 }}>
        <h2>Dados da base <span className="dica">— vindos da carga do Excel</span></h2>
        {grupos.map((grupo) => (
          <div key={grupo} style={{ marginBottom: 14 }}>
            <div className="pequeno texto-3" style={{ textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>{grupo}</div>
            <div className="ficha">
              {camposFicha.filter((campo) => (campo.grupo ?? 'Outros') === grupo).map((campo) => (
                <div key={campo.chave}>
                  <div className="rotulo">{campo.rotulo}</div>
                  <div className="valor">{formatarCampo(item.dados[campo.chave], campo.tipo) || '—'}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {historico.length > 0 && (
        <div className="cartao" style={{ margin: 0 }}>
          <h2>Histórico deste colaborador</h2>
          <ul className="lista-historico">
            {historico.map((registro) => (
              <li key={registro.id}>
                <div>
                  <strong>{registro.campo ?? registro.tipo}</strong>: “{registro.valor_anterior ?? '—'}” → “{registro.valor_novo ?? '—'}”
                </div>
                <div className="pequeno texto-3">
                  {registro.usuario_nome ?? 'sistema'} · {dataHoraBR(registro.criado_em)} · {registro.tipo}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}
