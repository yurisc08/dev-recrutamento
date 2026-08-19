import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { EmptyState } from '../components/ui'

export function NotFound() {
  return (
    <EmptyState
      icon={Compass}
      title="Página não encontrada"
      description="O endereço que você acessou não existe neste fórum."
      action={
        <Link to="/" className="btn btn-primary mt-2">
          Voltar ao feed
        </Link>
      }
    />
  )
}
