/*
 * shared/model.js
 * -----------------------------------------------------------------------------
 * Fonte única de verdade do MODELO de descritivo de cargo (MAPA DE CARREIRA).
 *
 * Carregado pelos dois lados:
 *   - navegador (<script src="shared/model.js">)  -> expõe os nomes como globais
 *   - servidor  (require('./shared/model.js'))    -> exporta o mesmo objeto
 *
 * A ordem das seções e dos campos declarada aqui é usada em quatro lugares:
 *   1. formulário de preenchimento  (assets/app.js)
 *   2. validação do fluxo           (shared/flow.js, executada no servidor)
 *   3. permissão de escrita         (shared/flow.js, executada no servidor)
 *   4. documento final impresso     (assets/app.js)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Model = api; Object.assign(root, api); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

/* --------------------------------- Papéis -------------------------------- */
const ROLES = {
  hr:       { label: 'Carreira & Recompensa' },
  manager:  { label: 'Responsável pelo cargo' },
  approver: { label: 'Aprovador' }
};

/* ------------------------------- Etapas ---------------------------------- */
/*
 * Fluxo conforme o modelo:
 *
 *   C&R cria o cargo (identificação + formação + comportamentais)
 *        v
 *   editing ──enviar──> manager_review ──aprovar──> hr_review ──validar──> approved
 *      ^                     |                          |
 *      └──── returned <──devolver──────────────devolver──┘
 */
const STAGES = {
  editing: {
    label: 'Em preenchimento',
    tone: 'draft',
    owner: 'manager',
    hint: 'Aguardando o preenchimento do responsável pelo cargo.'
  },
  returned: {
    label: 'Devolvido para correção',
    tone: 'returned',
    owner: 'manager',
    hint: 'Ajuste os pontos apontados e reenvie para aprovação.'
  },
  manager_review: {
    label: 'Aguardando aprovação',
    tone: 'review',
    owner: 'approver',
    hint: 'Enviado ao aprovador. Nenhuma ação do responsável é necessária.'
  },
  hr_review: {
    label: 'Validação de C&R',
    tone: 'review',
    owner: 'hr',
    hint: 'Aprovado pelo aprovador. Em validação final de Carreira & Recompensa.'
  },
  approved: {
    label: 'Aprovado',
    tone: 'approved',
    owner: null,
    hint: 'Descritivo aprovado. O documento já pode ser gerado.'
  }
};

/* Etapas em que cada papel ainda pode editar os campos que lhe pertencem. */
const EDITABLE_STAGES = {
  manager: ['editing', 'returned'],
  hr: ['editing', 'returned', 'manager_review', 'hr_review'],
  approver: []
};

/* ------------------------- Seções do modelo ------------------------------ */
/*
 * owner  : papel responsável por preencher o campo
 * type   : text | textarea | date
 * full   : ocupa a linha inteira do formulário
 * docHead: título do bloco no documento final
 */
