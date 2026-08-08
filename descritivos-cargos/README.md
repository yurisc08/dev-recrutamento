# Descritivos de Cargos

Aplicação web (HTML/CSS/JS puro, sem build e sem dependências) para coleta,
aprovação e publicação de descritivos de cargo. O formulário, as validações e o
documento final seguem o **modelo MAPA DE CARREIRA**, declarado em um único
lugar: `assets/model.js`.

## Como executar

Abra `index.html` no navegador, ou sirva a pasta:

```bash
npx http-server descritivos-cargos -p 8080
```

Os dados ficam no `localStorage` do navegador (chave `descritivos_cargos_v2`).
Em Administração há o botão **Restaurar dados de teste**.

## Acessos de teste

| Papel | Acesso |
| --- | --- |
| Responsável pelo cargo | código `DC-00001` (sem usuário/senha) |
| Aprovador | `aprovador@empresa.com` / `Ap@2026!` |
| Carreira & Recompensa | `rh@empresa.com` / `Rh@2026!` |

## O fluxo

```
C&R cria o cargo (identificação + formação + comportamentais)
        │  gera código de acesso e prepara o e-mail ao responsável
        ▼
   editing ──enviar──▶ manager_review ──aprovar──▶ hr_review ──validar──▶ approved
      ▲                     │                          │                     │
      └──── returned ◀──devolver───────────────devolver─┘        documento / PDF
```

| Etapa | Rótulo | Quem age |
| --- | --- | --- |
| `editing` | Em preenchimento | Responsável pelo cargo |
| `returned` | Devolvido para correção | Responsável pelo cargo |
| `manager_review` | Aguardando aprovação | Aprovador |
| `hr_review` | Validação de C&R | Carreira & Recompensa |
| `approved` | Aprovado | — (documento liberado) |

Regras aplicadas em `assets/store.js` (`TRANSITIONS`):

- **Enviar para aprovação** exige todos os campos obrigatórios do responsável.
- **Devolver** exige justificativa, que vira comentário e entra no histórico.
- **Validar e aprovar** revalida os campos dos dois papéis e grava a
  *Data de revisão* automaticamente.
- **Reabrir para revisão** (só C&R, só em cargos aprovados) devolve o cargo
  para preenchimento com justificativa.

## Divisão do modelo por papel

| Bloco do modelo | Preenchido por |
| --- | --- |
| Identificação do cargo (empresa, código, cargo, CBO, trilha, datas) | C&R |
| Foco de atuação, Missão, Responsabilidades | Responsável |
| Formação mínima / desejável | C&R |
| Idioma mínimo / desejável | Responsável |
| Competências técnicas mínimas / desejáveis | Responsável |
| Competências comportamentais Marcopolo | C&R |
| Experiência mínima / desejável | Responsável |

Campos que não pertencem ao papel logado aparecem bloqueados (🔒), em qualquer
etapa. O aprovador nunca edita conteúdo — apenas aprova ou devolve.

## Arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `assets/model.js` | Seções, campos, papéis, etapas e regras de edição do modelo |
| `assets/store.js` | Persistência, dados de teste, visibilidade e transições do fluxo |
| `assets/app.js` | Interface: login, navegação, formulário, filas, documento |
| `assets/styles.css` | Estilos, incluindo a folha de impressão do documento |

Para incluir ou renomear um campo do descritivo basta editar `SECTIONS` em
`assets/model.js`: formulário, validação e documento final acompanham.
