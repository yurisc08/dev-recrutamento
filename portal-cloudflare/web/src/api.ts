export class ErroApi extends Error {
  constructor(public status: number, mensagem: string, public detalhes?: any) {
    super(mensagem);
  }
}

async function requisitar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const cabecalhos: Record<string, string> = { 'x-portal': '1' };
  let body: BodyInit | undefined;
  if (corpo instanceof FormData) body = corpo;
  else if (corpo !== undefined) {
    cabecalhos['content-type'] = 'application/json';
    body = JSON.stringify(corpo);
  }
  const resposta = await fetch(caminho, { method: metodo, headers: cabecalhos, body, credentials: 'same-origin' });
  const texto = await resposta.text();
  const dados = texto ? JSON.parse(texto) : {};
  if (!resposta.ok) throw new ErroApi(resposta.status, dados.erro ?? 'Falha na operação.', dados.detalhes);
  return dados as T;
}

export const api = {
  get: <T>(caminho: string) => requisitar<T>('GET', caminho),
  post: <T>(caminho: string, corpo?: unknown) => requisitar<T>('POST', caminho, corpo),
  patch: <T>(caminho: string, corpo?: unknown) => requisitar<T>('PATCH', caminho, corpo),
  remover: <T>(caminho: string) => requisitar<T>('DELETE', caminho),
};
