import { Fragment, useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'

/**
 * Renderizador leve de markdown (sem dependências e sem innerHTML).
 * Suporta blocos ```lang, `inline`, **negrito**, *itálico*, listas, citações e links.
 */

type Block =
  | { type: 'code'; lang: string; code: string }
  | { type: 'quote'; text: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'heading'; level: number; text: string }
  | { type: 'text'; text: string }

function parse(source: string): Block[] {
  const blocks: Block[] = []
  const lines = source.replace(/\r\n/g, '\n').split('\n')
  let buffer: string[] = []

  const flushText = () => {
    if (buffer.length) {
      const text = buffer.join('\n').trim()
      if (text) blocks.push({ type: 'text', text })
      buffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // bloco de código
    const fence = line.match(/^```(\w*)\s*$/)
    if (fence) {
      flushText()
      const lang = fence[1] || 'text'
      const code: string[] = []
      i++
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i])
        i++
      }
      blocks.push({ type: 'code', lang, code: code.join('\n') })
      continue
    }

    // título
    const heading = line.match(/^(#{1,3})\s+(.*)$/)
    if (heading) {
      flushText()
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] })
      continue
    }

    // citação
    if (/^>\s?/.test(line)) {
      flushText()
      const quote: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      i--
      blocks.push({ type: 'quote', text: quote.join('\n') })
      continue
    }

    // listas
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      flushText()
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*([-*]|\d+\.)\s+/, ''))
        i++
      }
      i--
      blocks.push({ type: 'list', items, ordered })
      continue
    }

    buffer.push(line)
  }

  flushText()
  return blocks
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|https?:\/\/[^\s<)]+)/g

function Inline({ text }: { text: string }) {
  const parts = text.split(INLINE).filter(Boolean)
  return (
    <>
      {parts.map((part, idx) => {
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={idx}
              className="rounded bg-brand-500/10 px-1.5 py-0.5 font-mono text-[0.85em] text-brand-500"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={idx} className="font-semibold text-strong">
              {part.slice(2, -2)}
            </strong>
          )
        }
        if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
          return <em key={idx}>{part.slice(1, -1)}</em>
        }
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={idx}
              href={part}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="font-medium text-brand-500 underline underline-offset-2 hover:text-brand-400 break-all"
            >
              {part}
            </a>
          )
        }
        return <Fragment key={idx}>{part}</Fragment>
      })}
    </>
  )
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border bg-ink-950/95 dark:bg-black/40">
      <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wider text-ink-400">{lang}</span>
        <button
          onClick={copy}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-ink-400 transition hover:bg-white/5 hover:text-ink-200"
          type="button"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed">
        <code className="font-mono text-ink-200">{code}</code>
      </pre>
    </div>
  )
}

export function RichText({ content, className = '' }: { content: string; className?: string }) {
  const blocks = useMemo(() => parse(content), [content])

  return (
    <div className={`text-[15px] leading-relaxed text-body ${className}`}>
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'code':
            return <CodeBlock key={idx} lang={block.lang} code={block.code} />
          case 'heading': {
            const sizes = ['text-lg', 'text-base', 'text-sm']
            return (
              <p key={idx} className={`mt-4 mb-1.5 font-bold text-strong ${sizes[block.level - 1]}`}>
                <Inline text={block.text} />
              </p>
            )
          }
          case 'quote':
            return (
              <blockquote
                key={idx}
                className="my-3 border-l-2 border-brand-500/60 bg-brand-500/5 px-3.5 py-2 text-sm italic"
              >
                <Inline text={block.text} />
              </blockquote>
            )
          case 'list':
            return block.ordered ? (
              <ol key={idx} className="my-2 list-decimal space-y-1 pl-5 marker:text-brand-500">
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inline text={item} />
                  </li>
                ))}
              </ol>
            ) : (
              <ul key={idx} className="my-2 list-disc space-y-1 pl-5 marker:text-brand-500">
                {block.items.map((item, i) => (
                  <li key={i}>
                    <Inline text={item} />
                  </li>
                ))}
              </ul>
            )
          default:
            return (
              <p key={idx} className="prose-content my-2 first:mt-0 last:mb-0">
                <Inline text={block.text} />
              </p>
            )
        }
      })}
    </div>
  )
}
