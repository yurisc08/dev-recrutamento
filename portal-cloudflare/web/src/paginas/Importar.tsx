import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Cartao, Tabela } from '../componentes/Comuns';
import { dataBR, dataHoraBR, numeroBR } from '../formato';
import { acharCabecalho, lerPlanilha, type AbaLida } from '../planilha';

interface Simulacao {
  total_linhas: number;
  novos: number;
  alterados: number;
  inalterados: number;
  erros: number;
  com_avaliacao: number;
  amostra_novos: Array<{ linha: number; chapa: string; nome: string }>;
  amostra_alterados: Array<{ chapa: string; nome: string; mudancas: Array<{ campo: string; de: any; para: any }> }>;
  amostra_erros: Array<{ linha: number; chapa: string; erro: string }>;
}

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizar = (texto: unknown) => semAcento(String(texto ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Cabeçalhos repetidos ganham sufixo para continuarem sendo chaves distintas. */
function nomearColunas(linha: string[]): string[] {
  const usados = new Map<string, number>();
  return linha.map((bruto, indice) => {
    const rotulo = String(bruto ?? '').trim() || `Coluna ${indice + 1}`;
    const vezes = (usados.get(rotulo) ?? 0) + 1;
    usados.set(rotulo, vezes);
    return vezes === 1 ? rotulo : `${rotulo} (${vezes})`;
  });
}

export function Importar() {
  const { contexto, avisar } = useSessao();
  const entradaArquivo = useRef<HTMLInputElement>(null);

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [abas, setAbas] = useState<AbaLida[]>([]);
  const [abaAtual, setAbaAtual] = useState('');
  const [linhaCabecalho, setLinhaCabecalho] = useState(1);
  const [destinos, setDestinos] = useState<Record<string, string>>({});
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [resultado, setResultado] = useState<any | null>(null);
  const [importarDecisoes, setImportarDecisoes] = useState(false);
  const [criarEstrutura, setCriarEstrutura] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);

  const carregarHistorico = () => {
    api.get<{ itens: any[] }>('/api/auditoria/importacoes')
      .then((dados) => setHistorico(dados.itens))
      .catch(() => setHistorico([]));
  };
  useEffect(carregarHistorico, []);

  const campos = contexto?.campos.filter((campo) => campo.ativo) ?? [];
  const aba = abas.find((item) => item.nome === abaAtual) ?? null;

  const colunas = useMemo(() => (aba ? nomearColunas(aba.linhas[linhaCabecalho - 1] ?? []) : []), [aba, linhaCabecalho]);
  const primeiraAmostra = aba?.linhas[linhaCabecalho] ?? [];

  /** Casa cabeçalho da planilha com rótulo/chave do campo configurado no portal. */
  function sugerir(nomesColunas: string[]): Record<string, string> {
    const sugestao: Record<string, string> = {};
    const tomados = new Set<string>();
    for (const coluna of nomesColunas) {
      const alvo = normalizar(coluna);
      if (!alvo) continue;
      const campo = campos.find((c) => !tomados.has(c.chave)
        && (normalizar(c.rotulo) === alvo || normalizar(c.chave) === alvo));
      if (campo) { sugestao[coluna] = campo.chave; tomados.add(campo.chave); }
    }
    return sugestao;
  }

  /**
   * Qual aba abrir primeiro. A planilha-modelo tem uma aba de instruções antes da
   * base, e abrir a primeira do arquivo levava o RH a conferir a aba errada.
   * A aba com o cabeçalho mais largo é a que tem os dados.
   */
  function melhorAba(lista: AbaLida[]): AbaLida {
    let escolhida = lista[0];
    let largura = -1;
    for (const item of lista) {
      const cabecalho = item.linhas[acharCabecalho(item.linhas)] ?? [];
      const colunas = cabecalho.filter((celula) => String(celula ?? '').trim()).length;
      if (colunas > largura) { largura = colunas; escolhida = item; }
    }
    return escolhida;
  }

  function trocarAba(lista: AbaLida[], nome: string) {
    const escolhida = lista.find((item) => item.nome === nome) ?? lista[0];
    const cabecalho = acharCabecalho(escolhida.linhas) + 1;
    const nomes = nomearColunas(escolhida.linhas[cabecalho - 1] ?? []);
    setAbaAtual(escolhida.nome);
    setLinhaCabecalho(cabecalho);
    setDestinos(sugerir(nomes));
    setSimulacao(null);
  }

  async function abrirArquivo(selecionado: File) {
    setOcupado(true);
    setSimulacao(null);
    setResultado(null);
    try {
      const lidas = await lerPlanilha(selecionado);
      setArquivo(selecionado);
      setAbas(lidas);
      trocarAba(lidas, melhorAba(lidas).nome);
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
      setArquivo(null);
      setAbas([]);
    } finally {
      setOcupado(false);
    }
  }

  function ajustarCabecalho(numero: number) {
    if (!aba) return;
    const nomes = nomearColunas(aba.linhas[numero - 1] ?? []);
    setLinhaCabecalho(numero);
    setDestinos(sugerir(nomes));
    setSimulacao(null);
  }

  /** Monta o pacote enviado à API: só as colunas escolhidas saem do navegador. */
  function montarEnvio() {
    if (!aba) return null;
    const mapeamento: Record<string, string> = {};
    for (const [coluna, chave] of Object.entries(destinos)) {
      if (chave) mapeamento[chave] = coluna;
    }
    const usadas = Object.values(mapeamento);
    const linhas = aba.linhas.slice(linhaCabecalho).map((celulas) => {
      const registro: Record<string, string> = {};
      for (const coluna of usadas) {
        const indice = colunas.indexOf(coluna);
        registro[coluna] = indice >= 0 ? String(celulas[indice] ?? '').trim() : '';
      }
      return registro;
    }).filter((registro) => Object.values(registro).some((valor) => valor !== ''));

    return { arquivo: arquivo?.name ?? '', aba: aba.nome, mapeamento, linhas };
  }

  async function simular() {
    const envio = montarEnvio();
    if (!envio) return;
    if (!envio.mapeamento.chapa) {
      avisar('Indique qual coluna da planilha contém a matrícula (CHAPA).', 'erro');
      return;
    }
    setOcupado(true);
    try {
      setSimulacao(await api.post<Simulacao>('/api/importacao/simular', envio));
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    const envio = montarEnvio();
    if (!envio) return;
    if (!window.confirm('Confirmar a carga? Os dados da base serão atualizados.')) return;
    setOcupado(true);
    try {
      const dados = await api.post<any>('/api/importacao/confirmar', {
        ...envio, importar_decisoes: importarDecisoes, criar_estrutura: criarEstrutura,
      });
      setResultado(dados);
      setArquivo(null);
      setAbas([]);
      setSimulacao(null);
      if (entradaArquivo.current) entradaArquivo.current.value = '';
      carregarHistorico();
      avisar('Base atualizada.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  // Só as linhas com conteúdo: a planilha-modelo traz milhares de linhas vazias
  // com a lista suspensa, e contá-las assustava ("1999 linhas de dados").
  const totalLinhas = aba
    ? aba.linhas.slice(linhaCabecalho).filter((l) => l.some((c) => String(c ?? '').trim())).length
    : 0;
  const mapeados = Object.values(destinos).filter(Boolean).length;

  return (
    <>
      <Cartao titulo="Importar Excel" dica="o arquivo é lido no seu computador; só as colunas escolhidas sobem">
        <p className="texto-2 pequeno">
          A chave de atualização é a <strong>matrícula (CHAPA)</strong>: matrículas novas são incluídas e as existentes
          atualizadas. As avaliações feitas no portal ficam em tabela separada e <strong>não</strong> são apagadas pela carga.
        </p>
        <div className="linha">
          <div className="campo" style={{ flex: 2 }}>
            <label htmlFor="arquivo-planilha">Arquivo .xlsx</label>
            <input id="arquivo-planilha" ref={entradaArquivo} type="file" accept=".xlsx,.xlsm" disabled={ocupado}
                   onChange={(evento) => {
                     const selecionado = evento.target.files?.[0];
                     if (selecionado) void abrirArquivo(selecionado);
                   }} />
          </div>
        </div>
      </Cartao>

      {resultado && (
        <Cartao titulo="Carga concluída">
          <div className="msg msg-ok">
            {numeroBR(resultado.linhas)} linha(s) lidas · {numeroBR(resultado.novos)} incluída(s) ·{' '}
            {numeroBR(resultado.alterados)} atualizada(s) · {numeroBR(resultado.inalterados)} sem mudança ·{' '}
            {numeroBR(resultado.total_erros)} com erro.
          </div>
          {resultado.erros?.length > 0 && (
            <ul className="pequeno">
              {resultado.erros.map((erro: any, indice: number) => (
                <li key={indice}>Linha {erro.linha} {erro.chapa && `(${erro.chapa})`}: {erro.erro}</li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {aba && (
        <Cartao titulo={`Conferência — ${arquivo?.name ?? ''}`}
                dica={`${totalLinhas} linha(s) de dados · ${mapeados} coluna(s) mapeada(s)`}>
          <div className="linha">
            {abas.length > 1 && (
              <div className="campo" style={{ maxWidth: 320 }}>
                <label htmlFor="aba-planilha">Aba da planilha</label>
                <select id="aba-planilha" value={abaAtual} onChange={(evento) => trocarAba(abas, evento.target.value)}>
                  {abas.map((item) => (
                    <option key={item.nome} value={item.nome}>{item.nome} ({item.linhas.length} linhas)</option>
                  ))}
                </select>
              </div>
            )}
            <div className="campo" style={{ maxWidth: 200 }}>
              <label htmlFor="linha-cabecalho">Linha do cabeçalho</label>
              <input id="linha-cabecalho" type="number" min={1} max={aba.linhas.length} value={linhaCabecalho}
                     onChange={(evento) => ajustarCabecalho(Math.max(Number(evento.target.value) || 1, 1))} />
            </div>
          </div>

          <div className="tabela-caixa" style={{ maxHeight: 360, overflow: 'auto' }}>
            <table>
              <thead>
                <tr><th>Coluna da planilha</th><th>Exemplo</th><th>Destino no portal</th></tr>
              </thead>
              <tbody>
                {colunas.map((coluna, indice) => (
                  <tr key={coluna}>
                    <td>{coluna}</td>
                    <td className="texto-3 limite">{String(primeiraAmostra[indice] ?? '')}</td>
                    <td>
                      <select
                        value={destinos[coluna] ?? ''}
                        onChange={(evento) => setDestinos({ ...destinos, [coluna]: evento.target.value })}
                      >
                        <option value="">— ignorar —</option>
                        {campos.map((campo) => (
                          <option key={campo.chave} value={campo.chave}>
                            {campo.rotulo}{campo.origem === 'avaliacao' ? ' (avaliação)' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="linha" style={{ marginTop: 12 }}>
            <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={criarEstrutura} style={{ width: 'auto' }}
                     onChange={(evento) => setCriarEstrutura(evento.target.checked)} />
              Criar Diretorias/Divisões que não existirem
            </label>
            <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={importarDecisoes} style={{ width: 'auto' }}
                     onChange={(evento) => setImportarDecisoes(evento.target.checked)} />
              Importar também as decisões da planilha (sobrescreve o portal)
            </label>
            <span className="espaco" />
            <button className="btn" type="button" onClick={() => { setAbas([]); setArquivo(null); setSimulacao(null); }}>
              Cancelar
            </button>
            <button className="btn btn-primario" type="button" onClick={simular} disabled={ocupado}>
              Conferir alterações
            </button>
          </div>
        </Cartao>
      )}

      {simulacao && aba && (
        <Cartao titulo="Prévia da carga" dica="nada foi gravado ainda">
          <div className="kpis">
            <div className="kpi"><div className="rotulo">Linhas lidas</div><div className="valor">{numeroBR(simulacao.total_linhas)}</div></div>
            <div className="kpi"><div className="rotulo">Novos</div><div className="valor">{numeroBR(simulacao.novos)}</div></div>
            <div className="kpi"><div className="rotulo">Alterados</div><div className="valor">{numeroBR(simulacao.alterados)}</div></div>
            <div className="kpi"><div className="rotulo">Sem mudança</div><div className="valor">{numeroBR(simulacao.inalterados)}</div></div>
            <div className={`kpi${simulacao.erros ? ' destaque' : ''}`}>
              <div className="rotulo">Com erro</div><div className="valor">{numeroBR(simulacao.erros)}</div>
              <div className="nota">essas linhas não serão gravadas</div>
            </div>
          </div>

          {simulacao.com_avaliacao > 0 && (
            <div className="msg msg-atencao">
              {simulacao.com_avaliacao} colaborador(es) desta carga já possuem avaliação preenchida no portal.
              {importarDecisoes
                ? ' Com a opção marcada, as decisões da planilha vão sobrescrever as do portal.'
                : ' As avaliações serão preservadas.'}
            </div>
          )}

          {simulacao.amostra_erros.length > 0 && (
            <>
              <h3 className="pequeno" style={{ marginTop: 8 }}>Erros encontrados</h3>
              <Tabela
                cabecalhos={['Linha', 'Matrícula', 'Problema']}
                linhas={simulacao.amostra_erros.map((erro) => [erro.linha, erro.chapa || '—', erro.erro])}
              />
            </>
          )}
          {simulacao.amostra_novos.length > 0 && (
            <>
              <h3 className="pequeno" style={{ marginTop: 14 }}>Registros novos (amostra)</h3>
              <Tabela
                cabecalhos={['Linha', 'Matrícula', 'Nome']}
                linhas={simulacao.amostra_novos.map((novo) => [novo.linha, novo.chapa, novo.nome])}
              />
            </>
          )}
          {simulacao.amostra_alterados.length > 0 && (
            <>
              <h3 className="pequeno" style={{ marginTop: 14 }}>Registros alterados (amostra)</h3>
              <Tabela
                cabecalhos={['Matrícula', 'Nome', 'Alterações']}
                linhas={simulacao.amostra_alterados.map((alterado) => [
                  alterado.chapa,
                  alterado.nome,
                  alterado.mudancas.map((mudanca) => `${mudanca.campo}: "${mudanca.de ?? ''}" → "${mudanca.para ?? ''}"`).join(' · '),
                ])}
              />
            </>
          )}

          <div className="linha" style={{ marginTop: 14 }}>
            <span className="espaco" />
            <button className="btn" type="button" onClick={() => setSimulacao(null)}>Voltar</button>
            <button className="btn btn-primario" type="button" onClick={confirmar} disabled={ocupado}>
              Confirmar carga
            </button>
          </div>
        </Cartao>
      )}

      <Cartao titulo="Histórico de importações">
        <Tabela
          cabecalhos={['Data', 'Usuário', 'Arquivo', 'Data-base', 'Linhas', 'Novos', 'Alterados', 'Erros', 'Status']}
          numericas={[4, 5, 6, 7]}
          vazio="Nenhuma carga realizada."
          linhas={historico.map((item) => [
            dataHoraBR(item.criado_em), item.usuario ?? item.usuario_nome, item.arquivo, dataBR(item.data_base),
            numeroBR(item.linhas), numeroBR(item.novos), numeroBR(item.alterados), numeroBR(item.erros),
            <span className="selo selo-manter">{item.status}</span>,
          ])}
        />
      </Cartao>
    </>
  );
}
