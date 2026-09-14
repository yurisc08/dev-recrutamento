import type { ReactNode } from 'react';
import { corDaAcao } from '../formato';

export function Cartao({ titulo, dica, acoes, children }: {
  titulo?: string; dica?: string; acoes?: ReactNode; children: ReactNode;
}) {
  return (
    <section className="cartao">
      {(titulo || acoes) && (
        <div className="linha" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          {titulo && <h2>{titulo} {dica && <span className="dica">— {dica}</span>}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, nota, destaque, progresso }: {
  rotulo: string; valor: string; nota?: string; destaque?: boolean; progresso?: number;
}) {
  return (
    <div className={`kpi${destaque ? ' destaque' : ''}`}>
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {nota && <div className="nota">{nota}</div>}
      {progresso !== undefined && (
        <div className="progresso"><div style={{ width: `${Math.min(progresso, 100)}%` }} /></div>
      )}
    </div>
  );
}

/**
 * Barras horizontais com rótulo e valor sempre visíveis:
 * a identidade de cada série nunca depende só da cor.
 */
export function Barras({ itens }: { itens: Array<{ rotulo: string; valor: number; cor?: string; percentual?: number }> }) {
  const maximo = Math.max(...itens.map((item) => item.valor), 1);
  return (
    <div className="barras">
      {itens.map((item) => (
        <div className="barra-linha" key={item.rotulo}>
          <div className="barra-rotulo">
            <span className="barra-chip" style={{ background: corDaAcao(item.cor) }} />
            <span>{item.rotulo}</span>
          </div>
          <div className="barra-trilho">
            <div className="barra-fill" style={{ width: `${(item.valor / maximo) * 100}%`, background: corDaAcao(item.cor) }} />
          </div>
          <div className="barra-numero">
            {item.valor.toLocaleString('pt-BR')}{' '}
            {item.percentual !== undefined && <span>({item.percentual}%)</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Tabela({ cabecalhos, numericas = [], linhas, vazio = 'Nada a exibir.' }: {
  cabecalhos: string[];
  numericas?: number[];
  linhas: ReactNode[][];
  vazio?: string;
}) {
  return (
    <div className="tabela-caixa">
      <table>
        <thead>
          <tr>{cabecalhos.map((titulo, indice) => (
            <th key={titulo + indice} className={numericas.includes(indice) ? 'num' : ''}>{titulo}</th>
          ))}</tr>
        </thead>
        <tbody>
          {linhas.length === 0 && (
            <tr><td className="vazio" colSpan={cabecalhos.length}>{vazio}</td></tr>
          )}
          {linhas.map((linha, indice) => (
            <tr key={indice}>
              {linha.map((celula, coluna) => (
                <td key={coluna} className={numericas.includes(coluna) ? 'num' : ''}>{celula}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Modal({ titulo, children, rodape, aoFechar, largura }: {
  titulo: string; children: ReactNode; rodape?: ReactNode; aoFechar: () => void; largura?: number;
}) {
  return (
    <div className="modal-fundo" onClick={(evento) => { if (evento.target === evento.currentTarget) aoFechar(); }}>
      <div className="modal" style={largura ? { width: `min(${largura}px, 100%)` } : undefined} role="dialog" aria-modal="true">
        <div className="modal-topo">
          <h3>{titulo}</h3>
          <button className="btn btn-pequeno" onClick={aoFechar} type="button">Fechar</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

export function Alertas({ alertas }: { alertas: Array<{ severidade: string; mensagem: string }> }) {
  if (alertas.length === 0) return null;
  return (
    <>
      {alertas.map((alerta, indice) => (
        <div
          key={indice}
          className={`msg ${alerta.severidade === 'critico' ? 'msg-erro' : alerta.severidade === 'atencao' ? 'msg-atencao' : 'msg-info'}`}
        >
          {alerta.mensagem}
        </div>
      ))}
    </>
  );
}
