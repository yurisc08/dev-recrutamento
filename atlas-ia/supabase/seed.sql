-- Conteudo de exemplo para testar a busca semantica sem precisar de dados reais.
-- Os embeddings NAO sao gerados aqui: rode `POST /api/documents` (ou o botao
-- "Adicionar conhecimento" na interface) para que o Worker calcule os vetores.

insert into public.documents (id, owner_id, title, source_url, metadata)
values (
  '00000000-0000-4000-8000-000000000001',
  null,
  'Politica de trocas e devolucoes',
  null,
  '{"categoria": "atendimento"}'::jsonb
)
on conflict (id) do nothing;
