export interface Chunk {
  index: number;
  content: string;
}

const MAX_CHARS = 1200; // ~300 tokens: pedaco grande o bastante pra ter contexto
const OVERLAP_CHARS = 180; // sobreposicao evita cortar uma ideia no meio

/**
 * Quebra um texto longo em pedacos com sobreposicao.
 *
 * A estrategia e hierarquica: tenta separar por paragrafo; se um paragrafo
 * ainda for grande demais, separa por frase; e so entao corta na marra.
 */
export function chunkText(input: string): Chunk[] {
  const text = input.replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const pieces = splitRecursive(text, MAX_CHARS);

  // Junta pedacos pequenos ate encostar no limite, para nao gerar chunks minusculos.
  const merged: string[] = [];
  let buffer = "";
  for (const piece of pieces) {
    if (!buffer) {
      buffer = piece;
    } else if (buffer.length + piece.length + 2 <= MAX_CHARS) {
      buffer = `${buffer}\n\n${piece}`;
    } else {
      merged.push(buffer);
      buffer = piece;
    }
  }
  if (buffer) merged.push(buffer);

  // Aplica a sobreposicao: cada chunk carrega o final do anterior.
  return merged.map((content, index) => {
    if (index === 0) return { index, content };
    const previous = merged[index - 1] ?? "";
    const tail = previous.slice(-OVERLAP_CHARS);
    return { index, content: `${tail}\n\n${content}`.trim() };
  });
}

function splitRecursive(text: string, limit: number): string[] {
  if (text.length <= limit) return [text];

  for (const separator of ["\n\n", "\n", ". ", " "]) {
    const parts = text.split(separator);
    if (parts.length === 1) continue;

    const out: string[] = [];
    for (const part of parts) {
      const piece = separator === ". " ? `${part}.` : part;
      if (piece.trim().length === 0) continue;
      out.push(...splitRecursive(piece.trim(), limit));
    }
    if (out.length > 0) return out;
  }

  // Ultimo recurso: corte duro.
  const out: string[] = [];
  for (let i = 0; i < text.length; i += limit) {
    out.push(text.slice(i, i + limit));
  }
  return out;
}