const SECTIONS = [
  {
    id: 'identificacao',
    title: 'Identificação do cargo',
    owner: 'hr',
    fields: [
      { key: 'company',      label: 'Empresa',            type: 'text', required: true },
      { key: 'jobCode',      label: 'Código do cargo',    type: 'text', required: true },
      { key: 'name',         label: 'Nome do cargo',      type: 'text', required: true },
      { key: 'cbo',          label: 'CBO',                type: 'text', required: true },
      { key: 'track',        label: 'Trilha de carreira', type: 'text', required: true },
      { key: 'creationDate', label: 'Data de criação',    type: 'date', required: true },
      { key: 'reviewDate',   label: 'Data de revisão',    type: 'date', required: false,
        hint: 'Preenchida automaticamente na validação final de C&R.' }
    ]
  },
  {
    id: 'atuacao',
    title: 'Conteúdo do cargo',
    owner: 'manager',
    fields: [
      { key: 'focus',            label: 'Foco de atuação', type: 'textarea', required: true, full: true, docHead: 'FOCO DE ATUAÇÃO' },
      { key: 'mission',          label: 'Missão',          type: 'textarea', required: true, full: true, docHead: 'MISSÃO' },
      { key: 'responsibilities', label: 'Principais responsabilidades / atividades', type: 'textarea', required: true, full: true, docHead: 'PRINCIPAIS RESPONSABILIDADES / ATIVIDADES',
        hint: 'Uma responsabilidade por linha.' }
    ]
  },
  {
    id: 'formacao',
    title: 'Formação',
    owner: 'hr',
    fields: [
      { key: 'educationMin',     label: 'Formação mínima',    type: 'text', required: true, docHead: 'FORMAÇÃO MÍNIMA' },
      { key: 'educationDesired', label: 'Formação desejável', type: 'text', required: true, docHead: 'FORMAÇÃO DESEJÁVEL' }
    ]
  },
  {
    id: 'idiomas',
    title: 'Idiomas',
    owner: 'manager',
    fields: [
      { key: 'languageMin',     label: 'Idioma mínimo',    type: 'text', required: true, docHead: 'IDIOMA MÍNIMO' },
      { key: 'languageDesired', label: 'Idioma desejável', type: 'text', required: true, docHead: 'IDIOMA DESEJÁVEL' }
    ]
  },
  {
    id: 'tecnicas',
    title: 'Competências técnicas',
    owner: 'manager',
    fields: [
      { key: 'technicalMin',     label: 'Competências técnicas mínimas',    type: 'textarea', required: true, full: true, docHead: 'COMPETÊNCIAS TÉCNICAS MÍNIMAS' },
      { key: 'technicalDesired', label: 'Competências técnicas desejáveis', type: 'textarea', required: true, full: true, docHead: 'COMPETÊNCIAS TÉCNICAS DESEJÁVEIS' }
    ]
  },
  {
    id: 'comportamentais',
    title: 'Competências comportamentais',
    owner: 'hr',
    fields: [
      { key: 'behavioral', label: 'Competências comportamentais Marcopolo', type: 'textarea', required: true, full: true, docHead: 'COMPETÊNCIAS COMPORTAMENTAIS MARCOPOLO' }
    ]
  },
  {
    id: 'experiencia',
    title: 'Experiência profissional',
    owner: 'manager',
    fields: [
      { key: 'experienceMin',     label: 'Experiência mínima',    type: 'text', required: true, docHead: 'EXPERIÊNCIA MÍNIMA' },
      { key: 'experienceDesired', label: 'Experiência desejável', type: 'text', required: true, docHead: 'EXPERIÊNCIA DESEJÁVEL' }
    ]
  }
];

/* Campos do fluxo (não fazem parte do documento, mas são cadastrados por C&R). */
const FLOW_FIELDS = [
  { key: 'manager',      label: 'Responsável pelo preenchimento', type: 'text',  required: true },
  { key: 'managerEmail', label: 'E-mail do responsável',          type: 'email', required: true },
  { key: 'approver',     label: 'Aprovador',                      type: 'text',  required: true },
  { key: 'deadline',     label: 'Prazo de preenchimento',         type: 'date',  required: true }
];

/* ------------------------------ Utilidades ------------------------------- */
const ALL_FIELDS = SECTIONS.flatMap(s => s.fields.map(f => ({ ...f, owner: f.owner || s.owner, section: s.id })));

function fieldsOf(role) {
  return ALL_FIELDS.filter(f => f.owner === role);
}

function blankJob() {
  return ALL_FIELDS.reduce((acc, f) => (acc[f.key] = '', acc), {});
}

/* Campos obrigatórios do papel que ainda estão vazios. */
function missingFields(job, role) {
  return fieldsOf(role).filter(f => f.required && !String(job[f.key] || '').trim());
}

/* Percentual preenchido considerando apenas os campos obrigatórios do papel. */
function completion(job, role) {
  const fields = fieldsOf(role).filter(f => f.required);
  if (!fields.length) return 100;
  const done = fields.filter(f => String(job[f.key] || '').trim()).length;
  return Math.round((done / fields.length) * 100);
}

function canEdit(job, role) {
  return (EDITABLE_STAGES[role] || []).includes(job.status);
}

/* --------------------------------- Datas --------------------------------- */
function isoToday() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

return {
  ROLES, STAGES, EDITABLE_STAGES, SECTIONS, FLOW_FIELDS, ALL_FIELDS,
  fieldsOf, blankJob, missingFields, completion, canEdit, isoToday, addDays
};

});
