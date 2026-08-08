/*
 * shared/seed.js
 * -----------------------------------------------------------------------------
 * Dados de demonstração, usados pelos dois modos:
 *   - servidor  (server/db.js), ao criar data/db.json pela primeira vez
 *   - modo local (assets/local-store.js), ao abrir o index.html sem servidor
 *
 * São quatro códigos de acesso, um para cada tipo de porta de entrada:
 *
 *   CR-00001  Carreira & Recompensa (administrativo, é quem aprova)
 *   AP-00001  Aprovador (etapa opcional, usada quando o cargo indica um)
 *   DC-00001  Responsável — Gestor Demonstração (2 cargos)
 *   DC-00002  Responsável — Gestora Demonstração (1 cargo já aprovado)
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./model.js'), require('./flow.js'));
  } else {
    const api = factory(root.Model, root.Flow);
    root.Seed = api;
    Object.assign(root, api);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Model, Flow) {

/* Chaves administrativas: C&R e aprovadores. Os responsáveis não entram aqui —
 * o código deles nasce junto com o cargo. */
function seedKeys() {
  return [
    { code: 'CR-00001', name: 'Carreira & Recompensa',  role: 'hr',       createdAt: new Date().toISOString(), lastUsedAt: '' },
    { code: 'AP-00001', name: 'Aprovador Demonstração', role: 'approver', createdAt: new Date().toISOString(), lastUsedAt: '' }
  ];
}

function seedJobs() {
  const today = Model.isoToday();

  return [
    Flow.normalizeJob({
      id: 1,
      code: 'DC-00001',
      jobCode: 'AN-0421',
      name: 'Analista de Dados e BI',
      company: 'Empresa Exemplo',
      cbo: '2124-05',
      track: 'Especialista',
      creationDate: today,
      manager: 'Gestor Demonstração',
      managerEmail: 'gestor@empresa.com',
      approver: '',
      deadline: Model.addDays(today, 12),
      status: 'editing',
      educationMin: 'Superior completo em Estatística, Sistemas de Informação ou correlatos',
      educationDesired: 'Pós-graduação em Análise de Dados',
      behavioral: 'Trabalho em equipe\nOrientação a resultados\nComunicação assertiva',
      history: [Flow.entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr')]
    }),

    Flow.normalizeJob({
      id: 2,
      code: 'DC-00001',
      jobCode: 'ES-0118',
      name: 'Especialista de Processos',
      company: 'Empresa Exemplo',
      cbo: '2521-05',
      track: 'Especialista',
      creationDate: today,
      manager: 'Gestor Demonstração',
      managerEmail: 'gestor@empresa.com',
      approver: 'Aprovador Demonstração',
      deadline: Model.addDays(today, 14),
      status: 'returned',
      educationMin: 'Superior completo em Engenharia ou Administração',
      educationDesired: 'Certificação Lean Six Sigma',
      behavioral: 'Visão sistêmica\nCapacidade analítica\nInfluência sem autoridade',
      focus: 'Melhoria contínua dos processos industriais.',
      mission: 'Promover a melhoria contínua dos processos, garantindo eficiência e padronização.',
      responsibilities: 'Mapear processos das áreas produtivas.',
      languageMin: 'Inglês intermediário',
      languageDesired: 'Espanhol básico',
      technicalMin: 'Mapeamento de processos (BPMN)',
      technicalDesired: 'Automação de processos',
      experienceMin: '3 anos em melhoria de processos',
      experienceDesired: '5 anos em ambiente industrial',
      history: [
        Flow.entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr'),
        Flow.entry('Enviado para aprovação', 'Gestor Demonstração', 'manager'),
        Flow.entry('Devolvido para correção: detalhar melhor as responsabilidades', 'Aprovador Demonstração', 'approver')
      ],
      comments: [Flow.comment('Detalhar melhor as responsabilidades, listando uma atividade por linha.', 'Aprovador Demonstração', 'approver')]
    }),

    /* Um cargo já aprovado, para o documento poder ser visto de imediato. */
    Flow.normalizeJob({
      id: 3,
      code: 'DC-00002',
      jobCode: 'CO-0307',
      name: 'Comprador Pleno',
      company: 'Empresa Exemplo',
      cbo: '3542-05',
      track: 'Profissional',
      creationDate: Model.addDays(today, -20),
      reviewDate: Model.addDays(today, -2),
      manager: 'Gestora Demonstração',
      managerEmail: 'gestora@empresa.com',
      approver: 'Aprovador Demonstração',
      deadline: Model.addDays(today, -5),
      status: 'approved',
      educationMin: 'Superior completo em Administração ou Engenharia',
      educationDesired: 'Pós-graduação em Suprimentos',
      behavioral: 'Negociação\nÉtica\nOrientação a resultados',
      focus: 'Negociação e gestão da carteira de fornecedores de materiais indiretos.',
      mission: 'Garantir o abastecimento com o melhor custo total, prazo e qualidade.',
      responsibilities: 'Negociar contratos e preços com fornecedores.\nAcompanhar indicadores de saving.\nHomologar novos fornecedores.',
      languageMin: 'Inglês intermediário',
      languageDesired: 'Espanhol intermediário',
      technicalMin: 'Técnicas de negociação\nERP de compras',
      technicalDesired: 'Análise de custos e formação de preço',
      experienceMin: '3 anos em compras',
      experienceDesired: '5 anos em compras industriais',
      history: [
        Flow.entry('Cargo criado e código de acesso enviado ao responsável', 'Carreira & Recompensa', 'hr'),
        Flow.entry('Enviado para aprovação', 'Gestora Demonstração', 'manager'),
        Flow.entry('Aprovado pelo aprovador', 'Aprovador Demonstração', 'approver'),
        Flow.entry('Validado e aprovado por Carreira & Recompensa', 'Carreira & Recompensa', 'hr')
      ]
    })
  ];
}

return { seedKeys, seedJobs };

});
