import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Eye, PenSquare, X } from 'lucide-react'
import { createThread, fetchCategories } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import type { Category } from '../lib/types'
import { CategoryIcon } from '../components/CategoryIcon'
import { RichText } from '../components/RichText'
import { Alert, Spinner } from '../components/ui'

const PLACEHOLDER = `Descreva o contexto, o que você já tentou e o que precisa do time.

Dicas de formatação:
**negrito**, *itálico*, \`código inline\`, > citação, listas com -

\`\`\`sql
select date_trunc('month', pedido_em) as mes,
       count(*) as pedidos
  from analytics.fato_pedidos
 group by 1
 order by 1;
\`\`\``

export function NewThread() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [preview, setPreview] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchCategories().then((rows) => {
      setCategories(rows)
      const preset = params.get('categoria')
      const match = preset ? rows.find((c) => c.slug === preset) : undefined
      setCategoryId(match?.id ?? rows[0]?.id ?? '')
    })
  }, [params])

  function addTag(raw: string) {
    const tag = raw.trim().toLowerCase().replace(/^#/, '').replace(/[^a-z0-9-_.]/g, '')
    if (!tag || tags.includes(tag) || tags.length >= 5) return
    setTags([...tags, tag])
  }

  function onTagKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      addTag(tagInput)
      setTagInput('')
    } else if (event.key === 'Backspace' && !tagInput && tags.length) {
      setTags(tags.slice(0, -1))
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError('')

    if (!profile) return setError('Sessão expirada. Entre novamente.')
    if (title.trim().length < 5) return setError('O título precisa ter pelo menos 5 caracteres.')
    if (content.trim().length < 10) return setError('Descreva um pouco melhor o seu tópico.')
    if (!categoryId) return setError('Escolha uma categoria.')

    setBusy(true)
    try {
      const id = await createThread({
        categoryId,
        authorId: profile.id,
        title,
        content,
        tags,
      })
      navigate(`/t/${id}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível publicar o tópico.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="animate-in mx-auto max-w-3xl">
      <Link to="/" className="link-muted mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft size={15} /> Voltar ao feed
      </Link>

      <div className="card p-5 sm:p-6">
        <h1 className="text-xl font-extrabold">Novo tópico</h1>
        <p className="mt-1 text-sm text-muted">
          Escreva de forma que outra pessoa consiga entender o contexto daqui a seis meses.
        </p>

        <form onSubmit={submit} className="mt-6 space-y-5">
          {error && <Alert>{error}</Alert>}

          <div>
            <label className="mb-2 block text-sm font-medium text-strong">Categoria</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-left text-sm transition ${
                    categoryId === cat.id
                      ? 'border-brand-500 bg-brand-500/8 text-strong'
                      : 'hover:border-brand-500/40 text-body'
                  }`}
                >
                  <CategoryIcon icon={cat.icon} color={cat.color} size="sm" />
                  <span className="truncate font-medium">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-strong">
              Título
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={160}
              placeholder="Ex.: Como padronizar a métrica de receita recorrente entre BI e Financeiro?"
              className="input"
            />
            <p className="mt-1 text-right text-xs text-muted">{title.length}/160</p>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="content" className="block text-sm font-medium text-strong">
                Conteúdo
              </label>
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 hover:underline"
              >
                <Eye size={13} /> {preview ? 'Editar' : 'Pré-visualizar'}
              </button>
            </div>

            {preview ? (
              <div className="min-h-56 rounded-xl border p-4" style={{ backgroundColor: 'var(--surface-muted)' }}>
                {content.trim() ? (
                  <RichText content={content} />
                ) : (
                  <p className="text-sm text-muted">Nada para pré-visualizar ainda.</p>
                )}
              </div>
            ) : (
              <textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={14}
                maxLength={20000}
                placeholder={PLACEHOLDER}
                className="input resize-y font-mono text-[13px] leading-relaxed"
              />
            )}
          </div>

          <div>
            <label htmlFor="tags" className="mb-1.5 block text-sm font-medium text-strong">
              Tags <span className="text-muted">(até 5 — Enter para adicionar)</span>
            </label>
            {tags.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="chip border-brand-500/30 bg-brand-500/10 text-brand-500">
                    #{tag}
                    <button type="button" onClick={() => setTags(tags.filter((t) => t !== tag))} aria-label={`Remover ${tag}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              id="tags"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={onTagKeyDown}
              onBlur={() => {
                addTag(tagInput)
                setTagInput('')
              }}
              disabled={tags.length >= 5}
              placeholder="sql, dbt, powerbi…"
              className="input"
            />
          </div>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Link to="/" className="btn btn-ghost">
              Cancelar
            </Link>
            <button type="submit" disabled={busy} className="btn btn-primary">
              {busy ? <Spinner size={16} /> : <PenSquare size={16} />}
              {busy ? 'Publicando…' : 'Publicar tópico'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
