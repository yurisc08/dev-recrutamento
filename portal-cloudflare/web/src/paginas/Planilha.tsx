import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useContextoApp, useSessao } from '../sessao';
import { Cartao } from '../componentes/Comuns';
import { formatarCampo } from '../formato';
import type { Campo, Colaborador } from '../tipos';
import { exportarPlanilha } from '../exportacao';

/**
 * A base como uma planilha: a mesma grade do Excel, com as regras do portal.
 *
 * O que a grade NÃO faz é decidir quem pode escrever onde: isso vem do catálogo
 * (`editavel_por`, `somente_leitura`, `sensivel`) e é conferido de novo no
 * servidor a cada gravação. Aqui a célula bloqueada só fica cinza.
 */

const POR_PAGINA = 500;
const ALTURA_LINHA = 34;   // tem que bater com o CSS .grade-planilha td
const FOLGA = 8;           // linhas extras acima e abaixo da janela visível
const L_MATRICULA = 96;    // tem que bater com .fixa-1
const L_NOME = 190;        // tem que bater com .fixa-2 (e com o "left" dela)
const L_COLUNA = 170;

interface Celula { linha: number; coluna: number }

/** Colunas da grade: as da base que a pessoa enxerga, mais as três da decisão. */
function montarColunas(campos: Campo[]): Campo[] {
  const ativos = campos.filter((c) => c.ativo);
  const base = ativos.filter((c) => c.origem === 'base');
  const decisao = ativos.filter((c) => c.origem === 'avaliacao');
  return [...base, ...decisao];
}

function valorDaCelula(item: Colaborador, campo: Campo): string {
  if (campo.origem === 'avaliacao') {
    if (campo.chave === 'acao') return item.avaliacao.acao ?? '';
    if (campo.chave === 'justificativa') return item.avaliacao.justificativa ?? '';
    if (campo.chave === 'destino') return item.avaliacao.destino ?? '';
    return '';
  }
  const bruto = item.dados[campo.chave];
  return bruto === null || bruto === undefined ? '' : String(bruto);
}

