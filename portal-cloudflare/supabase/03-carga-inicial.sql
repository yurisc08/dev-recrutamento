-- =====================================================================
-- Portal de Decisões — processo, campos, ações e regras iniciais.
-- Catálogo gerado por modelo/gerar.mjs a partir de modelo/colunas.json
-- (aba "2. BASE DECISÕES_CONS" da planilha do processo: 50 colunas + JUSTIFICATIVA).
-- NÃO EDITE OS BLOCOS "campos(...)" E "acoes(...)" À MÃO.
-- Pode rodar mais de uma vez: nada é duplicado.
-- =====================================================================
SET search_path = portal, public;

INSERT INTO portal.processos (nome, data_base, prazo, aviso_confidencialidade)
SELECT 'Reestruturação', DATE '2026-07-31', DATE '2026-09-11',
       'Documento confidencial. Não compartilhe, exporte ou imprima fora do processo de reestruturação.'
WHERE NOT EXISTS (SELECT 1 FROM portal.processos WHERE ativo);

WITH p AS (SELECT id FROM portal.processos WHERE ativo ORDER BY id LIMIT 1),
campos(chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, ordem, ajuda) AS (VALUES
  ('concatenar','CONCATENAR','texto','Controle','base',false,false,false,false,'admin',10,null),
  ('competencia','COMPETENCIA','texto','Controle','base',false,false,false,false,'admin',20,null),
  ('area_ajustada','ÁREA AJUSTADA','texto','Organização','base',false,true,false,false,'admin',30,null),
  ('filial','FILIAL','texto','Organização','base',false,true,false,false,'admin',40,null),
  ('emp_cod','EMP_COD','texto','Controle','base',false,false,false,false,'admin',50,null),
  ('fil_cod','FIL_COD','texto','Controle','base',false,false,false,false,'admin',60,null),
  ('diretoria','DIRETORIA','texto','Organização','base',true,true,false,false,'admin',70,'Define a Diretoria do colaborador — usada no recorte de acesso do Diretor.'),
  ('divisao','DIVISAO','texto','Organização','base',true,true,false,false,'admin',80,'Define a Divisão do colaborador — usada no recorte de acesso do Gestor.'),
  ('departamento','DEPARTAMENTO','texto','Organização','base',false,true,false,false,'admin',90,null),
  ('uorg_cod','UORG_COD','texto','Controle','base',false,false,false,false,'admin',100,null),
  ('des_uo','DES_UO','texto','Organização','base',false,false,false,false,'admin',110,null),
  ('nome','NOME','texto','Identificação','base',true,false,false,false,'admin',120,null),
  ('chapa','CHAPA','texto','Identificação','base',true,false,false,false,'admin',130,'Matrícula — é a chave que a importação usa para atualizar em vez de duplicar.'),
  ('pessoa_fisica','PESSOA_FISICA','texto','Identificação','base',false,false,false,false,'admin',140,null),
  ('cpf','CPF','texto','Identificação','base',false,false,false,true,'admin',150,'Dado pessoal sensível: fica restrito ao RH, fora da lista e da exportação de quem não é RH.'),
  ('cjca_cod','CJCA_COD','texto','Cargo','base',false,false,false,false,'admin',160,null),
  ('des_conjunto_cargo','DES_CONJUNTO_CARGO','texto','Cargo','base',false,false,false,false,'admin',170,null),
  ('car_cod','CAR_COD','texto','Cargo','base',false,false,false,false,'admin',180,null),
  ('des_cargo','DES_CARGO','texto','Cargo','base',true,false,false,false,'admin',190,null),
  ('segmento','SEGMENTO','texto','Organização','base',false,true,false,false,'admin',200,null),
  ('tur_cod','TUR_COD','texto','Cargo','base',false,false,false,false,'admin',210,null),
  ('mo','MO','texto','Cargo','base',false,true,false,false,'admin',220,null),
  ('natureza','NATUREZA','texto','Cargo','base',false,true,false,false,'admin',230,null),
  ('situacao','SITUACAO','texto','Situação','base',true,true,false,false,'admin',240,null),
  ('dt_admissao','DT_ADMISSAO','data','Situação','base',false,false,false,false,'admin',250,null),
  ('tempo_casa','TEMPO_CASA','numero','Situação','base',false,false,false,false,'admin',260,null),
  ('idade','IDADE','numero','Situação','base',false,false,false,false,'admin',270,null),
  ('dt_nasc','DT_NASC','data','Situação','base',false,false,false,true,'admin',280,'Dado pessoal sensível: restrito ao RH.'),
  ('dt_aposentadoria','DT_APOSENTADORIA','data','Situação','base',false,false,false,false,'admin',290,null),
  ('tipo_invalidez','TIPO_INVALIDEZ','texto','Situação','base',false,false,false,true,'admin',300,'Dado de saúde: restrito ao RH.'),
  ('horario','HORARIO','texto','Cargo','base',false,false,false,false,'admin',310,null),
  ('hrs_teor_mes','HRS_TEOR_MES','numero','Cargo','base',false,false,false,false,'admin',320,null),
  ('tsal_cod','TSAL_COD','texto','Remuneração','base',false,false,false,false,'admin',330,null),
  ('fxsl_cod','FXSL_COD','texto','Remuneração','base',false,false,false,false,'admin',340,null),
  ('salario','SALARIO','moeda','Remuneração','base',false,false,false,false,'admin',350,null),
  ('evento_grat','EVENTO_GRAT','moeda','Remuneração','base',false,false,false,false,'admin',360,null),
  ('perc_grat','PERC_GRAT','numero','Remuneração','base',false,false,false,false,'admin',370,null),
  ('salario_total','SALARIO_TOTAL','moeda','Remuneração','base',true,false,false,false,'admin',380,null),
  ('vlr_mediana','VLR_MEDIANA','moeda','Remuneração','base',false,false,false,false,'admin',390,null),
  ('prm','PRM','moeda','Remuneração','base',false,false,false,false,'admin',400,null),
  ('gestor_imediato','GESTOR IMEDIATO','texto','Hierarquia','base',true,true,false,false,'admin',410,'Nome do gestor imediato, como está na planilha. É por esta coluna que o portal separa a base e distribui.'),
  ('gerente','GERENTE','texto','Hierarquia','base',false,true,false,false,'admin',420,'Nível acima do gestor imediato. Permite o recorte do Gerente sem depender da Divisão.'),
  ('diretor','DIRETOR','texto','Hierarquia','base',false,true,false,false,'admin',430,'Nível acima do gerente. Permite o recorte do Diretor sem depender da Diretoria.'),
  ('avaliacao_performar','DATA E NOTA ÚLTIMA AVALIAÇÃO PERFORMAR REGISTRADA','texto','Desempenho','base',true,false,false,false,'admin',440,null),
  ('centro_custo_sap','CENTRO DE CUSTO_SAP','texto','Remuneração','base',false,false,false,false,'admin',450,null),
  ('estabilidade','ESTABILIDADE','texto','Estabilidade','base',true,false,false,false,'admin',460,'Qualquer condição de estabilidade ou afastamento informada pelo RH.'),
  ('data_fim_estabilidade','DATA FIM ESTABILIDADE','data','Estabilidade','base',true,false,false,false,'admin',470,null),
  ('salario_anual','SALÁRIO ANUAL','moeda','Remuneração','base',false,false,true,false,'admin',480,'Base do cálculo de custo e de redução anual no painel.'),
  ('acao','AÇÃO INDICADA','lista','Decisão','avaliacao',true,false,false,false,'gestor',490,null),
  ('destino','EM CASO DE TRANSFERÊNCIA, INDICAR PARA ONDE SETOR/ÁREA/Nº PROCESSO','texto','Decisão','avaliacao',false,false,false,false,'gestor',500,null),
  ('justificativa','JUSTIFICATIVA','texto','Decisão','avaliacao',true,false,false,false,'gestor',510,'Não existe na planilha — é exigência do portal, para a decisão ficar registrada com o motivo.')
)
INSERT INTO portal.campos (processo_id, chave, rotulo, tipo, grupo, origem, visivel_lista, agrupar, somar, sensivel, editavel_por, somente_leitura, ordem, ajuda)
SELECT p.id, c.chave, c.rotulo, c.tipo, c.grupo, c.origem, c.visivel_lista, c.agrupar, c.somar, c.sensivel, c.editavel_por, c.origem = 'base', c.ordem, c.ajuda
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
