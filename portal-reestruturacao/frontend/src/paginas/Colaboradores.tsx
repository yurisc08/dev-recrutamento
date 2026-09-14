import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useContextoApp, useSessao } from '../sessao';
import { Alertas, Cartao, Modal } from '../componentes/Comuns';
import { classeSelo, dataHoraBR, formatarCampo, numeroBR } from '../formato';
import type { Acao, Colaborador } from '../tipos';

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
  const [detalhe, setDetalhe] = useState<number | null>(null);
  const [lote, setLote] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvandoId, setSalvandoId] = useState<number | null>(null);

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

  /** O gestor perde a edição depois da homologação; Diretoria e RH continuam podendo ajustar. */
  function podeEditar(item: Colaborador): boolean {
    if (contexto.usuario.perfil === 'gestor' && item.avaliacao.status === 'homologada') return false;
    return contexto.permissoes.avaliar;
  }

  /** Grava a alteração feita direto na linha e atualiza só aquele registro. */
  async function salvarLinha(item: Colaborador, mudancas: Record<string, unknown>): Promise<boolean> {
    setSalvandoId(item.id);
    try {
      const atualizado = await api.patch<Colaborador>(`/api/colaboradores/${item.id}`, mudancas);
      setDados((atual) => atual && {
        ...atual,
        itens: atual.itens.map((linha) => (linha.id === item.id ? atualizado : linha)),
      });
      avisar('Decisão registrada.');
      return true;
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
      setDados((atual) => atual && { ...atual, itens: [...atual.itens] });
      return false;
    } finally {
      setSalvandoId(null);
    }
  }

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
  const itens = dados?.itens ?? [];
  const todosSelecionados = itens.length > 0 && itens.every((item) => selecao.has(item.id));

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
          <button className="btn" type="button" onClick={() => api.baixar(`/api/exportacao?${parametros}`)}>
            Exportar Excel
          </button>
        </div>
      </Cartao>

      {selecao.size > 0 && (
        <div className="barra-selecao">
          <strong>{selecao.size}</strong> selecionado(s)
          <span className="espaco" />
          <button className="btn btn-pequeno" type="button" onClick={() => setSelecao(new Set())}>Limpar seleção</button>
          {contexto.permissoes.avaliar && (
            <button className="btn btn-pequeno btn-primario" type="button" onClick={() => setLote(true)}>
              Aplicar ação aos selecionados
            </button>
          )}
          {contexto.permissoes.homologar && (
            <button className="btn btn-pequeno" type="button" onClick={homologar}>Homologar selecionados</button>
          )}
        </div>
      )}

      <div className="tabela-caixa tabela-rolagem">
        <table className="tabela-decisoes">
          <thead>
            <tr>
              <th style={{ width: 34 }}>
                <input
                  type="checkbox"
                  checked={todosSelecionados}
                  title="Selecionar a página"
                  onChange={(evento) => {
                    const novo = new Set(selecao);
                    for (const item of itens) {
                      if (evento.target.checked) novo.add(item.id); else novo.delete(item.id);
                    }
                    setSelecao(novo);
                  }}
                />
              </th>
              <th>Matrícula</th>
              <th>Nome</th>
              <th>Cargo</th>
              <th>Diretoria / Divisão</th>
              <th style={{ minWidth: 240 }}>Ação indicada</th>
              <th style={{ minWidth: 260 }}>Justificativa</th>
              <th>Status</th>
              {colunasExtras.map((campo) => <th key={campo.chave}>{campo.rotulo}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {carregando && (
              <tr><td className="vazio" colSpan={10 + colunasExtras.length}>Carregando...</td></tr>
            )}
            {!carregando && itens.length === 0 && (
              <tr><td className="vazio" colSpan={10 + colunasExtras.length}>Nenhum colaborador encontrado com os filtros atuais.</td></tr>
            )}
            {!carregando && itens.map((item) => (
              <LinhaColaborador
                key={item.id}
                item={item}
                acoes={contexto.acoes}
                colunasExtras={colunasExtras}
                editavel={podeEditar(item)}
                selecionado={selecao.has(item.id)}
                salvando={salvandoId === item.id}
                aoSelecionar={(marcado) => {
                  const novo = new Set(selecao);
                  if (marcado) novo.add(item.id); else novo.delete(item.id);
                  setSelecao(novo);
                }}
                aoSalvar={(mudancas) => salvarLinha(item, mudancas)}
                aoAbrirDetalhe={() => setDetalhe(item.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="rodape-tabela">
        <span>{numeroBR(dados?.total ?? 0)} colaborador(es){selecao.size > 0 ? ` · ${selecao.size} selecionado(s)` : ''}</span>
        <span className="pequeno texto-3">Marque a decisão direto na linha; o portal grava na hora.</span>
        <span className="espaco" />
        <button className="btn btn-pequeno" type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)}>‹ Anterior</button>
        <span>Página {dados?.pagina ?? 1} de {dados?.paginas ?? 1}</span>
        <button className="btn btn-pequeno" type="button"
                disabled={(dados?.pagina ?? 1) >= (dados?.paginas ?? 1)} onClick={() => setPagina(pagina + 1)}>Próxima ›</button>
      </div>

      {detalhe !== null && (
        <ModalAvaliacao
          colaboradorId={detalhe}
          aoFechar={() => setDetalhe(null)}
          aoSalvar={() => { setDetalhe(null); void carregar(); }}
        />
      )}

      {lote && (
        <ModalLote
          quantidade={selecao.size}
          aoFechar={() => setLote(false)}
          aoAplicar={async (entrada) => {
            try {
              const resposta = await api.post<{ aplicados: number; erros: Array<{ chapa: string; erro: string }> }>(
                '/api/colaboradores/avaliar-lote', { ids: [...selecao], ...entrada },
              );
              setLote(false);
              setSelecao(new Set());
              await carregar();
              if (resposta.erros.length > 0) {
                avisar(`${resposta.aplicados} gravada(s); ${resposta.erros.length} exigem atenção individual.`, 'erro');
              } else {
                avisar(`${resposta.aplicados} avaliação(ões) registrada(s).`);
              }
              return resposta.erros;
            } catch (erro) {
              avisar((erro as Error).message, 'erro');
              return [];
            }
          }}
        />
      )}
    </>
  );
}

/**
 * Linha da lista com a decisão editável no próprio lugar:
 * seleciona a ação, escreve a justificativa e o portal grava — sem abrir o cadastro.
 */
function LinhaColaborador({ item, acoes, colunasExtras, editavel, selecionado, salvando, aoSelecionar, aoSalvar, aoAbrirDetalhe }: {
  item: Colaborador;
  acoes: Acao[];
  colunasExtras: Array<{ chave: string; rotulo: string; tipo: string }>;
  editavel: boolean;
  selecionado: boolean;
  salvando: boolean;
  aoSelecionar: (marcado: boolean) => void;
  aoSalvar: (mudancas: Record<string, unknown>) => Promise<boolean>;
  aoAbrirDetalhe: () => void;
}) {
  const [acaoLocal, setAcaoLocal] = useState(item.avaliacao.acao ?? '');
  const [justificativa, setJustificativa] = useState(item.avaliacao.justificativa ?? '');
  const [destino, setDestino] = useState(item.avaliacao.destino ?? '');
  // A decisão fica "pendente" quando o portal recusou a gravação por falta de justificativa/destino:
  // a escolha continua na tela e é gravada assim que o campo que falta for preenchido.
  const [pendente, setPendente] = useState(false);
  const justificativaRef = useRef<HTMLInputElement>(null);
  const destinoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setAcaoLocal(item.avaliacao.acao ?? '');
    setJustificativa(item.avaliacao.justificativa ?? '');
    setDestino(item.avaliacao.destino ?? '');
    setPendente(false);
  }, [item.avaliacao.acao, item.avaliacao.justificativa, item.avaliacao.destino]);

  const configurada = acoes.find((opcao) => opcao.valor === acaoLocal);
  const alertaGrave = item.alertas.find((alerta) => alerta.severidade !== 'info');
  const exigeJustificativa = Boolean(configurada?.exige_justificativa)
    || (acaoLocal !== '' && item.alertas.some((alerta) => alerta.exige_justificativa
      && (alerta.aplica_acao === null || alerta.aplica_acao === acaoLocal)));

  /** O que ainda falta para esta decisão poder ser gravada (mesmas exigências do backend). */
  function faltando(valores: { acao: string; justificativa: string; destino: string }): string | null {
    if (!valores.acao) return null;
    const escolhida = acoes.find((opcao) => opcao.valor === valores.acao);
    const alertaExige = item.alertas.some((alerta) => alerta.exige_justificativa
      && (alerta.aplica_acao === null || alerta.aplica_acao === valores.acao));
    if ((escolhida?.exige_justificativa || alertaExige) && !valores.justificativa.trim()) return 'justificativa';
    if (escolhida?.exige_destino && !valores.destino.trim()) return 'destino';
    return null;
  }

  /**
   * Grava a linha. Enquanto faltar justificativa ou destino, a escolha fica marcada como pendente
   * na própria tela (sem ida ao servidor) e é gravada assim que o campo que falta for preenchido.
   */
  async function gravar(valores: { acao: string; justificativa: string; destino: string }) {
    const falta = faltando(valores);
    if (falta) {
      setPendente(true);
      // Leva o cursor direto para o campo que está faltando.
      if (falta === 'justificativa') justificativaRef.current?.focus();
      else destinoRef.current?.focus();
      return false;
    }
    const gravou = await aoSalvar({
      acao: valores.acao || null,
      justificativa: valores.justificativa,
      destino: valores.destino,
    });
    setPendente(!gravou);
    if (!gravou) justificativaRef.current?.focus();
    return gravou;
  }

  async function trocarAcao(valor: string) {
    setAcaoLocal(valor);
    await gravar({ acao: valor, justificativa, destino });
  }

  return (
    <tr className={selecionado ? 'selecionada' : undefined}>
      <td>
        <input type="checkbox" checked={selecionado} onChange={(evento) => aoSelecionar(evento.target.checked)} />
      </td>
      <td className="mono">{item.chapa}</td>
      <td className="limite">
        <button className="link" type="button" onClick={aoAbrirDetalhe}>{item.nome ?? '(sem nome)'}</button>
      </td>
      <td className="limite texto-2">{String(item.dados.des_cargo ?? item.dados.cargo ?? '')}</td>
      <td className="limite texto-2">
        {item.diretoria?.nome ?? '—'}
        <div className="pequeno texto-3">{item.divisao?.nome ?? '—'}</div>
      </td>

      <td>
        {editavel ? (
          <select
            className={`celula-decisao${acaoLocal ? ' preenchida' : ''}${pendente ? ' exigida' : ''}`}
            value={acaoLocal}
            disabled={salvando}
            onChange={(evento) => void trocarAcao(evento.target.value)}
          >
            <option value="">— sem decisão —</option>
            {acoes.map((opcao) => <option key={opcao.id} value={opcao.valor}>{opcao.valor}</option>)}
          </select>
        ) : (
          <span className={`selo ${classeSelo(acoes.find((opcao) => opcao.valor === item.avaliacao.acao)?.cor)}`}>
            {item.avaliacao.acao ?? 'Sem decisão'}
          </span>
        )}
        {pendente && (
          <div className="pendente-aviso">
            {faltando({ acao: acaoLocal, justificativa, destino }) === 'destino'
              ? 'Informe o destino para gravar.'
              : 'Informe a justificativa para gravar.'}
          </div>
        )}
        {configurada?.exige_destino && (
          <input
            ref={destinoRef}
            className={`celula-decisao${pendente && faltando({ acao: acaoLocal, justificativa, destino }) === 'destino' ? ' exigida' : ''}`}
            style={{ marginTop: 4 }}
            value={destino}
            disabled={!editavel || salvando}
            placeholder="Destino: Diretoria / setor / nº processo"
            onChange={(evento) => setDestino(evento.target.value)}
            onBlur={() => {
              if (pendente || (item.avaliacao.destino ?? '') !== destino) {
                void gravar({ acao: acaoLocal, justificativa, destino });
              }
            }}
          />
        )}
      </td>

      <td>
        {editavel ? (
          <input
            ref={justificativaRef}
            className={`celula-decisao${(pendente || (exigeJustificativa && !justificativa)) ? ' exigida' : ''}`}
            value={justificativa}
            disabled={salvando}
            placeholder={exigeJustificativa ? 'Justificativa obrigatória para esta ação' : 'Justificativa (opcional)'}
            onChange={(evento) => setJustificativa(evento.target.value)}
            onBlur={() => {
              if (pendente || (item.avaliacao.justificativa ?? '') !== justificativa) {
                void gravar({ acao: acaoLocal, justificativa, destino });
              }
            }}
          />
        ) : (
          <span className="texto-2">{item.avaliacao.justificativa ?? ''}</span>
        )}
      </td>

      <td>
        <span className={`selo ${item.avaliacao.status === 'homologada' ? 'selo-homologada'
          : item.avaliacao.status === 'preenchida' ? 'selo-manter' : 'selo-pendente'}`}>
          {ROTULO_STATUS[item.avaliacao.status]}
        </span>
        {alertaGrave && (
          <span className="marca-alerta" title={item.alertas.map((alerta) => alerta.mensagem).join('\n')}>⚠</span>
        )}
      </td>

      {colunasExtras.map((campo) => (
        <td key={campo.chave} className="limite texto-2">{formatarCampo(item.dados[campo.chave], campo.tipo)}</td>
      ))}

      <td>
        <button className="btn btn-pequeno" type="button" onClick={aoAbrirDetalhe}>Detalhes</button>
      </td>
    </tr>
  );
}

/** Marca a mesma decisão para todos os selecionados, com as mesmas validações da linha. */
function ModalLote({ quantidade, aoFechar, aoAplicar }: {
  quantidade: number;
  aoFechar: () => void;
  aoAplicar: (entrada: Record<string, unknown>) => Promise<Array<{ chapa: string; erro: string }>>;
}) {
  const contexto = useContextoApp();
  const [acao, setAcao] = useState('');
  const [justificativa, setJustificativa] = useState('');
  const [destino, setDestino] = useState('');
  const [novaDiretoria, setNovaDiretoria] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [erros, setErros] = useState<Array<{ chapa: string; erro: string }>>([]);
  const configurada = contexto.acoes.find((opcao) => opcao.valor === acao);

  return (
    <Modal
      titulo={`Aplicar ação a ${quantidade} colaborador(es)`}
      aoFechar={aoFechar}
      largura={640}
      rodape={
        <>
          <button className="btn" type="button" onClick={aoFechar}>Cancelar</button>
          <button
            className="btn btn-primario"
            type="button"
            disabled={aplicando}
            onClick={async () => {
              setAplicando(true);
              const falhas = await aoAplicar({
                acao: acao || null,
                justificativa,
                destino,
                nova_diretoria_id: novaDiretoria ? Number(novaDiretoria) : null,
              });
              setErros(falhas);
              setAplicando(false);
            }}
          >
            {aplicando ? 'Aplicando...' : 'Aplicar a todos'}
          </button>
        </>
      }
    >
      <p className="texto-2 pequeno">
        A mesma ação e justificativa serão gravadas nos colaboradores selecionados. Cada linha passa pelas mesmas
        validações da edição individual: quem tiver alerta de estabilidade ou exigir destino específico continua
        precisando de tratamento caso a caso — e aparece na lista de pendências abaixo.
      </p>
      <div className="campo">
        <label>Ação indicada</label>
        <select value={acao} onChange={(evento) => setAcao(evento.target.value)}>
          <option value="">Sem decisão</option>
          {contexto.acoes.map((opcao) => <option key={opcao.id} value={opcao.valor}>{opcao.valor}</option>)}
        </select>
      </div>
      {configurada?.exige_destino && (
        <div className="grade-2" style={{ marginTop: 10 }}>
          <div className="campo">
            <label>Nova Diretoria</label>
            <select value={novaDiretoria} onChange={(evento) => setNovaDiretoria(evento.target.value)}>
              <option value="">Selecione</option>
              {contexto.todas_diretorias.map((diretoria) => (
                <option key={diretoria.id} value={diretoria.id}>{diretoria.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Setor / área / nº do processo</label>
            <input value={destino} onChange={(evento) => setDestino(evento.target.value)} />
          </div>
        </div>
      )}
      <div className="campo" style={{ marginTop: 10 }}>
        <label>Justificativa{configurada?.exige_justificativa ? ' (obrigatória para esta ação)' : ''}</label>
        <textarea rows={3} value={justificativa} onChange={(evento) => setJustificativa(evento.target.value)} />
      </div>

      {erros.length > 0 && (
        <>
          <div className="msg msg-atencao" style={{ marginTop: 14 }}>
            {erros.length} colaborador(es) não receberam a ação e precisam ser tratados individualmente:
          </div>
          <ul className="pequeno">
            {erros.map((falha, indice) => <li key={indice}><strong>{falha.chapa}</strong>: {falha.erro}</li>)}
          </ul>
        </>
      )}
    </Modal>
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
