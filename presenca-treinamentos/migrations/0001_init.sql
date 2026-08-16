-- Controle de presenca em treinamentos via leitor de cracha em rede.
-- Todos os campos de data/hora sao ISO-8601 em UTC (ex.: 2026-08-16T13:00:00.000Z).

-- ---------------------------------------------------------------------------
-- Acesso ao painel
-- ---------------------------------------------------------------------------
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,          -- pbkdf2$<iter>$<salt_b64>$<hash_b64>
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'operador', 'leitura')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- Pessoas e crachas
-- ---------------------------------------------------------------------------
CREATE TABLE people (
  id         TEXT PRIMARY KEY,
  full_name  TEXT NOT NULL,
  document   TEXT,                      -- CPF / matricula interna
  email      TEXT,
  department TEXT,
  job_title  TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_people_name ON people (full_name);

-- Uma pessoa pode trocar de cracha; o historico fica registrado aqui.
CREATE TABLE badges (
  id         TEXT PRIMARY KEY,
  person_id  TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  code       TEXT NOT NULL,             -- numero lido pela maquininha
  label      TEXT,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_badges_code_active ON badges (code) WHERE active = 1;
CREATE INDEX idx_badges_person ON badges (person_id);

-- ---------------------------------------------------------------------------
-- Salas e leitores de cracha
-- ---------------------------------------------------------------------------
CREATE TABLE rooms (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  location   TEXT,
  capacity   INTEGER,
  created_at TEXT NOT NULL
);

CREATE TABLE devices (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  serial       TEXT,
  room_id      TEXT REFERENCES rooms (id) ON DELETE SET NULL,
  key_hash     TEXT NOT NULL,           -- SHA-256 hex da chave de ingestao
  key_prefix   TEXT NOT NULL,           -- primeiros caracteres, so para exibir
  direction    TEXT NOT NULL DEFAULT 'ambos' CHECK (direction IN ('entrada', 'saida', 'ambos')),
  active       INTEGER NOT NULL DEFAULT 1,
  last_seen_at TEXT,
  created_at   TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_devices_key_hash ON devices (key_hash);

-- ---------------------------------------------------------------------------
-- Treinamentos, turmas e aulas
-- ---------------------------------------------------------------------------
CREATE TABLE courses (
  id                    TEXT PRIMARY KEY,
  name                  TEXT NOT NULL,
  code                  TEXT,
  description           TEXT,
  workload_minutes      INTEGER,        -- carga horaria prevista
  min_attendance_percent REAL NOT NULL DEFAULT 75,
  active                INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL
);

CREATE TABLE classes (
  id                     TEXT PRIMARY KEY,
  course_id              TEXT NOT NULL REFERENCES courses (id) ON DELETE CASCADE,
  code                   TEXT NOT NULL,
  name                   TEXT,
  instructor             TEXT,
  room_id                TEXT REFERENCES rooms (id) ON DELETE SET NULL,
  min_attendance_percent REAL NOT NULL DEFAULT 75,
  status                 TEXT NOT NULL DEFAULT 'planejada'
                           CHECK (status IN ('planejada', 'em_andamento', 'concluida', 'cancelada')),
  created_at             TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_classes_code ON classes (code);
CREATE INDEX idx_classes_course ON classes (course_id);

CREATE TABLE enrollments (
  id         TEXT PRIMARY KEY,
  class_id   TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  person_id  TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'cancelada')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_enrollments_unique ON enrollments (class_id, person_id);
CREATE INDEX idx_enrollments_person ON enrollments (person_id);

-- Aulas / encontros da turma.
CREATE TABLE class_sessions (
  id                  TEXT PRIMARY KEY,
  class_id            TEXT NOT NULL REFERENCES classes (id) ON DELETE CASCADE,
  title               TEXT,
  starts_at           TEXT NOT NULL,
  ends_at             TEXT NOT NULL,
  room_id             TEXT REFERENCES rooms (id) ON DELETE SET NULL,
  tolerance_minutes   INTEGER NOT NULL DEFAULT 10,   -- atraso tolerado
  min_presence_percent REAL NOT NULL DEFAULT 75,     -- % do tempo da aula para contar presenca
  require_checkout    INTEGER NOT NULL DEFAULT 0,    -- exige leitura de saida
  canceled            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL
);
CREATE INDEX idx_sessions_class ON class_sessions (class_id);
CREATE INDEX idx_sessions_window ON class_sessions (starts_at, ends_at);

-- ---------------------------------------------------------------------------
-- Leituras de cracha (dados brutos vindos da maquininha)
-- ---------------------------------------------------------------------------
CREATE TABLE scans (
  id           TEXT PRIMARY KEY,
  device_id    TEXT REFERENCES devices (id) ON DELETE SET NULL,
  badge_code   TEXT NOT NULL,
  person_id    TEXT REFERENCES people (id) ON DELETE SET NULL,  -- nulo = cracha desconhecido
  scanned_at   TEXT NOT NULL,
  direction    TEXT NOT NULL DEFAULT 'desconhecida'
                 CHECK (direction IN ('entrada', 'saida', 'desconhecida')),
  session_id   TEXT REFERENCES class_sessions (id) ON DELETE SET NULL,
  source       TEXT NOT NULL DEFAULT 'dispositivo'
                 CHECK (source IN ('dispositivo', 'manual', 'importacao')),
  external_id  TEXT,                    -- id do registro no proprio leitor
  raw          TEXT,                    -- payload original, para auditoria
  created_at   TEXT NOT NULL
);
-- Evita gravar duas vezes o mesmo evento quando o leitor reenvia o lote.
CREATE UNIQUE INDEX idx_scans_dedupe ON scans (device_id, badge_code, scanned_at);
CREATE INDEX idx_scans_time ON scans (scanned_at);
CREATE INDEX idx_scans_person_time ON scans (person_id, scanned_at);
CREATE INDEX idx_scans_session ON scans (session_id);

-- ---------------------------------------------------------------------------
-- Presenca calculada (uma linha por aluno x aula)
-- ---------------------------------------------------------------------------
CREATE TABLE attendance (
  id              TEXT PRIMARY KEY,
  session_id      TEXT NOT NULL REFERENCES class_sessions (id) ON DELETE CASCADE,
  person_id       TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  status          TEXT NOT NULL CHECK (status IN ('presente', 'parcial', 'ausente', 'justificada')),
  first_seen_at   TEXT,
  last_seen_at    TEXT,
  minutes_present INTEGER NOT NULL DEFAULT 0,
  percent         REAL NOT NULL DEFAULT 0,
  late            INTEGER NOT NULL DEFAULT 0,
  left_early      INTEGER NOT NULL DEFAULT 0,
  missing_checkout INTEGER NOT NULL DEFAULT 0,
  scan_count      INTEGER NOT NULL DEFAULT 0,
  source          TEXT NOT NULL DEFAULT 'automatica'
                    CHECK (source IN ('automatica', 'manual')),
  note            TEXT,
  computed_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_attendance_unique ON attendance (session_id, person_id);
CREATE INDEX idx_attendance_person ON attendance (person_id);

-- Ajuste manual do instrutor (abono, atestado, presenca sem cracha...).
-- Sempre vence sobre o calculo automatico.
CREATE TABLE attendance_overrides (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES class_sessions (id) ON DELETE CASCADE,
  person_id     TEXT NOT NULL REFERENCES people (id) ON DELETE CASCADE,
  status        TEXT NOT NULL CHECK (status IN ('presente', 'parcial', 'ausente', 'justificada')),
  justification TEXT,
  created_by    TEXT REFERENCES users (id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_overrides_unique ON attendance_overrides (session_id, person_id);

-- ---------------------------------------------------------------------------
-- Configuracoes gerais
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('timezone', 'America/Sao_Paulo', '2026-01-01T00:00:00.000Z'),
  ('match_window_before_min', '60', '2026-01-01T00:00:00.000Z'),
  ('match_window_after_min', '60', '2026-01-01T00:00:00.000Z');
