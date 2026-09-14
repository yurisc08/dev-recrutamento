-- =====================================================================
-- Portal de Decisões — processo, campos, ações e regras iniciais.
-- Derivado da planilha de referência (aba "2. BASE DECISÕES_CONS").
-- Pode rodar mais de uma vez: nada é duplicado.
-- =====================================================================
SET search_path = portal, public;

INSERT INTO portal.processos (nome, data_base, prazo, aviso_confidencialidade)
SELECT 'Reestruturação', DATE '2026-07-31', DATE '2026-09-11',
       'Documento confidencial. Não compartilhe, exporte ou imprima fora do processo de reestruturação.'
WHERE NOT EXISTS (SELECT 1 FROM portal.processos WHERE ativo);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
campos(chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, ordem) AS (VALUES
  ('concatenar','CONCATENAR','texto','Controle','base',false,false,false,false,'admin',10),
  ('competencia','COMPETENCIA','texto','Controle','base',false,false,false,false,'admin',20),
  ('area_ajustada','ÁREA AJUSTADA','texto','Organização','base',false,true,false,false,'admin',30),
  ('filial','FILIAL','texto','Organização','base',false,true,false,false,'admin',40),
  ('diretoria','DIRETORIA','texto','Organização','base',true,true,false,false,'admin',50),
  ('divisao','DIVISAO','texto','Organização','base',true,true,false,false,'admin',60),
  ('departamento','DEPARTAMENTO','texto','Organização','base',false,true,false,false,'admin',70),
  ('des_uo','DES_UO','texto','Organização','base',false,false,false,false,'admin',80),
  ('nome','NOME','texto','Identificação','base',true,false,false,false,'admin',90),
  ('chapa','CHAPA','texto','Identificação','base',true,false,false,false,'admin',100),
  ('cpf','CPF','texto','Identificação','base',false,false,false,true,'admin',110),
  ('des_cargo','DES_CARGO','texto','Cargo','base',true,false,false,false,'admin',120),
  ('des_conjunto_cargo','DES_CONJUNTO_CARGO','texto','Cargo','base',false,false,false,false,'admin',130),
  ('natureza','NATUREZA','texto','Cargo','base',false,true,false,false,'admin',140),
  ('mo','MO','texto','Cargo','base',false,true,false,false,'admin',150),
  ('situacao','SITUACAO','texto','Situação','base',true,true,false,false,'admin',160),
  ('dt_admissao','DT_ADMISSAO','data','Situação','base',false,false,false,false,'admin',170),
  ('tempo_casa','TEMPO_CASA','numero','Situação','base',false,false,false,false,'admin',180),
  ('idade','IDADE','numero','Situação','base',false,false,false,false,'admin',190),
  ('dt_nasc','DT_NASC','data','Situação','base',false,false,false,true,'admin',200),
  ('dt_aposentadoria','DT_APOSENTADORIA','data','Situação','base',false,false,false,false,'admin',210),
  ('tipo_invalidez','TIPO_INVALIDEZ','texto','Situação','base',false,false,false,false,'admin',220),
  ('salario','SALARIO','moeda','Remuneração','base',false,false,false,false,'admin',230),
  ('salario_total','SALARIO_TOTAL','moeda','Remuneração','base',true,false,false,false,'admin',240),
  ('vlr_mediana','VLR_MEDIANA','moeda','Remuneração','base',false,false,false,false,'admin',250),
  ('prm','PRM','moeda','Remuneração','base',false,false,false,false,'admin',260),
  ('salario_anual','SALÁRIO ANUAL','moeda','Remuneração','base',false,false,true,false,'admin',270),
  ('centro_custo_sap','CENTRO DE CUSTO_SAP','texto','Remuneração','base',false,false,false,false,'admin',280),
  ('avaliacao_performar','DATA E NOTA ÚLTIMA AVALIAÇÃO PERFORMAR REGISTRADA','texto','Desempenho','base',true,false,false,false,'admin',290),
  ('estabilidade','ESTABILIDADE','texto','Estabilidade','base',true,false,false,false,'admin',300),
  ('data_fim_estabilidade','DATA FIM ESTABILIDADE','data','Estabilidade','base',true,false,false,false,'admin',310),
  ('acao','AÇÃO INDICADA','lista','Decisão','avaliacao',true,false,false,false,'gestor',320),
  ('destino','EM CASO DE TRANSFERÊNCIA, INDICAR PARA ONDE','texto','Decisão','avaliacao',false,false,false,false,'gestor',330),
  ('justificativa','JUSTIFICATIVA','texto','Decisão','avaliacao',true,false,false,false,'gestor',340)
)
INSERT INTO portal.campos (processo_id, chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, somente_leitura, ordem)
SELECT p.id, c.chave, c.rotulo, c.tipo, c.grupo, c.origem, c.visivel_lista, c.agrupar, c.somar, c.sensivel, c.editavel_por, false, c.ordem
  FROM p, campos c
 WHERE NOT EXISTS (SELECT 1 FROM portal.campos x WHERE x.processo_id = p.id AND x.chave = c.chave);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
acoes(valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem) AS (VALUES
  ('ATIVO','manter',false,false,false,10),
  ('DESLIGAMENTO','desligamento',true,false,true,20),
  ('TRANSFERÊNCIA DE ÁREA','transferencia',true,true,false,30),
  ('ESTABILIDADE','atencao',true,false,false,40)
)
INSERT INTO portal.acoes (processo_id, valor, cor, exige_justificativa, exige_destino, considera_desligamento, ordem)
SELECT p.id, a.valor, a.cor, a.exige_justificativa, a.exige_destino, a.considera_desligamento, a.ordem
  FROM p, acoes a
 WHERE NOT EXISTS (SELECT 1 FROM portal.acoes x WHERE x.processo_id = p.id AND x.valor = a.valor);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
regras(nome, campo, operador, valor, mensagem, severidade, aplica_acao, exige_justificativa, ordem) AS (VALUES
  ('Desligado na posição-base','situacao','igual','DESLIGADO',
   'Colaborador já desligado na posição-base. Confirme com o RH antes de registrar nova decisão.','info',NULL,false,10),
  ('Estabilidade declarada','estabilidade','preenchido',NULL,
   '⚠️ Atenção: este colaborador possui uma condição que requer validação do RH antes de eventual desligamento.','atencao','DESLIGAMENTO',true,20),
  ('Estabilidade vigente','data_fim_estabilidade','data_futura',NULL,
   'Estabilidade vigente na data informada — o desligamento não pode ocorrer antes do término da vigência.','critico','DESLIGAMENTO',true,30),
  ('Afastamento / invalidez','tipo_invalidez','preenchido',NULL,
   'Há registro de afastamento/invalidez. Validação do RH é obrigatória antes de qualquer ação.','atencao',NULL,false,40),
  ('Aposentadoria prevista','dt_aposentadoria','preenchido',NULL,
   'Existe data de aposentadoria informada. Considere no planejamento da decisão.','info',NULL,false,50)
)
INSERT INTO portal.regras (processo_id, nome, campo, operador, valor, mensagem, severidade, aplica_acao, exige_justificativa, ordem)
SELECT p.id, r.nome, r.campo, r.operador, r.valor, r.mensagem, r.severidade, r.aplica_acao, r.exige_justificativa, r.ordem
  FROM p, regras r
 WHERE NOT EXISTS (SELECT 1 FROM portal.regras x WHERE x.processo_id = p.id AND x.nome = r.nome);
