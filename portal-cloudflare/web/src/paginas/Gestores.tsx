import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSessao } from '../sessao';
import { Cartao, Modal } from '../componentes/Comuns';
import { dataHoraBR, numeroBR } from '../formato';

/**
 * Gestores imediatos.
 *
 * O diretor vê a lista inteira agrupada pela coluna GESTOR IMEDIATO da planilha,
 * dá acesso a cada gerente e acompanha o andamento — sem recortar arquivo nem
 * mandar nada por e-mail. Quem não tem acesso ainda aparece com o botão de criar.
 */
interface GestorLinha {
  gestor_nome: string;
  usuario_id: number | null;
  usuario: string | null;
  usuario_nome: string | null;
  email: string | null;
  acesso: 'sem_acesso' | 'convite_pendente' | 'convite_expirado' | 'ativo' | 'desativado';
  convite_expira_em: string | null;
  ultimo_acesso: string | null;
  total: number;
  avaliados: number;
  pendentes: number;
  homologadas: number;
}

interface AcessoGestor { id: number; usuario: string; nome: string; ativo: boolean; senha_definida: boolean }

const ROTULO_ACESSO: Record<GestorLinha['acesso'], string> = {
  sem_acesso: 'Sem acesso',
  convite_pendente: 'Convite enviado',
  convite_expirado: 'Convite vencido',
  ativo: 'Acesso ativo',
  desativado: 'Acesso desativado',
};

const CLASSE_ACESSO: Record<GestorLinha['acesso'], string> = {
  sem_acesso: 'selo-pendente',
  convite_pendente: 'selo-atencao',
  convite_expirado: 'selo-desligamento',
  ativo: 'selo-manter',
  desativado: 'selo-neutra',
};

const SEM_GESTOR = '(sem gestor informado)';

const semAcento = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function sugerirLogin(nome: string) {
  const partes = semAcento(nome).toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
  return (partes.length > 1 ? `${partes[0]}.${partes[partes.length - 1]}` : partes[0] ?? '').slice(0, 40);
}