export function Planilha() {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [itens, setItens] = useState<Colaborador[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [somentePendentes, setSomentePendentes] = useState(false);

  // chave "idDoColaborador:chaveDoCampo" -> texto digitado
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [errosLinha, setErrosLinha] = useState<Record<number, string>>({});
  const [celula, setCelula] = useState<Celula>({ linha: 0, coluna: 0 });
  const [editando, setEditando] = useState(false);
  const [topo, setTopo] = useState(0);
  const [altura, setAltura] = useState(600);

  const caixaRef = useRef<HTMLDivElement>(null);
  const entradaRef = useRef<HTMLInputElement>(null);
  const listaRef = useRef<HTMLSelectElement>(null);

  const colunas = useMemo(() => montarColunas(contexto.campos), [contexto.campos]);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const resposta = await api.get<{ itens: Colaborador[]; total: number }>(
        `/api/colaboradores?pagina=1&por_pagina=${POR_PAGINA}`);
      setItens(resposta.itens);
      if (resposta.total > resposta.itens.length) {
        avisar(`Mostrando as primeiras ${resposta.itens.length} de ${resposta.total} linhas. Use a busca para chegar no resto.`);
      }
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setCarregando(false);
    }
  }, [avisar]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    const medir = () => setAltura(caixaRef.current?.clientHeight ?? 600);
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, []);

  const visiveis = useMemo(() => {
    const texto = busca.trim().toLowerCase();
    return itens.filter((item) => {
      if (somentePendentes && item.avaliacao.acao) return false;
      if (!texto) return true;
      return `${item.chapa} ${item.nome ?? ''} ${item.dados.des_cargo ?? ''}`.toLowerCase().includes(texto);
    });
  }, [itens, busca, somentePendentes]);

  function podeEditar(item: Colaborador, campo: Campo): boolean {
    if (campo.origem === 'avaliacao') {
      if (!contexto.permissoes.avaliar) return false;
      if (contexto.usuario.perfil === 'gestor' && item.avaliacao.status === 'homologada') return false;
      return true;
    }
    // Campo sensível nem chega ao catálogo de quem não é RH: o servidor tira antes.
    if (campo.somente_leitura && contexto.usuario.perfil !== 'admin') return false;
    return contexto.usuario.perfil === 'admin';
  }

  const chaveDe = (item: Colaborador, campo: Campo) => `${item.id}:${campo.chave}`;

  /**
   * Sair da edição SEMPRE devolve o foco à grade. Sem isto, depois de mexer numa
   * célula o foco fica no editor que acabou de sumir e as setas param de andar.
   */
  function fecharEditor() {
    setEditando(false);
    caixaRef.current?.focus({ preventScroll: true });
  }

  function textoAtual(item: Colaborador, campo: Campo): string {
    const chave = chaveDe(item, campo);
    return chave in rascunho ? rascunho[chave] : valorDaCelula(item, campo);
  }

  function alterado(item: Colaborador, campo: Campo): boolean {
    const chave = chaveDe(item, campo);
    return chave in rascunho && rascunho[chave] !== valorDaCelula(item, campo);
  }

  function escrever(item: Colaborador, campo: Campo, texto: string) {
    if (!podeEditar(item, campo)) return;
    setRascunho((atual) => ({ ...atual, [chaveDe(item, campo)]: texto }));
  }

  const pendentes = useMemo(() => Object.entries(rascunho).filter(([chave, texto]) => {
    const [id, campoChave] = chave.split(':');
    const item = itens.find((i) => String(i.id) === id);
    const campo = colunas.find((c) => c.chave === campoChave);
    return item && campo && texto !== valorDaCelula(item, campo);
  }), [rascunho, itens, colunas]);

  /* --------------------------- gravação em lote -------------------------- */

  async function salvar() {
    if (!pendentes.length) return;
    setSalvando(true);
    setErrosLinha({});
    try {
      const porLinha = new Map<number, any>();
      for (const [chave, texto] of pendentes) {
        const [id, campoChave] = chave.split(':');
        const campo = colunas.find((c) => c.chave === campoChave)!;
        const alvo = porLinha.get(Number(id)) ?? { id: Number(id) };
        if (campo.origem === 'avaliacao') alvo[campo.chave] = texto;
        else alvo.dados = { ...(alvo.dados ?? {}), [campo.chave]: texto };
        porLinha.set(Number(id), alvo);
      }
      const resposta = await api.post<{ salvos: number; itens: Colaborador[]; erros: Array<{ id: number; erro: string }> }>(
        '/api/colaboradores/planilha', { alteracoes: [...porLinha.values()] });

      // O que salvou sai do rascunho; o que deu erro fica na tela para corrigir.
      const comErro = new Set(resposta.erros.map((e) => e.id));
      setRascunho((atual) => {
        const proximo: Record<string, string> = {};
        for (const [chave, texto] of Object.entries(atual)) {
          if (comErro.has(Number(chave.split(':')[0]))) proximo[chave] = texto;
        }
        return proximo;
      });
      setErrosLinha(Object.fromEntries(resposta.erros.map((e) => [e.id, e.erro])));

      // Levar a pessoa até a primeira linha recusada. Numa base grande, saber que
      // "1 linha foi recusada" sem saber qual não serve para nada.
      if (resposta.erros.length) {
        const primeiroErro = visiveis.findIndex((item) => item.id === resposta.erros[0].id);
        if (primeiroErro >= 0) irPara(primeiroErro, celula.coluna);
      }
      if (resposta.itens.length) {
        const porId = new Map(resposta.itens.map((i) => [i.id, i]));
        setItens((atual) => atual.map((i) => porId.get(i.id) ?? i));
      }
      if (resposta.erros.length) {
        avisar(`${resposta.salvos} linha(s) salva(s), ${resposta.erros.length} com problema.`, 'erro');
      } else {
        avisar(`${resposta.salvos} linha(s) salva(s).`);
      }
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setSalvando(false);
    }
  }

  function descartar() {
    if (!pendentes.length) return;
    if (!window.confirm(`Descartar ${pendentes.length} alteração(ões) não salva(s)?`)) return;
    setRascunho({});
    setErrosLinha({});
  }

  /* ------------------------------- teclado ------------------------------- */

  function irPara(linha: number, coluna: number) {
    const l = Math.max(0, Math.min(linha, visiveis.length - 1));
    const c = Math.max(0, Math.min(coluna, colunas.length - 1));
    setCelula({ linha: l, coluna: c });
    fecharEditor();
    const caixa = caixaRef.current;
    if (!caixa) return;
    const alvo = l * ALTURA_LINHA;
    if (alvo < caixa.scrollTop) caixa.scrollTop = alvo;
    else if (alvo + ALTURA_LINHA > caixa.scrollTop + caixa.clientHeight - ALTURA_LINHA) {
      caixa.scrollTop = alvo - caixa.clientHeight + 2 * ALTURA_LINHA;
    }
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLDivElement>) {
    const item = visiveis[celula.linha];
    const campo = colunas[celula.coluna];
    if (!item || !campo) return;

    if (editando) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        setRascunho((atual) => {
          const proximo = { ...atual };
          delete proximo[chaveDe(item, campo)];
          return proximo;
        });
        fecharEditor();
      } else if (evento.key === 'Enter') {
        evento.preventDefault();
        irPara(celula.linha + 1, celula.coluna);
      } else if (evento.key === 'Tab') {
        evento.preventDefault();
        irPara(celula.linha, celula.coluna + (evento.shiftKey ? -1 : 1));
      }
      return;
    }

    switch (evento.key) {
      case 'ArrowDown': evento.preventDefault(); irPara(celula.linha + 1, celula.coluna); break;
      case 'ArrowUp': evento.preventDefault(); irPara(celula.linha - 1, celula.coluna); break;
      case 'ArrowRight': evento.preventDefault(); irPara(celula.linha, celula.coluna + 1); break;
      case 'ArrowLeft': evento.preventDefault(); irPara(celula.linha, celula.coluna - 1); break;
      case 'Tab': evento.preventDefault(); irPara(celula.linha, celula.coluna + (evento.shiftKey ? -1 : 1)); break;
      case 'Enter': case 'F2':
        evento.preventDefault();
        if (podeEditar(item, campo)) {
          setEditando(true);
          // Só <input> tem select(); a lista suspensa da AÇÃO INDICADA não.
          setTimeout(() => entradaRef.current?.select?.(), 0);
        }
        break;
      case 'Delete': case 'Backspace':
        evento.preventDefault();
        escrever(item, campo, '');
        break;
      case 'PageDown': evento.preventDefault(); irPara(celula.linha + 20, celula.coluna); break;
      case 'PageUp': evento.preventDefault(); irPara(celula.linha - 20, celula.coluna); break;
      case 'Home': evento.preventDefault(); irPara(celula.linha, 0); break;
      case 'End': evento.preventDefault(); irPara(celula.linha, colunas.length - 1); break;
      default:
        // Começar a digitar substitui o conteúdo, como no Excel.
        if (evento.key.length === 1 && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
          if (!podeEditar(item, campo)) return;
          evento.preventDefault();
          escrever(item, campo, evento.key);
          setEditando(true);
        }
    }
  }

  /** Colar um bloco vindo do Excel: linhas por \n, colunas por tabulação. */
  function aoColar(evento: React.ClipboardEvent<HTMLDivElement>) {
    if (editando) return;
    const texto = evento.clipboardData.getData('text/plain');
    if (!texto) return;
    evento.preventDefault();
    const bloco = texto.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'));

    const novos: Record<string, string> = {};
    let bloqueadas = 0;
    bloco.forEach((linhaTexto, dl) => {
      const item = visiveis[celula.linha + dl];
      if (!item) return;
      linhaTexto.forEach((valor, dc) => {
        const campo = colunas[celula.coluna + dc];
        if (!campo) return;
        if (!podeEditar(item, campo)) { bloqueadas += 1; return; }
        novos[chaveDe(item, campo)] = valor;
      });
    });
    setRascunho((atual) => ({ ...atual, ...novos }));
    const coladas = Object.keys(novos).length;
    avisar(bloqueadas
      ? `${coladas} célula(s) coladas; ${bloqueadas} ignorada(s) por serem bloqueadas para o seu perfil.`
      : `${coladas} célula(s) coladas. Confira e clique em Salvar.`);
  }

  /* ------------------------------ renderização --------------------------- */

  const primeira = Math.max(0, Math.floor(topo / ALTURA_LINHA) - FOLGA);
  const ultima = Math.min(visiveis.length, Math.ceil((topo + altura) / ALTURA_LINHA) + FOLGA);
  const janela = visiveis.slice(primeira, ultima);

  const itemAtual = visiveis[celula.linha];
  const campoAtual = colunas[celula.coluna];
  const erroAtual = itemAtual ? errosLinha[itemAtual.id] : undefined;
  const linhasComErro = visiveis.filter((item) => errosLinha[item.id]);

  /** Vai para a próxima linha recusada, dando a volta no fim. */
  function irParaProximoErro() {
    if (!linhasComErro.length) return;
    const depois = visiveis.findIndex((item, indice) => indice > celula.linha && errosLinha[item.id]);
    const alvo = depois >= 0 ? depois : visiveis.findIndex((item) => errosLinha[item.id]);
    if (alvo >= 0) irPara(alvo, celula.coluna);
  }

  return (
    <>
      <Cartao titulo="Planilha" dica="a base inteira, editável como no Excel — com as regras e a trilha do portal">
        <div className="linha-filtros" style={{ alignItems: 'flex-end' }}>
          <div className="campo">
            <label htmlFor="busca-planilha">Buscar</label>
            <input id="busca-planilha" value={busca} placeholder="Nome, matrícula, cargo..."
                   onChange={(e) => setBusca(e.target.value)} />
          </div>
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={somentePendentes} style={{ width: 'auto' }}
                   onChange={(e) => setSomentePendentes(e.target.checked)} />
            Só sem decisão
          </label>
          <span className="espaco" />
          {pendentes.length > 0 && (
            <button className="btn" type="button" onClick={descartar} disabled={salvando}>
              Descartar {pendentes.length}
            </button>
          )}
          <button className="btn btn-primario" type="button" onClick={() => void salvar()}
                  disabled={salvando || !pendentes.length}>
            {salvando ? 'Salvando...' : pendentes.length ? `Salvar ${pendentes.length} alteração(ões)` : 'Salvar'}
          </button>
          <button className="btn" type="button"
                  onClick={() => void exportarPlanilha().catch((e) => avisar((e as Error).message, 'erro'))}>
            Exportar Excel
          </button>
        </div>
        <p className="pequeno texto-3" style={{ margin: '8px 0 0' }}>
          Setas para andar · <strong>Enter</strong> ou <strong>F2</strong> edita · digitar substitui ·
          {' '}<strong>Esc</strong> desfaz a célula · <strong>Ctrl+V</strong> cola um bloco do Excel ·
          {' '}célula cinza é bloqueada para o seu perfil. Nada vai para o banco antes de você clicar em Salvar.
        </p>
      </Cartao>

      <div className="tabela-caixa">
        <div className="grade-caixa" ref={caixaRef} tabIndex={0}
             onScroll={(e) => setTopo((e.target as HTMLDivElement).scrollTop)}
             onKeyDown={aoTeclar} onPaste={aoColar}>
          {carregando ? (
            <div className="carregando">Carregando a base...</div>
          ) : (
            <table className="grade-planilha"
                   style={{ width: L_MATRICULA + L_NOME + colunas.length * L_COLUNA }}>
              <colgroup>
                <col style={{ width: L_MATRICULA }} />
                <col style={{ width: L_NOME }} />
                {colunas.map((campo) => <col key={campo.chave} style={{ width: L_COLUNA }} />)}
              </colgroup>
              <thead>
                <tr>
                  <th className="fixa fixa-1">MATRÍCULA</th>
                  <th className="fixa fixa-2">NOME</th>
                  {colunas.map((campo) => (
                    <th key={campo.chave} title={campo.ajuda ?? undefined}
                        className={campo.origem === 'avaliacao' ? 'col-decisao' : undefined}>
                      {campo.rotulo}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {primeira > 0 && <tr style={{ height: primeira * ALTURA_LINHA }}><td colSpan={colunas.length + 2} /></tr>}
                {janela.map((item, indice) => {
                  const linha = primeira + indice;
                  const erro = errosLinha[item.id];
                  return (
                    <tr key={item.id} className={erro ? 'linha-erro' : undefined}>
                      <td className="fixa fixa-1 mono" title={erro}>{item.chapa}</td>
                      <td className="fixa fixa-2 limite" title={erro ?? item.nome ?? ''}>{item.nome}</td>
                      {colunas.map((campo, coluna) => {
                        const selecionada = linha === celula.linha && coluna === celula.coluna;
                        const bloqueada = !podeEditar(item, campo);
                        const texto = textoAtual(item, campo);
                        const classes = [
                          'cel',
                          bloqueada ? 'cel-bloqueada' : '',
                          alterado(item, campo) ? 'cel-alterada' : '',
                          selecionada ? 'cel-ativa' : '',
                        ].filter(Boolean).join(' ');
                        return (
                          <td key={campo.chave} className={classes} data-campo={campo.chave}
                              onMouseDown={() => { setCelula({ linha, coluna }); fecharEditor(); }}
                              onDoubleClick={() => { if (!bloqueada) setEditando(true); }}>
                            {selecionada && editando ? (
                              campo.chave === 'acao' ? (
                                <select ref={listaRef} className="cel-entrada" value={texto} autoFocus
                                        onChange={(e) => { escrever(item, campo, e.target.value); fecharEditor(); }}
                                        onBlur={() => fecharEditor()}>
                                  <option value="">Sem decisão</option>
                                  {contexto.acoes.map((a) => <option key={a.id} value={a.valor}>{a.valor}</option>)}
                                </select>
                              ) : (
                                <input ref={entradaRef} className="cel-entrada" value={texto} autoFocus
                                       onChange={(e) => escrever(item, campo, e.target.value)}
                                       onBlur={() => fecharEditor()} />
                              )
                            ) : (
                              <span className="cel-texto">
                                {campo.origem === 'base' && !alterado(item, campo)
                                  ? formatarCampo(item.dados[campo.chave], campo.tipo)
                                  : texto}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {ultima < visiveis.length && (
                  <tr style={{ height: (visiveis.length - ultima) * ALTURA_LINHA }}>
                    <td colSpan={colunas.length + 2} />
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="barra-planilha">
        <span>{visiveis.length} linha(s) · {colunas.length} coluna(s)</span>
        {itemAtual && campoAtual && (
          <span className="texto-2">
            {itemAtual.chapa} · <strong>{campoAtual.rotulo}</strong>
            {!podeEditar(itemAtual, campoAtual) && ' · somente leitura para o seu perfil'}
          </span>
        )}
        <span className="espaco" />
        {erroAtual && <span className="texto-erro">{erroAtual}</span>}
        {linhasComErro.length > 0 && (
          <button className="btn btn-pequeno" type="button" onClick={irParaProximoErro}>
            {linhasComErro.length} recusada(s) — ir para {linhasComErro.length > 1 ? 'a próxima' : 'ela'}
          </button>
        )}
        {pendentes.length > 0 && <span className="texto-atencao">{pendentes.length} alteração(ões) não salva(s)</span>}
      </div>
    </>
  );
}
