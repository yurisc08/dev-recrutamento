import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, PenSquare, SearchX } from 'lucide-react'
import { fetchCategoryBySlug } from '../lib/api'
import type { Category } from '../lib/types'
import { CategoryIcon } from '../components/CategoryIcon'
import { ThreadFeed } from '../components/ThreadFeed'
import { EmptyState, PageLoader } from '../components/ui'

export function CategoryPage() {
  const { slug } = useParams<{ slug: string }>()
  const [category, setCategory] = useState<Category | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    fetchCategoryBySlug(slug)
      .then(setCategory)
      .catch(() => setCategory(null))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) return <PageLoader />

  if (!category) {
    return (
      <EmptyState
        icon={SearchX}
        title="Categoria não encontrada"
        description="O link pode estar desatualizado ou a categoria foi removida."
        action={
          <Link to="/" className="btn btn-outline mt-2">
            <ArrowLeft size={16} /> Voltar ao feed
          </Link>
        }
      />
    )
  }

  return (
    <div className="animate-in space-y-5">
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <CategoryIcon icon={category.icon} color={category.color} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-extrabold">{category.name}</h1>
          {category.description && <p className="mt-0.5 text-sm text-muted">{category.description}</p>}
        </div>
        <Link to={`/novo?categoria=${category.slug}`} className="btn btn-primary">
          <PenSquare size={16} /> Novo tópico
        </Link>
      </div>

      <ThreadFeed categoryId={category.id} showCategory={false} />
    </div>
  )
}