export function Gestores() {
  const { avisar } = useSessao();
  const [itens, setItens] = useState<GestorLinha[]>([]);
  const [acessos, setAcessos] = useState<AcessoGestor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [criando, setCriando] = useState<GestorLinha | null>(null);
  const [vinculando, setVinculando] = useState<GestorLinha | null>(null);
  const [link, setLink] = useState<{ nome: string; usuario: string; url: string; expira_em: string } | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    Promise.all([
      api.get<{ itens: GestorLinha[] }>('/api/equipe/gestores'),
      api.get<{ itens: AcessoGestor[] }>('/api/equipe/usuarios'),
    ])
      .then(([lista, usuarios]) => { setItens(lista.itens); setAcessos(usuarios.itens); })
      .catch((erro) => avisar((erro as Error).message, 'erro'))
      .finally(() => setCarregando(false));
  }, [avisar]);

  useEffect(carregar, [carregar]);

  const montarLink = (convite: string) => `${window.location.origin}/ativar?t=${convite}`;

  async function criarAcesso(dados: { gestor_nome: string; nome: string; usuario: string; email: string }) {
    try {
      const resposta = await api.post<any>('/api/equipe/gestores/acesso', dados);
      setCriando(null);
      setLink({ nome: resposta.nome, usuario: resposta.usuario, url: montarLink(resposta.convite), expira_em: resposta.expira_em });
      avisar(`Acesso criado e ${numeroBR(resposta.colaboradores)} colaborador(es) atribuído(s).`);
      carregar();
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  async function vincular(gestor: GestorLinha, usuarioId: number | null) {
    try {
      const resposta = await api.post<any>('/api/equipe/gestores/vincular', {
        gestor_nome: gestor.gestor_nome, usuario_id: usuarioId,
      });
      setVinculando(null);
      avisar(usuarioId
        ? `${numeroBR(resposta.colaboradores)} colaborador(es) agora aparecem para esse gestor.`
        : 'Vínculo removido.');
      carregar();
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  async function novoConvite(gestor: GestorLinha) {
    if (!gestor.usuario_id) return;
    if (!window.confirm(`Gerar um novo link para ${gestor.usuario_nome}? A senha atual dele(a) deixa de valer.`)) return;
    try {
      const resposta = await api.post<any>(`/api/equipe/usuarios/${gestor.usuario_id}/convite`);
      setLink({ nome: resposta.nome, usuario: resposta.usuario, url: montarLink(resposta.convite), expira_em: resposta.expira_em });
      carregar();
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  const semAcesso = itens.filter((item) => item.acesso === 'sem_acesso' && item.gestor_nome !== SEM_GESTOR).length;
  const totalPendentes = itens.reduce((soma, item) => soma + item.pendentes, 0);

  return (
    <>
      <Cartao titulo="Gestores imediatos" dica="a lista é uma só; cada gestor enxerga apenas a equipe dele">
        <p className="texto-2 pequeno">
          O agrupamento vem da coluna <strong>GESTOR IMEDIATO</strong> da planilha. Dê acesso ao gestor e mande o
          link de primeiro acesso — ele define a própria senha e marca as decisões da equipe dele aqui mesmo,
          na mesma base. Nada de recortar arquivo por e-mail.
        </p>
        <div className="kpis" style={{ marginTop: 12 }}>
          <div className="kpi"><div className="rotulo">Gestores na base</div><div className="valor">{numeroBR(itens.length)}</div></div>
          <div className={`kpi${semAcesso ? ' destaque' : ''}`}>
            <div className="rotulo">Ainda sem acesso</div><div className="valor">{numeroBR(semAcesso)}</div>
            <div className="nota">precisam receber o link</div>
          </div>
          <div className="kpi"><div className="rotulo">Decisões pendentes</div><div className="valor">{numeroBR(totalPendentes)}</div></div>
        </div>
      </Cartao>

      <Cartao titulo="Quem responde por quem">
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr>
                <th>Gestor imediato</th><th>Acesso ao portal</th><th className="num">Equipe</th>
                <th className="num">Avaliados</th><th className="num">Pendentes</th><th>Situação</th><th />
              </tr>
            </thead>
            <tbody>
              {carregando && <tr><td className="vazio" colSpan={7}>Carregando...</td></tr>}
              {!carregando && itens.length === 0 && (
                <tr><td className="vazio" colSpan={7}>Nenhum colaborador na sua área ainda. Importe a planilha primeiro.</td></tr>
              )}
              {!carregando && itens.map((item) => (
                <tr key={item.gestor_nome}>
                  <td>
                    <strong>{item.gestor_nome}</strong>
                    {item.usuario && <div className="pequeno texto-3">usuário: {item.usuario}</div>}
                  </td>
                  <td>
                    {item.gestor_nome === SEM_GESTOR ? (
                      <span className="pequeno texto-3">Linhas sem a coluna preenchida — ficam com o RH/Diretoria</span>
                    ) : (
                      <span className={`selo ${CLASSE_ACESSO[item.acesso]}`}>{ROTULO_ACESSO[item.acesso]}</span>
                    )}
                    {item.acesso === 'convite_pendente' && item.convite_expira_em && (
                      <div className="pequeno texto-3">vence em {dataHoraBR(item.convite_expira_em)}</div>
                    )}
                    {item.acesso === 'ativo' && item.ultimo_acesso && (
                      <div className="pequeno texto-3">último acesso {dataHoraBR(item.ultimo_acesso)}</div>
                    )}
                  </td>
                  <td className="num">{numeroBR(item.total)}</td>
                  <td className="num">{numeroBR(item.avaliados)}</td>
                  <td className="num">{item.pendentes > 0 ? <strong>{numeroBR(item.pendentes)}</strong> : '0'}</td>
                  <td style={{ minWidth: 120 }}>
                    <div className="barra-mini" title={`${item.avaliados} de ${item.total}`}>
                      <span style={{ width: `${item.total ? Math.round((item.avaliados / item.total) * 100) : 0}%` }} />
                    </div>
                  </td>
                  <td className="linha" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    {item.gestor_nome !== SEM_GESTOR && item.acesso === 'sem_acesso' && (
                      <button className="btn btn-pequeno btn-primario" type="button" onClick={() => setCriando(item)}>
                        Criar acesso
                      </button>
                    )}
                    {(item.acesso === 'convite_pendente' || item.acesso === 'convite_expirado' || item.acesso === 'ativo') && (
                      <button className="btn btn-pequeno" type="button" onClick={() => void novoConvite(item)}>
                        Novo link
                      </button>
                    )}
                    {item.gestor_nome !== SEM_GESTOR && (
                      <button className="btn btn-pequeno" type="button" onClick={() => setVinculando(item)}>
                        Vincular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {criando && (
        <Modal titulo={`Criar acesso — ${criando.gestor_nome}`} aoFechar={() => setCriando(null)}>
          <FormularioAcesso gestor={criando} aoEnviar={criarAcesso} aoCancelar={() => setCriando(null)} />
        </Modal>
      )}

      {vinculando && (
        <Modal titulo={`Vincular equipe — ${vinculando.gestor_nome}`} aoFechar={() => setVinculando(null)}>
          <p className="texto-2 pequeno">
            Use quando o gestor já tem acesso com outro nome, ou para tirar o vínculo e devolver a equipe ao RH.
            São {numeroBR(vinculando.total)} colaborador(es).
          </p>
          <div className="campo" style={{ marginTop: 10 }}>
            <label htmlFor="acesso-existente">Acesso de gestor</label>
            <select id="acesso-existente" defaultValue={String(vinculando.usuario_id ?? '')}
                    onChange={(evento) => {
                      const valor = evento.target.value;
                      void vincular(vinculando, valor ? Number(valor) : null);
                    }}>
              <option value="">— sem gestor (fica só com RH/Diretoria) —</option>
              {acessos.map((acesso) => (
                <option key={acesso.id} value={acesso.id}>
                  {acesso.nome} ({acesso.usuario}){acesso.senha_definida ? '' : ' — aguardando primeiro acesso'}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}

      {link && (
        <Modal titulo="Link de primeiro acesso" aoFechar={() => setLink(null)}>
          <p className="texto-2 pequeno">
            Envie este link para <strong>{link.nome}</strong> (usuário <strong>{link.usuario}</strong>) pelo canal
            interno da empresa. Ele define a própria senha ao abrir — nem você nem o RH ficam sabendo qual é.
            O link é de uso único e vale até {dataHoraBR(link.expira_em)}.
          </p>
          <div className="campo" style={{ marginTop: 10 }}>
            <label htmlFor="link-convite">Link</label>
            <input id="link-convite" readOnly value={link.url} onFocus={(evento) => evento.target.select()} />
          </div>
          <div className="linha" style={{ marginTop: 12 }}>
            <span className="espaco" />
            <button className="btn" type="button" onClick={() => setLink(null)}>Fechar</button>
            <button className="btn btn-primario" type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(link.url)
                        .then(() => avisar('Link copiado.'))
                        .catch(() => avisar('Copie o link do campo acima.', 'erro'));
                    }}>
              Copiar link
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function FormularioAcesso({ gestor, aoEnviar, aoCancelar }: {
  gestor: GestorLinha;
  aoEnviar: (dados: { gestor_nome: string; nome: string; usuario: string; email: string }) => void;
  aoCancelar: () => void;
}) {
  const [nome, setNome] = useState(gestor.gestor_nome);
  const [usuario, setUsuario] = useState(sugerirLogin(gestor.gestor_nome));
  const [email, setEmail] = useState('');

  return (
    <form onSubmit={(evento) => { evento.preventDefault(); aoEnviar({ gestor_nome: gestor.gestor_nome, nome, usuario, email }); }}>
      <p className="texto-2 pequeno">
        O acesso é criado <strong>sem senha</strong>: sai um link para o gestor definir a dele.
        Os {numeroBR(gestor.total)} colaborador(es) deste gestor passam a aparecer para ele.
      </p>
      <div className="campo" style={{ marginTop: 10 }}>
        <label htmlFor="gestor-nome">Nome do gestor</label>
        <input id="gestor-nome" value={nome} onChange={(evento) => setNome(evento.target.value)} required />
      </div>
      <div className="campo" style={{ marginTop: 10 }}>
        <label htmlFor="gestor-usuario">Usuário para entrar no portal</label>
        <input id="gestor-usuario" value={usuario} required
               onChange={(evento) => setUsuario(evento.target.value.toLowerCase())} />
      </div>
      <div className="campo" style={{ marginTop: 10 }}>
        <label htmlFor="gestor-email">E-mail corporativo (opcional)</label>
        <input id="gestor-email" type="email" value={email} onChange={(evento) => setEmail(evento.target.value)} />
      </div>
      <div className="linha" style={{ marginTop: 14 }}>
        <span className="espaco" />
        <button className="btn" type="button" onClick={aoCancelar}>Cancelar</button>
        <button className="btn btn-primario" type="submit">Criar acesso e gerar link</button>
      </div>
    </form>
  );
}
