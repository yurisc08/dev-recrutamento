-- Dados de exemplo para testar o sistema local ou em homologacao.
-- Uso: npm run db:seed:local
--
-- Cria: 2 salas, 2 leitores, 6 pessoas com cracha, 2 treinamentos, 1 turma com
-- aulas (ontem, hoje e amanha) e leituras de cracha na aula de ontem.
-- Depois de rodar, abra a turma no painel e clique em "Recalcular" para o
-- sistema processar as leituras de exemplo.

DELETE FROM attendance_overrides;
DELETE FROM attendance;
DELETE FROM scans;
DELETE FROM class_sessions;
DELETE FROM enrollments;
DELETE FROM classes;
DELETE FROM courses;
DELETE FROM badges;
DELETE FROM people;
DELETE FROM devices;
DELETE FROM rooms;

-- Salas ----------------------------------------------------------------------
INSERT INTO rooms (id, name, location, capacity, created_at) VALUES
  ('rom_treina1', 'Sala de Treinamento 1', 'Predio A - 2o andar', 30, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('rom_auditor', 'Auditorio', 'Predio B - terreo', 120, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

-- Leitores de cracha ---------------------------------------------------------
-- Chave de teste do leitor 1: dev_demo_chave_de_teste_123
INSERT INTO devices (id, name, serial, room_id, key_hash, key_prefix, direction, active, last_seen_at, created_at) VALUES
  ('dev_sala1', 'Leitor Sala 1', 'CID-0099123', 'rom_treina1',
   '4ac2f64f33fcc4c8e851681fd757647d851982788ffb359e9921c1e21e85f37b', 'dev_demo_ch', 'ambos', 1,
   strftime('%Y-%m-%dT%H:%M:%S.000Z','now'), strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('dev_audit', 'Leitor Auditorio', 'CID-0099124', 'rom_auditor',
   'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', 'dev_semkey', 'ambos', 1,
   NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

-- Pessoas e crachas ----------------------------------------------------------
INSERT INTO people (id, full_name, document, email, department, job_title, active, created_at) VALUES
  ('per_ana',   'Ana Paula Ribeiro',   '111.111.111-11', 'ana@empresa.com',   'Producao',    'Operadora',      1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('per_bruno', 'Bruno Cardoso',       '222.222.222-22', 'bruno@empresa.com', 'Producao',    'Operador',       1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('per_carla', 'Carla Menezes',       '333.333.333-33', 'carla@empresa.com', 'Manutencao',  'Tecnica',        1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('per_diego', 'Diego Fonseca',       '444.444.444-44', 'diego@empresa.com', 'Manutencao',  'Tecnico',        1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('per_elena', 'Elena Souza',         '555.555.555-55', 'elena@empresa.com', 'Qualidade',   'Analista',       1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('per_fabio', 'Fabio Nogueira',      '666.666.666-66', 'fabio@empresa.com', 'Logistica',   'Conferente',     1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

INSERT INTO badges (id, person_id, code, label, active, created_at) VALUES
  ('bdg_ana',   'per_ana',   '1001', 'cracha padrao', 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('bdg_bruno', 'per_bruno', '1002', 'cracha padrao', 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('bdg_carla', 'per_carla', '1003', 'cracha padrao', 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('bdg_diego', 'per_diego', '1004', 'cracha padrao', 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('bdg_elena', 'per_elena', '1005', 'cracha padrao', 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('bdg_fabio', 'per_fabio', '1006', 'cracha padrao', 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

-- Treinamentos ---------------------------------------------------------------
INSERT INTO courses (id, name, code, description, workload_minutes, min_attendance_percent, active, created_at) VALUES
  ('crs_nr35', 'NR-35 Trabalho em Altura', 'NR35', 'Treinamento obrigatorio para trabalho em altura.', 480, 75, 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('crs_int',  'Integracao de Novos Colaboradores', 'INT', 'Boas-vindas, politicas internas e seguranca.', 240, 100, 1, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

-- Turma ----------------------------------------------------------------------
INSERT INTO classes (id, course_id, code, name, instructor, room_id, min_attendance_percent, status, created_at) VALUES
  ('cls_nr35_01', 'crs_nr35', 'NR35-2026-01', 'Turma 1 - Producao e Manutencao', 'Marcos Vieira', 'rom_treina1', 75, 'em_andamento', strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

INSERT INTO enrollments (id, class_id, person_id, status, created_at) VALUES
  ('enr_1', 'cls_nr35_01', 'per_ana',   'ativa', strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('enr_2', 'cls_nr35_01', 'per_bruno', 'ativa', strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('enr_3', 'cls_nr35_01', 'per_carla', 'ativa', strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('enr_4', 'cls_nr35_01', 'per_diego', 'ativa', strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('enr_5', 'cls_nr35_01', 'per_elena', 'ativa', strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

-- Aulas: 08:00-12:00 no horario de Brasilia (11:00-15:00 UTC).
INSERT INTO class_sessions (id, class_id, title, starts_at, ends_at, room_id, tolerance_minutes, min_presence_percent, require_checkout, canceled, created_at) VALUES
  ('ses_d1', 'cls_nr35_01', 'Modulo 1 - Riscos e legislacao',
   strftime('%Y-%m-%dT11:00:00.000Z','now','-1 day'), strftime('%Y-%m-%dT15:00:00.000Z','now','-1 day'),
   'rom_treina1', 10, 75, 0, 0, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('ses_d2', 'cls_nr35_01', 'Modulo 2 - Equipamentos de protecao',
   strftime('%Y-%m-%dT11:00:00.000Z','now'), strftime('%Y-%m-%dT15:00:00.000Z','now'),
   'rom_treina1', 10, 75, 0, 0, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('ses_d3', 'cls_nr35_01', 'Modulo 3 - Pratica e avaliacao',
   strftime('%Y-%m-%dT11:00:00.000Z','now','+1 day'), strftime('%Y-%m-%dT15:00:00.000Z','now','+1 day'),
   'rom_treina1', 10, 75, 0, 0, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));

-- Leituras da aula de ontem --------------------------------------------------
-- Ana: entrada no horario e saida no fim         -> presente
-- Bruno: entrada com 35 min de atraso            -> presente com atraso
-- Carla: entrada no horario, saiu na metade      -> parcial
-- Diego: nao passou o cracha                     -> ausente
-- Elena: apenas uma leitura na entrada           -> presente (sem exigencia de saida)
-- Cracha 9999: numero desconhecido               -> fila de vinculo
INSERT INTO scans (id, device_id, badge_code, person_id, scanned_at, direction, session_id, source, external_id, raw, created_at) VALUES
  ('scn_1', 'dev_sala1', '1001', 'per_ana',   strftime('%Y-%m-%dT10:56:00.000Z','now','-1 day'), 'entrada', 'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_2', 'dev_sala1', '1001', 'per_ana',   strftime('%Y-%m-%dT15:02:00.000Z','now','-1 day'), 'saida',   'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_3', 'dev_sala1', '1002', 'per_bruno', strftime('%Y-%m-%dT11:35:00.000Z','now','-1 day'), 'entrada', 'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_4', 'dev_sala1', '1002', 'per_bruno', strftime('%Y-%m-%dT15:00:00.000Z','now','-1 day'), 'saida',   'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_5', 'dev_sala1', '1003', 'per_carla', strftime('%Y-%m-%dT10:58:00.000Z','now','-1 day'), 'entrada', 'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_6', 'dev_sala1', '1003', 'per_carla', strftime('%Y-%m-%dT13:00:00.000Z','now','-1 day'), 'saida',   'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_7', 'dev_sala1', '1005', 'per_elena', strftime('%Y-%m-%dT11:02:00.000Z','now','-1 day'), 'entrada', 'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now')),
  ('scn_8', 'dev_sala1', '9999', NULL,        strftime('%Y-%m-%dT11:10:00.000Z','now','-1 day'), 'entrada', 'ses_d1', 'dispositivo', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%S.000Z','now'));
