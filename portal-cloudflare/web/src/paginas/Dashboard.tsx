import { useEffect, useState } from 'react';
import { api } from '../api';
import { useContextoApp, useSessao } from '../sessao';
import { Barras, Cartao, Kpi, Tabela } from '../componentes/Comuns';
import { dataBR, diasAte, moedaBR, numeroBR } from '../formato';
import type { Dashboard as DadosDashboard } from '../tipos';
import { exportarPlanilha } from '../exportacao';

export function Dashboard() {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [dados, setDados] = useState<DadosDashboard | null>(null);
  const [diretoriaId, setDiretoriaId] = useState('');
  const [divisaoId, setDivisaoId] = useState('');

  useEffect(() => {
    const parametros = new URLSearchParams();
    if (diretoriaId) parametros.set('diretoria_id', diretoriaId);
    if (divisaoId) parametros.set('divisao_id', divisaoId);
    api.get<DadosDashboard>(`/api/dashboard?${parametros}`)
      .then(setDados)
      .catch((erro) => avisar(erro.message, 'erro'));
  }, [diretoriaId, divisaoId, avisar]);

  if (!dados) return <div className="carregando">Carregando indicadores...</div>;

  const { totais } = dados;
  const perfil = contexto.usuario.perfil;
  const dias = diasAte(dados.processo.prazo);
  const divisoesFiltro = diretoriaId
    ? contexto.todas_divisoes.filter((divisao) => String(divisao.diretoria_id) === diretoriaId)
    : contexto.todas_divisoes;

  const tituloEscopo =
    perfil === 'gestor' ? 'Minha Divisão' : perfil === 'diretor' ? 'Minha Diretoria' : 'Empresa';

  return (
    <>
      <Cartao>
        <div className="linha">
          <div className="campo">
            <label>Diretoria</label>
            <select value={diretoriaId} onChange={(e) => { setDiretoriaId(e.target.value); setDivisaoId(''); }}>
              <option value="">Todas</option>
              {contexto.todas_diretorias.map((diretoria) => (
                <option key={diretoria.id} value={diretoria.id}>{diretoria.nome}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label>Divisão</label>
            <select value={divisaoId} onChange={(e) => setDivisaoId(e.target.value)}>
              <option value="">Todas</option>
              {divisoesFiltro.map((divisao) => (
                <option key={divisao.id} value={divisao.id}>{divisao.nome}</option>
              ))}
            </select>
          </div>
          <span className="espaco" />
          <button className="btn" type="button" onClick={() => {
            const parametros = new URLSearchParams();
            if (diretoriaId) parametros.set('diretoria_id', diretoriaId);
            if (divisaoId) parametros.set('divisao_id', divisaoId);
            void exportarPlanilha(String(parametros)).catch((erro) => avisar((erro as Error).message, 'erro'));
          }}>Exportar Excel</button>
        </div>
      </Cartao>

      <div className="kpis">
        <Kpi rotulo={`Colaboradores — ${tituloEscopo}`} valor={numeroBR(totais.total)}
             nota={`Posição de ${dataBR(dados.processo.data_base)}`} />
        <Kpi rotulo="Avaliados" valor={`${totais.percentual}%`}
             nota={`${numeroBR(totais.avaliados)} de ${numeroBR(totais.total)}`} progresso={totais.percentual} />
        <Kpi rotulo="Pendentes" valor={numeroBR(totais.pendentes)} nota="Sem ação indicada"
             destaque={totais.pendentes > 0} />
        <Kpi rotulo="Homologadas" valor={numeroBR(totais.homologadas)} nota="Confirmadas pela Diretoria" />
        <Kpi rotulo="Desligados na posição-base" valor={numeroBR(totais.desligados_base)} nota="Identificados na carga" />
        {dados.campo_soma && (
          <Kpi
            rotulo="Redução anual estimada"
            valor={moedaBR(totais.custo_reducao)}
            nota={`De ${moedaBR(totais.custo_total)} em ${dados.campo_soma.rotulo.toLowerCase()}`}
          />
        )}
        {dias !== null && (
          <Kpi rotulo="Prazo de devolução" valor={dataBR(dados.processo.prazo)}
               nota={dias >= 0 ? `${dias} dia(s) restante(s)` : `vencido há ${Math.abs(dias)} dia(s)`}
               destaque={dias !== null && dias < 7} />
        )}
      </div>

      <Cartao titulo="Distribuição por ação indicada">
        <Barras itens={dados.acoes.map((acao) => ({
          rotulo: acao.valor,
          valor: acao.total,
          cor: acao.cor,
          percentual: totais.total ? Math.round((acao.total / totais.total) * 100) : 0,
        }))} />
      </Cartao>

      {perfil !== 'gestor' && (
        <Cartao titulo="Andamento por Diretoria">
          <Tabela
            cabecalhos={['Diretoria', 'Total', 'Avaliados', 'Pendentes', 'Desligamentos', 'Transferências', '% concluído']}
            numericas={[1, 2, 3, 4, 5, 6]}
            linhas={dados.por_diretoria.map((linha) => [
              linha.nome, numeroBR(linha.total), numeroBR(linha.avaliados), numeroBR(linha.pendentes),
              numeroBR(linha.desligamentos), numeroBR(linha.transferencias),
              `${Number(linha.total) ? Math.round((Number(linha.avaliados) / Number(linha.total)) * 100) : 0}%`,
            ])}
          />
        </Cartao>
      )}

      <Cartao titulo="Andamento por Divisão">
        <Tabela
          cabecalhos={['Divisão', 'Diretoria', 'Total', 'Avaliados', 'Pendentes', 'Desligamentos', 'Transferências', '% concluído']}
          numericas={[2, 3, 4, 5, 6, 7]}
          linhas={dados.por_divisao.map((linha) => [
            linha.nome, linha.diretoria, numeroBR(linha.total), numeroBR(linha.avaliados), numeroBR(linha.pendentes),
            numeroBR(linha.desligamentos), numeroBR(linha.transferencias),
            `${Number(linha.total) ? Math.round((Number(linha.avaliados) / Number(linha.total)) * 100) : 0}%`,
          ])}
        />
      </Cartao>

      {dados.por_gestor.length > 0 && (
        <Cartao titulo="Pendências por gestor" dica="quem ainda precisa concluir as avaliações">
          <Tabela
            cabecalhos={['Gestor', 'Colaboradores', 'Avaliados', 'Pendentes']}
            numericas={[1, 2, 3]}
            linhas={dados.por_gestor.map((linha) => [
              linha.nome, numeroBR(linha.total), numeroBR(linha.avaliados),
              <strong style={{ color: Number(linha.pendentes) > 0 ? 'var(--atencao)' : 'inherit' }}>
                {numeroBR(linha.pendentes)}
              </strong>,
            ])}
          />
        </Cartao>
      )}

      {dados.quebras
        .filter((quebra) => !['diretoria', 'divisao'].includes(quebra.chave) && quebra.linhas.length > 1)
        .map((quebra) => (
        <Cartao key={quebra.chave} titulo={`Distribuição por ${quebra.rotulo}`}>
          <Tabela
            cabecalhos={[quebra.rotulo, 'Total', 'Pendentes', 'Desligamentos']}
            numericas={[1, 2, 3]}
            linhas={quebra.linhas.map((linha) => [
              linha.valor, numeroBR(linha.total), numeroBR(linha.pendentes), numeroBR(linha.desligamentos),
            ])}
          />
        </Cartao>
      ))}
    </>
  );
}
