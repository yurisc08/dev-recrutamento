import { useEffect, useState } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Cartao, Tabela } from '../componentes/Comuns';
import { dataBR, dataHoraBR, numeroBR } from '../formato';

interface Analise {
  token: string;
  arquivo: string;
  abas: Array<{ nome: string; linhas: number }>;
  aba: string;
  linha_cabecalho: number;
  total_linhas: number;
  cabecalhos: Array<{ indice: number; rotulo: string }>;
  previa: any[][];
  mapeamento_sugerido: Record<string, string | null>;
  campos: Array<{ chave: string; rotulo: string; origem: string }>;
}

interface Simulacao {
  total_linhas: number;
  novos: number;
  alterados: number;
  inalterados: number;
  erros: number;
  com_avaliacao: number;
  amostra_novos: Array<{ linha: number; chapa: string; nome: string }>;
  amostra_alterados: Array<{ linha: number; chapa: string; nome: string; mudancas: Array<{ campo: string; de: any; para: any }> }>;
  amostra_erros: Array<{ linha: number; chapa: string; erros: string[] }>;
}

export function Importar() {
  const { avisar } = useSessao();
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [mapeamento, setMapeamento] = useState<Record<string, string>>({});
  const [simulacao, setSimulacao] = useState<Simulacao | null>(null);
  const [resultado, setResultado] = useState<any | null>(null);
  const [importarDecisoes, setImportarDecisoes] = useState(false);
  const [criarEstrutura, setCriarEstrutura] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [historico, setHistorico] = useState<any[]>([]);

  const carregarHistorico = () => {
    api.get<{ itens: any[] }>('/api/importacao/historico')
      .then((dados) => setHistorico(dados.itens))
      .catch(() => setHistorico([]));
  };
  useEffect(carregarHistorico, []);

  async function enviarArquivo(arquivo: File, aba?: string) {
    setOcupado(true);
    setSimulacao(null);
    setResultado(null);
    try {
      const formulario = new FormData();
      formulario.append('arquivo', arquivo);
      if (aba) formulario.append('aba', aba);
      const dados = await api.post<Analise>('/api/importacao/analisar', formulario);
      setAnalise(dados);
      const inicial: Record<string, string> = {};
      for (const [indice, chave] of Object.entries(dados.mapeamento_sugerido)) {
        if (chave) inicial[indice] = chave;
      }
      setMapeamento(inicial);
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  async function simular() {
    if (!analise) return;
    setOcupado(true);
    try {
      setSimulacao(await api.post<Simulacao>('/api/importacao/simular', {
        token: analise.token, aba: analise.aba, linha_cabecalho: analise.linha_cabecalho, mapeamento,
      }));
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  async function confirmar() {
    if (!analise) return;
    if (!window.confirm('Confirmar a carga? Os dados da base serão atualizados.')) return;
    setOcupado(true);
    try {
      const dados = await api.post<any>('/api/importacao/confirmar', {
        token: analise.token,
        aba: analise.aba,
        linha_cabecalho: analise.linha_cabecalho,
        mapeamento,
        arquivo: analise.arquivo,
        importar_decisoes: importarDecisoes,
        criar_estrutura: criarEstrutura,
      });
      setResultado(dados);
      setAnalise(null);
      setSimulacao(null);
      carregarHistorico();
      avisar('Base atualizada.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      <Cartao titulo="Importar Excel" dica="a carga só acontece depois da conferência">
        <p className="texto-2 pequeno">
          A chave de atualização é a <strong>matrícula (CHAPA)</strong>: matrículas novas são incluídas e as existentes
          atualizadas. As avaliações feitas no portal ficam em tabela separada e <strong>não</strong> são apagadas pela carga.
        </p>
        <div className="linha">
          <div className="campo" style={{ flex: 2 }}>
            <label>Arquivo .xlsx</label>
            <input type="file" accept=".xlsx,.xlsm" disabled={ocupado}
                   onChange={(evento) => { const arquivo = evento.target.files?.[0]; if (arquivo) void enviarArquivo(arquivo); }} />
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
                <li key={indice}>Linha {erro.linha} {erro.chapa && `(${erro.chapa})`}: {erro.erros.join(' ')}</li>
              ))}
            </ul>
          )}
        </Cartao>
      )}

      {analise && (
        <Cartao titulo={`Conferência — ${analise.arquivo}`}
                dica={`aba "${analise.aba}", cabeçalho na linha ${analise.linha_cabecalho}, ${analise.total_linhas} linha(s)`}>
          {analise.abas.length > 1 && (
            <div className="campo" style={{ maxWidth: 320, marginBottom: 12 }}>
              <label>Aba da planilha</label>
              <select value={analise.aba} onChange={(evento) => {
                const arquivo = (document.querySelector('input[type=file]') as HTMLInputElement)?.files?.[0];
                if (arquivo) void enviarArquivo(arquivo, evento.target.value);
              }}>
                {analise.abas.map((aba) => <option key={aba.nome} value={aba.nome}>{aba.nome} ({aba.linhas} linhas)</option>)}
              </select>
            </div>
          )}

          <div className="tabela-caixa" style={{ maxHeight: 360, overflow: 'auto' }}>
            <table>
              <thead>
                <tr><th>Coluna da planilha</th><th>Exemplo</th><th>Destino no portal</th></tr>
              </thead>
              <tbody>
                {analise.cabecalhos.filter((cabecalho) => cabecalho.rotulo).map((cabecalho) => (
                  <tr key={cabecalho.indice}>
                    <td>{cabecalho.rotulo}</td>
                    <td className="texto-3 limite">{String(analise.previa[0]?.[cabecalho.indice - 1] ?? '')}</td>
                    <td>
                      <select
                        value={mapeamento[cabecalho.indice] ?? ''}
                        onChange={(evento) => setMapeamento({ ...mapeamento, [cabecalho.indice]: evento.target.value })}
                      >
                        <option value="">— ignorar —</option>
                        {analise.campos.map((campo) => (
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
            <button className="btn" type="button" onClick={() => { setAnalise(null); setSimulacao(null); }}>Cancelar</button>
            <button className="btn btn-primario" type="button" onClick={simular} disabled={ocupado}>
              Conferir alterações
            </button>
          </div>
        </Cartao>
      )}

      {simulacao && analise && (
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
                linhas={simulacao.amostra_erros.map((erro) => [erro.linha, erro.chapa || '—', erro.erros.join(' ')])}
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
