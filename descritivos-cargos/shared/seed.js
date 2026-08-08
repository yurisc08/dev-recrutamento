/*
 * shared/seed.js
 * -----------------------------------------------------------------------------
 * Dados de demonstração, usados pelos dois modos:
 *   - servidor  (server/db.js), ao criar data/db.json pela primeira vez
 *   - modo local (assets/local-store.js), ao abrir o index.html sem servidor
 *
 * Estar em um só lugar garante que a demonstração seja idêntica nos dois casos.
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

function seedUsers() {
  return [
    { email: 'rh@empresa.com',        name: 'Carreira & Recompensa',  role: 'hr',       password: 'Rh@2026!' },
    { email: 'aprovador@empresa.com', name: 'Aprovador Demonstração', role: 'approver', password: 'Ap@2026!' }
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
      approver: 'Aprovador Demonstração',
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
    })
  ];
}

return { seedUsers, seedJobs };

});
