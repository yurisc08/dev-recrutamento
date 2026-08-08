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
    label: 'Aprovação do aprovador',
    tone: 'review',
    owner: 'approver',
    hint: 'Etapa opcional: enviado ao aprovador indicado no cadastro do cargo.'
  },
  hr_review: {
    label: 'Aprovação de C&R',
    tone: 'review',
    owner: 'hr',
    hint: 'Aguardando a análise de Carreira & Recompensa: aprovar ou devolver.'
  },
  approved: {
    label: 'Aprovado',
    tone: 'approved',
    owner: null,
    hint: 'Descritivo aprovado. O documento já pode ser gerado.'
  },
  canceled: {
    label: 'Cancelado',
    tone: 'canceled',
    owner: null,
    hint: 'Cargo cancelado por Carreira & Recompensa. Pode ser reaberto.'
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
const DEFAULT_SECTIONS = [
  {
    id: 'identificacao',
    title: 'Identificação do cargo',
    owner: 'hr',
    layout: 'table',
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
      { key: 'focus',            label: 'Foco de atuação', type: 'textarea', required: true, full: true },
      { key: 'mission',          label: 'Missão',          type: 'textarea', required: true, full: true },
      { key: 'responsibilities', label: 'Principais responsabilidades / atividades', type: 'textarea', required: true, full: true,
        hint: 'Uma responsabilidade por linha.' }
    ]
  },
  {
    id: 'formacao',
    title: 'Formação',
    owner: 'hr',
    fields: [
      { key: 'educationMin',     label: 'Formação mínima',    type: 'text', required: true },
      { key: 'educationDesired', label: 'Formação desejável', type: 'text', required: true }
    ]
  },
  {
    id: 'idiomas',
    title: 'Idiomas',
    owner: 'manager',
    fields: [
      { key: 'languageMin',     label: 'Idioma mínimo',    type: 'text', required: true },
      { key: 'languageDesired', label: 'Idioma desejável', type: 'text', required: true }
    ]
  },
  {
    id: 'tecnicas',
    title: 'Competências técnicas',
    owner: 'manager',
    fields: [
      { key: 'technicalMin',     label: 'Competências técnicas mínimas',    type: 'textarea', required: true, full: true },
      { key: 'technicalDesired', label: 'Competências técnicas desejáveis', type: 'textarea', required: true, full: true }
    ]
  },
  {
    id: 'comportamentais',
    title: 'Competências comportamentais',
    owner: 'hr',
    fields: [
      { key: 'behavioral', label: 'Competências comportamentais Marcopolo', type: 'textarea', required: true, full: true }
    ]
  },
  {
    id: 'experiencia',
    title: 'Experiência profissional',
    owner: 'manager',
    fields: [
      { key: 'experienceMin',     label: 'Experiência mínima',    type: 'text', required: true },
      { key: 'experienceDesired', label: 'Experiência desejável', type: 'text', required: true }
    ]
  }
];

/* Campos do fluxo (não fazem parte do documento, mas são cadastrados por C&R). */
const FLOW_FIELDS = [
  { key: 'manager',      label: 'Responsável pelo preenchimento', type: 'text',  required: true },
  { key: 'managerEmail', label: 'E-mail do responsável',          type: 'email', required: true },
  { key: 'approver',     label: 'Aprovador (opcional)',           type: 'text',  required: false,
    hint: 'Deixe em branco para o descritivo ir direto de você para C&R.' },
  { key: 'deadline',     label: 'Prazo de preenchimento',         type: 'date',  required: true }
];

/* --------------------------- Modelo em vigor ----------------------------- */
/*
 * O modelo não é fixo no código: C&R pode criar, renomear e reordenar campos
 * pela tela "Modelo". O padrão abaixo é só o ponto de partida — quem manda é o
 * que estiver gravado (data/db.json no servidor, ou o navegador no modo local).
 *
 * Tudo o que depende do modelo — formulário, validação, permissão de escrita,
 * documento e exportação — passa por estas funções, então basta trocar as
 * seções aqui para as quatro coisas acompanharem.
 */
let currentSections = clone(DEFAULT_SECTIONS);
let currentFields = flatten(currentSections);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function flatten(sections) {
  return sections.flatMap(section => section.fields.map(field => ({
    ...field,
    owner: field.owner || section.owner,
    section: section.id,
    // Título do bloco no documento: o rótulo em maiúsculas, salvo indicação.
    docHead: field.docHead || String(field.label || '').toUpperCase()
  })));
}

function sections() {
  return currentSections;
}

function allFields() {
  return currentFields;
}

/* Troca o modelo em vigor. Devolve { ok, error } sem alterar nada se algo
 * estiver errado — assim um modelo inválido nunca chega a valer. */
function setSections(next) {
  const check = validateSections(next);
  if (!check.ok) return check;
  currentSections = clone(next);
  currentFields = flatten(currentSections);
  return { ok: true };
}

function resetSections() {
  currentSections = clone(DEFAULT_SECTIONS);
  currentFields = flatten(currentSections);
  return { ok: true };
}

const FIELD_TYPES = ['text', 'textarea', 'date'];

function validateSections(next) {
  if (!Array.isArray(next) || !next.length) return { ok: false, error: 'O modelo precisa ter ao menos uma seção' };

  const keys = new Set();

  for (const section of next) {
    if (!section || !String(section.title || '').trim()) return { ok: false, error: 'Toda seção precisa de um título' };
    if (!Array.isArray(section.fields) || !section.fields.length) {
      return { ok: false, error: `A seção "${section.title}" está sem campos` };
    }

    for (const field of section.fields) {
      if (!String(field.label || '').trim()) return { ok: false, error: `Há um campo sem rótulo em "${section.title}"` };
      if (!String(field.key || '').trim()) return { ok: false, error: `O campo "${field.label}" está sem identificador` };
      if (keys.has(field.key)) return { ok: false, error: `Identificador repetido: ${field.key}` };
      if (field.type && !FIELD_TYPES.includes(field.type)) return { ok: false, error: `Tipo inválido em "${field.label}"` };
      keys.add(field.key);
    }
  }

  // O nome do cargo identifica o descritivo na lista, no e-mail e no documento.
  if (!keys.has('name')) return { ok: false, error: 'O modelo precisa manter o campo "Nome do cargo"' };

  // Sem campos do responsável, o fluxo perderia o sentido: ele não teria o que
  // preencher e o cargo iria direto para aprovação vazio.
  const hasManagerField = flatten(next).some(f => f.owner === 'manager');
  if (!hasManagerField) return { ok: false, error: 'Ao menos um campo precisa ser preenchido pelo responsável' };

  return { ok: true };
}

/* Identificador estável a partir do rótulo, para campos criados na tela. */
function keyFromLabel(label, taken = []) {
  const base = String(label || 'campo')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    .slice(0, 30) || 'campo';

  let key = base;
  let n = 2;
  while (taken.includes(key)) key = `${base}_${n++}`;
  return key;
}

/* ------------------------------ Utilidades ------------------------------- */
function fieldsOf(role) {
  return currentFields.filter(f => f.owner === role);
}

function blankJob() {
  return currentFields.reduce((acc, f) => (acc[f.key] = '', acc), {});
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
  ROLES, STAGES, EDITABLE_STAGES, FLOW_FIELDS, FIELD_TYPES, DEFAULT_SECTIONS,
  sections, allFields, setSections, resetSections, validateSections, keyFromLabel,
  fieldsOf, blankJob, missingFields, completion, canEdit, isoToday, addDays
};

});
