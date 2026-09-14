/** Acumula parâmetros posicionais ($1, $2, ...) ao montar consultas dinâmicas. */
export class Construtor {
  readonly params: unknown[] = [];

  p(valor: unknown): string {
    this.params.push(valor);
    return `$${this.params.length}`;
  }
}
