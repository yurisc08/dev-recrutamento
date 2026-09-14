import { useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { useContextoApp, useSessao } from '../sessao';
import { Cartao, Modal, Tabela } from '../componentes/Comuns';
import { dataHoraBR } from '../formato';
import type { Acao, Campo, Regra } from '../tipos';

const ABAS = ['Processo', 'Campos', 'Ações', 'Regras e alertas', 'Estrutura', 'Usuários'] as const;
type Aba = typeof ABAS[number];

export function Configuracoes() {
  const [aba, setAba] = useState<Aba>('Processo');
  return (
    <>
      <div className="abas-internas">
        {ABAS.map((nome) => (
          <button key={nome} type="button" className={`aba-interna${aba === nome ? ' ativa' : ''}`} onClick={() => setAba(nome)}>
            {nome}
          </button>
        ))}
      </div>
      {aba === 'Processo' && <AbaProcesso />}
      {aba === 'Campos' && <AbaCampos />}
      {aba === 'Ações' && <AbaAcoes />}
      {aba === 'Regras e alertas' && <AbaRegras />}
      {aba === 'Estrutura' && <AbaEstrutura />}
      {aba === 'Usuários' && <AbaUsuarios />}
    </>
  );
}

function AbaProcesso() {
  const contexto = useContextoApp();
  const { recarregar, avisar } = useSessao();
  const [nome, setNome] = useState(contexto.processo.nome);
  const [dataBase, setDataBase] = useState(contexto.processo.data_base);
  const [prazo, setPrazo] = useState(contexto.processo.prazo ?? '');
  const [aviso, setAviso] = useState(contexto.processo.aviso_confidencialidade ?? '');

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    try {
      await api.patch('/api/config/processo', { nome, data_base: dataBase, prazo, aviso_confidencialidade: aviso });
      await recarregar();
      avisar('Parâmetros do processo atualizados.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  return (
    <Cartao titulo="Parâmetros do processo" dica="nada fica fixo no código; tudo vive no banco">
      <form className="linha" onSubmit={salvar}>
        <div className="campo" style={{ flex: 2 }}>
          <label>Nome do processo</label>
          <input value={nome} onChange={(evento) => setNome(evento.target.value)} required />
        </div>
        <div className="campo">
          <label>Data-base</label>
          <input type="date" value={dataBase} onChange={(evento) => setDataBase(evento.target.value)} required />
        </div>
        <div className="campo">
          <label>Prazo final</label>
          <input type="date" value={prazo} onChange={(evento) => setPrazo(evento.target.value)} />
        </div>
        <div className="campo" style={{ flex: 3 }}>
          <label>Aviso de confidencialidade</label>
          <input value={aviso} onChange={(evento) => setAviso(evento.target.value)} />
        </div>
        <button className="btn btn-primario" type="submit">Salvar</button>
      </form>
    </Cartao>
  );
}

function AbaCampos() {
  const { recarregar, avisar } = useSessao();
  const [campos, setCampos] = useState<Campo[]>([]);
  const [rotulo, setRotulo] = useState('');
  const [tipo, setTipo] = useState('texto');
  const [editavel, setEditavel] = useState('ninguem');
  const [opcoes, setOpcoes] = useState('');

  const carregar = () => {
    api.get<{ itens: Campo[] }>('/api/config/campos').then((dados) => setCampos(dados.itens));
  };
  useEffect(carregar, []);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    try {
      await api.post('/api/config/campos', { rotulo, tipo, editavel_por: editavel, opcoes, visivel_lista: true });
      setRotulo(''); setOpcoes(''); setTipo('texto'); setEditavel('ninguem');
      carregar();
      await recarregar();
      avisar('Campo criado.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  async function atualizar(campo: Campo, mudancas: Partial<Campo>) {
    try {
      await api.patch(`/api/config/campos/${campo.id}`, mudancas);
      carregar();
      await recarregar();
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
      carregar();
    }
  }

  return (
    <>
      <Cartao titulo="Novo campo" dica="passa a valer na base, na avaliação, na importação e na exportação">
        <form className="linha" onSubmit={criar}>
          <div className="campo" style={{ flex: 2 }}>
            <label>Nome do campo</label>
            <input value={rotulo} onChange={(evento) => setRotulo(evento.target.value)} required placeholder="Ex.: Avaliação de potencial" />
          </div>
          <div className="campo">
            <label>Tipo</label>
            <select value={tipo} onChange={(evento) => setTipo(evento.target.value)}>
              <option value="texto">Texto</option>
              <option value="lista">Lista suspensa</option>
              <option value="numero">Número</option>
              <option value="moeda">Moeda</option>
              <option value="data">Data</option>
              <option value="booleano">Sim / Não</option>
            </select>
          </div>
          <div className="campo">
            <label>Quem preenche</label>
            <select value={editavel} onChange={(evento) => setEditavel(evento.target.value)}>
              <option value="ninguem">Ninguém (só importação)</option>
              <option value="gestor">Gestor, Diretor e RH</option>
              <option value="diretor">Diretor e RH</option>
              <option value="admin">Somente RH</option>
            </select>
          </div>
          {tipo === 'lista' && (
            <div className="campo" style={{ flex: 2 }}>
              <label>Opções (uma por linha)</label>
              <textarea value={opcoes} onChange={(evento) => setOpcoes(evento.target.value)} rows={3} />
            </div>
          )}
          <button className="btn btn-primario" type="submit">Adicionar campo</button>
        </form>
      </Cartao>

      <Cartao titulo="Campos do processo" dica="renomeie, desative, defina obrigatoriedade e quem pode preencher">
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr>
                <th>Campo</th><th>Grupo</th><th>Tipo</th><th>Origem</th><th>Quem preenche</th>
                <th>Obrigatório</th><th>Na lista</th><th>Somar</th><th>Agrupar</th><th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {campos.map((campo) => (
                <tr key={campo.id}>
                  <td>
                    <input defaultValue={campo.rotulo} style={{ minWidth: 220 }}
                           onBlur={(evento) => { if (evento.target.value !== campo.rotulo) void atualizar(campo, { rotulo: evento.target.value }); }} />
                    <div className="pequeno mono texto-3">{campo.chave}</div>
                  </td>
                  <td className="texto-2">{campo.grupo}</td>
                  <td className="texto-2">{campo.tipo}</td>
                  <td className="texto-2">{campo.origem === 'avaliacao' ? 'Portal' : 'Excel'}</td>
                  <td>
                    <select value={campo.editavel_por} onChange={(evento) => atualizar(campo, { editavel_por: evento.target.value as Campo['editavel_por'] })}>
                      <option value="ninguem">Ninguém</option>
                      <option value="gestor">Gestor+</option>
                      <option value="diretor">Diretor+</option>
                      <option value="admin">Só RH</option>
                    </select>
                  </td>
                  <td><input type="checkbox" checked={campo.obrigatorio} onChange={(evento) => atualizar(campo, { obrigatorio: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={campo.visivel_lista} onChange={(evento) => atualizar(campo, { visivel_lista: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={campo.somar} onChange={(evento) => atualizar(campo, { somar: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={campo.agrupar} onChange={(evento) => atualizar(campo, { agrupar: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={campo.ativo} onChange={(evento) => atualizar(campo, { ativo: evento.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  );
}

function AbaAcoes() {
  const { recarregar, avisar } = useSessao();
  const [acoes, setAcoes] = useState<Acao[]>([]);
  const [valor, setValor] = useState('');
  const [exigeJustificativa, setExigeJustificativa] = useState(true);
  const [exigeDestino, setExigeDestino] = useState(false);
  const [consideraDesligamento, setConsideraDesligamento] = useState(false);

  const carregar = () => api.get<{ itens: Acao[] }>('/api/config/acoes').then((dados) => setAcoes(dados.itens));
  useEffect(() => { void carregar(); }, []);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    try {
      await api.post('/api/config/acoes', {
        valor, exige_justificativa: exigeJustificativa, exige_destino: exigeDestino,
        considera_desligamento: consideraDesligamento,
      });
      setValor('');
      await carregar();
      await recarregar();
      avisar('Ação criada.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  async function atualizar(acao: Acao, mudancas: Partial<Acao>) {
    try {
      await api.patch(`/api/config/acoes/${acao.id}`, mudancas);
      await carregar();
      await recarregar();
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
      await carregar();
    }
  }

  return (
    <>
      <Cartao titulo="Nova ação">
        <form className="linha" onSubmit={criar}>
          <div className="campo" style={{ flex: 2 }}>
            <label>Nome da ação</label>
            <input value={valor} onChange={(evento) => setValor(evento.target.value)} required placeholder="Ex.: APOSENTADORIA" />
          </div>
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={exigeJustificativa} onChange={(evento) => setExigeJustificativa(evento.target.checked)} />
            Exige justificativa
          </label>
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={exigeDestino} onChange={(evento) => setExigeDestino(evento.target.checked)} />
            Exige destino
          </label>
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={consideraDesligamento} onChange={(evento) => setConsideraDesligamento(evento.target.checked)} />
            Conta como redução de custo
          </label>
          <button className="btn btn-primario" type="submit">Adicionar</button>
        </form>
      </Cartao>

      <Cartao titulo="Ações disponíveis na avaliação">
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr><th>Ação</th><th>Exige justificativa</th><th>Exige destino</th><th>Redução de custo</th><th>Ativa</th></tr>
            </thead>
            <tbody>
              {acoes.map((acao) => (
                <tr key={acao.id}>
                  <td><strong>{acao.valor}</strong></td>
                  <td><input type="checkbox" checked={acao.exige_justificativa} onChange={(evento) => atualizar(acao, { exige_justificativa: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={acao.exige_destino} onChange={(evento) => atualizar(acao, { exige_destino: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={acao.considera_desligamento} onChange={(evento) => atualizar(acao, { considera_desligamento: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={acao.ativo} onChange={(evento) => atualizar(acao, { ativo: evento.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  );
}

function AbaRegras() {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [regras, setRegras] = useState<Regra[]>([]);
  const [nova, setNova] = useState({ nome: '', campo: '', operador: 'preenchido', valor: '', mensagem: '', severidade: 'atencao', aplica_acao: '', exige_justificativa: false });

  const carregar = () => api.get<{ itens: Regra[] }>('/api/config/regras').then((dados) => setRegras(dados.itens));
  useEffect(() => { void carregar(); }, []);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    try {
      await api.post('/api/config/regras', nova);
      setNova({ ...nova, nome: '', valor: '', mensagem: '' });
      await carregar();
      avisar('Regra criada.');
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  async function atualizar(regra: Regra, mudancas: Partial<Regra>) {
    try {
      await api.patch(`/api/config/regras/${regra.id}`, mudancas);
      await carregar();
    } catch (erro) {
      avisar((erro as Error).message, 'erro');
    }
  }

  return (
    <>
      <Cartao titulo="Nova regra de alerta" dica="o portal apenas sinaliza; nenhuma decisão trabalhista é automática">
        <form className="linha" onSubmit={criar}>
          <div className="campo"><label>Nome</label>
            <input value={nova.nome} onChange={(evento) => setNova({ ...nova, nome: evento.target.value })} required /></div>
          <div className="campo"><label>Campo observado</label>
            <select value={nova.campo} onChange={(evento) => setNova({ ...nova, campo: evento.target.value })} required>
              <option value="">Selecione</option>
              {contexto.campos.filter((campo) => campo.ativo && campo.origem === 'base')
                .map((campo) => <option key={campo.chave} value={campo.chave}>{campo.rotulo}</option>)}
            </select></div>
          <div className="campo"><label>Condição</label>
            <select value={nova.operador} onChange={(evento) => setNova({ ...nova, operador: evento.target.value })}>
              <option value="preenchido">Está preenchido</option>
              <option value="vazio">Está vazio</option>
              <option value="igual">É igual a</option>
              <option value="diferente">É diferente de</option>
              <option value="contem">Contém</option>
              <option value="data_futura">É data futura</option>
              <option value="data_passada">É data passada</option>
              <option value="maior_que">É maior que</option>
              <option value="menor_que">É menor que</option>
            </select></div>
          <div className="campo"><label>Valor (se aplicável)</label>
            <input value={nova.valor} onChange={(evento) => setNova({ ...nova, valor: evento.target.value })} /></div>
          <div className="campo" style={{ flex: 2 }}><label>Mensagem exibida</label>
            <input value={nova.mensagem} onChange={(evento) => setNova({ ...nova, mensagem: evento.target.value })} required /></div>
          <div className="campo"><label>Severidade</label>
            <select value={nova.severidade} onChange={(evento) => setNova({ ...nova, severidade: evento.target.value })}>
              <option value="info">Informativo</option>
              <option value="atencao">Atenção</option>
              <option value="critico">Crítico</option>
            </select></div>
          <div className="campo"><label>Aplica-se à ação</label>
            <select value={nova.aplica_acao} onChange={(evento) => setNova({ ...nova, aplica_acao: evento.target.value })}>
              <option value="">Qualquer</option>
              {contexto.acoes.map((acao) => <option key={acao.id} value={acao.valor}>{acao.valor}</option>)}
            </select></div>
          <label className="btn" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={nova.exige_justificativa}
                   onChange={(evento) => setNova({ ...nova, exige_justificativa: evento.target.checked })} />
            Exige justificativa
          </label>
          <button className="btn btn-primario" type="submit">Adicionar regra</button>
        </form>
      </Cartao>

      <Cartao titulo="Regras ativas">
        <div className="tabela-caixa">
          <table>
            <thead><tr><th>Regra</th><th>Condição</th><th>Mensagem</th><th>Severidade</th><th>Ação</th><th>Exige justificativa</th><th>Ativa</th></tr></thead>
            <tbody>
              {regras.map((regra) => (
                <tr key={regra.id}>
                  <td><strong>{regra.nome}</strong></td>
                  <td className="texto-2">{regra.campo} {regra.operador} {regra.valor ?? ''}</td>
                  <td className="limite" title={regra.mensagem}>{regra.mensagem}</td>
                  <td>
                    <span className={`selo ${regra.severidade === 'critico' ? 'selo-desligamento' : regra.severidade === 'atencao' ? 'selo-atencao' : 'selo-pendente'}`}>
                      {regra.severidade}
                    </span>
                  </td>
                  <td className="texto-2">{regra.aplica_acao ?? 'Qualquer'}</td>
                  <td><input type="checkbox" checked={regra.exige_justificativa} onChange={(evento) => atualizar(regra, { exige_justificativa: evento.target.checked })} /></td>
                  <td><input type="checkbox" checked={regra.ativo} onChange={(evento) => atualizar(regra, { ativo: evento.target.checked })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>
    </>
  );
}

function AbaEstrutura() {
  const { recarregar, avisar } = useSessao();
  const [estrutura, setEstrutura] = useState<{ diretorias: any[]; divisoes: any[] }>({ diretorias: [], divisoes: [] });
  const [novaDiretoria, setNovaDiretoria] = useState('');
  const [novaDivisao, setNovaDivisao] = useState('');
  const [diretoriaId, setDiretoriaId] = useState('');

  const carregar = () => api.get<any>('/api/config/estrutura').then(setEstrutura);
  useEffect(() => { void carregar(); }, []);

  async function criarDiretoria(evento: FormEvent) {
    evento.preventDefault();
    try {
      await api.post('/api/config/diretorias', { nome: novaDiretoria });
      setNovaDiretoria('');
      await carregar();
      await recarregar();
    } catch (erro) { avisar((erro as Error).message, 'erro'); }
  }

  async function criarDivisao(evento: FormEvent) {
    evento.preventDefault();
    try {
      await api.post('/api/config/divisoes', { nome: novaDivisao, diretoria_id: Number(diretoriaId) });
      setNovaDivisao('');
      await carregar();
      await recarregar();
    } catch (erro) { avisar((erro as Error).message, 'erro'); }
  }

  return (
    <>
      <Cartao titulo="Estrutura organizacional" dica="Diretoria → Divisão → Gestor → Colaboradores">
        <div className="grade-2">
          <form className="linha" onSubmit={criarDiretoria}>
            <div className="campo" style={{ flex: 2 }}>
              <label>Nova Diretoria</label>
              <input value={novaDiretoria} onChange={(evento) => setNovaDiretoria(evento.target.value)} required />
            </div>
            <button className="btn" type="submit">Adicionar</button>
          </form>
          <form className="linha" onSubmit={criarDivisao}>
            <div className="campo">
              <label>Diretoria</label>
              <select value={diretoriaId} onChange={(evento) => setDiretoriaId(evento.target.value)} required>
                <option value="">Selecione</option>
                {estrutura.diretorias.map((diretoria) => <option key={diretoria.id} value={diretoria.id}>{diretoria.nome}</option>)}
              </select>
            </div>
            <div className="campo">
              <label>Nova Divisão</label>
              <input value={novaDivisao} onChange={(evento) => setNovaDivisao(evento.target.value)} required />
            </div>
            <button className="btn" type="submit">Adicionar</button>
          </form>
        </div>
      </Cartao>

      <Cartao titulo="Divisões cadastradas">
        <Tabela
          cabecalhos={['Diretoria', 'Divisão', 'Situação']}
          linhas={estrutura.divisoes.map((divisao) => [
            divisao.diretoria_nome, divisao.nome,
            <span className={`selo ${divisao.ativo ? 'selo-manter' : 'selo-pendente'}`}>{divisao.ativo ? 'Ativa' : 'Inativa'}</span>,
          ])}
        />
      </Cartao>
    </>
  );
}

function AbaUsuarios() {
  const contexto = useContextoApp();
  const { avisar } = useSessao();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [novo, setNovo] = useState({ usuario: '', nome: '', email: '', perfil: 'gestor' });
  const [vinculos, setVinculos] = useState<any | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; senha: string } | null>(null);

  const carregar = () => api.get<{ itens: any[] }>('/api/usuarios').then((dados) => setUsuarios(dados.itens));
  useEffect(() => { void carregar(); }, []);

  async function criar(evento: FormEvent) {
    evento.preventDefault();
    try {
      const criado = await api.post<any>('/api/usuarios', novo);
      setNovo({ usuario: '', nome: '', email: '', perfil: 'gestor' });
      await carregar();
      setSenhaGerada({ nome: criado.nome, senha: criado.senha_provisoria });
    } catch (erro) { avisar((erro as Error).message, 'erro'); }
  }

  async function atualizar(id: number, mudancas: any) {
    try {
      await api.patch(`/api/usuarios/${id}`, mudancas);
      await carregar();
      avisar('Usuário atualizado.');
    } catch (erro) { avisar((erro as Error).message, 'erro'); await carregar(); }
  }

  async function redefinirSenha(usuario: any) {
    if (!window.confirm(`Gerar nova senha provisória para ${usuario.nome}? As sessões ativas serão encerradas.`)) return;
    try {
      const resposta = await api.post<any>(`/api/usuarios/${usuario.id}/senha`);
      setSenhaGerada({ nome: usuario.nome, senha: resposta.senha_provisoria });
    } catch (erro) { avisar((erro as Error).message, 'erro'); }
  }

  return (
    <>
      <Cartao titulo="Novo usuário" dica="o portal gera senha provisória, trocada no primeiro acesso">
        <form className="linha" onSubmit={criar}>
          <div className="campo"><label>Login</label>
            <input value={novo.usuario} onChange={(evento) => setNovo({ ...novo, usuario: evento.target.value })} required /></div>
          <div className="campo" style={{ flex: 2 }}><label>Nome completo</label>
            <input value={novo.nome} onChange={(evento) => setNovo({ ...novo, nome: evento.target.value })} required /></div>
          <div className="campo"><label>E-mail</label>
            <input type="email" value={novo.email} onChange={(evento) => setNovo({ ...novo, email: evento.target.value })} /></div>
          <div className="campo"><label>Perfil</label>
            <select value={novo.perfil} onChange={(evento) => setNovo({ ...novo, perfil: evento.target.value })}>
              <option value="gestor">Gestor (sua Divisão)</option>
              <option value="diretor">Diretor (sua Diretoria)</option>
              <option value="admin">RH / Administrador</option>
            </select></div>
          <button className="btn btn-primario" type="submit">Criar usuário</button>
        </form>
      </Cartao>

      <Cartao titulo="Usuários">
        <div className="tabela-caixa">
          <table>
            <thead>
              <tr><th>Login</th><th>Nome</th><th>Perfil</th><th>Abrangência</th><th>Último acesso</th><th>Situação</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {usuarios.map((usuario) => (
                <tr key={usuario.id}>
                  <td className="mono">{usuario.usuario}</td>
                  <td>{usuario.nome}</td>
                  <td>
                    <select value={usuario.perfil} onChange={(evento) => atualizar(usuario.id, { perfil: evento.target.value })}>
                      <option value="gestor">Gestor</option>
                      <option value="diretor">Diretor</option>
                      <option value="admin">RH / Admin</option>
                    </select>
                  </td>
                  <td>
                    <div className="chips">
                      {usuario.perfil === 'admin' && <span className="chip">Empresa toda</span>}
                      {usuario.perfil === 'diretor' && (usuario.diretorias ?? []).map((id: number) => (
                        <span className="chip" key={id}>{contexto.todas_diretorias.find((d) => d.id === id)?.nome ?? id}</span>
                      ))}
                      {usuario.perfil === 'gestor' && (usuario.divisoes ?? []).map((id: number) => (
                        <span className="chip" key={id}>{contexto.todas_divisoes.find((d) => d.id === id)?.nome ?? id}</span>
                      ))}
                      {usuario.perfil !== 'admin' && (
                        <button className="btn btn-pequeno" type="button" onClick={() => setVinculos(usuario)}>Definir</button>
                      )}
                    </div>
                  </td>
                  <td className="texto-2">{usuario.ultimo_acesso ? dataHoraBR(usuario.ultimo_acesso) : '—'}</td>
                  <td>
                    <span className={`selo ${usuario.ativo ? 'selo-manter' : 'selo-pendente'}`}>{usuario.ativo ? 'Ativo' : 'Inativo'}</span>
                    {usuario.trocar_senha && <span className="selo selo-atencao" style={{ marginLeft: 6 }}>Senha provisória</span>}
                  </td>
                  <td>
                    <div className="linha" style={{ gap: 4 }}>
                      <button className="btn btn-pequeno" type="button" onClick={() => atualizar(usuario.id, { ativo: !usuario.ativo })}>
                        {usuario.ativo ? 'Desativar' : 'Reativar'}
                      </button>
                      <button className="btn btn-pequeno" type="button" onClick={() => redefinirSenha(usuario)}>Nova senha</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      {vinculos && (
        <ModalVinculos
          usuario={vinculos}
          aoFechar={() => setVinculos(null)}
          aoSalvar={async (mudancas) => { await atualizar(vinculos.id, mudancas); setVinculos(null); }}
        />
      )}

      {senhaGerada && (
        <Modal titulo="Senha provisória" aoFechar={() => setSenhaGerada(null)} largura={520}>
          <p>Entregue esta senha a <strong>{senhaGerada.nome}</strong> por canal seguro. Ela será trocada no primeiro acesso.</p>
          <p className="mono" style={{ fontSize: 20, padding: 12, background: 'var(--superficie-2)', borderRadius: 8, textAlign: 'center' }}>
            {senhaGerada.senha}
          </p>
        </Modal>
      )}
    </>
  );
}

function ModalVinculos({ usuario, aoFechar, aoSalvar }: {
  usuario: any; aoFechar: () => void; aoSalvar: (mudancas: any) => Promise<void>;
}) {
  const contexto = useContextoApp();
  const ehGestor = usuario.perfil === 'gestor';
  const [selecionados, setSelecionados] = useState<number[]>(ehGestor ? (usuario.divisoes ?? []) : (usuario.diretorias ?? []));
  const lista = ehGestor ? contexto.todas_divisoes : contexto.todas_diretorias;

  return (
    <Modal
      titulo={`Abrangência de ${usuario.nome}`}
      aoFechar={aoFechar}
      largura={560}
      rodape={
        <>
          <button className="btn" type="button" onClick={aoFechar}>Cancelar</button>
          <button className="btn btn-primario" type="button"
                  onClick={() => aoSalvar(ehGestor ? { divisoes: selecionados } : { diretorias: selecionados })}>
            Salvar
          </button>
        </>
      }
    >
      <p className="texto-2 pequeno">
        {ehGestor
          ? 'O gestor só enxerga e avalia colaboradores das Divisões marcadas.'
          : 'O diretor enxerga todos os colaboradores das Diretorias marcadas.'}
      </p>
      {lista.map((item) => (
        <label key={item.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
          <input
            type="checkbox"
            style={{ width: 'auto' }}
            checked={selecionados.includes(item.id)}
            onChange={(evento) => setSelecionados(
              evento.target.checked ? [...selecionados, item.id] : selecionados.filter((id) => id !== item.id),
            )}
          />
          <span>{item.nome}</span>
        </label>
      ))}
    </Modal>
  );
}
