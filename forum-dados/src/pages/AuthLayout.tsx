import type { ReactNode } from 'react'
import { BarChart3, Database, MessagesSquare, ShieldCheck } from 'lucide-react'
import { Logo } from '../components/Logo'

const HIGHLIGHTS = [
  { icon: MessagesSquare, title: 'Discussões com contexto', text: 'Tópicos por categoria, tags e busca full-text.' },
  { icon: Database, title: 'Feito para dados', text: 'Blocos de SQL e Python formatados nativamente.' },
  { icon: BarChart3, title: 'Projetos visíveis', text: 'Atualizações de roadmap sem perder no chat.' },
  { icon: ShieldCheck, title: 'Acesso controlado', text: 'Autenticação Supabase com RLS em todas as tabelas.' },
]

export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Painel de marca */}
      <div className="relative hidden overflow-hidden bg-ink-950 p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              'radial-gradient(60% 55% at 15% 10%, rgba(99,102,241,.35), transparent 60%), radial-gradient(50% 45% at 85% 90%, rgba(6,182,212,.22), transparent 60%)',
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />

        <div className="relative flex items-center gap-3">
          <Logo size={36} />
          <span className="text-xl font-extrabold tracking-tight text-white">
            Data<span className="text-brand-400">Hub</span>
          </span>
        </div>

        <div className="relative max-w-lg">
          <h1 className="text-4xl font-extrabold leading-tight text-white">
            O ponto de encontro do time de&nbsp;dados.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-ink-300">
            Um espaço só da equipe para compartilhar análises, discutir modelagem, registrar decisões
            e acompanhar o andamento dos projetos — sem depender de threads perdidas no e-mail.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            {HIGHLIGHTS.map(({ icon: Icon, title: t, text }) => (
              <div key={t} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur">
                <Icon size={18} className="text-brand-400" />
                <p className="mt-2 text-sm font-semibold text-white">{t}</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-400">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-ink-500">
          Supabase · Cloudflare Pages · React + TypeScript
        </p>
      </div>

      {/* Formulário */}
      <div className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo size={34} />
            <span className="text-lg font-extrabold tracking-tight text-strong">
              Data<span className="text-brand-500">Hub</span>
            </span>
          </div>

          <h2 className="text-2xl font-extrabold text-strong">{title}</h2>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>

          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  )
}
