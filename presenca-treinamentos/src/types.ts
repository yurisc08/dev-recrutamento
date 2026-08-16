export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET: string;
  APP_TIMEZONE?: string;
  MATCH_WINDOW_BEFORE_MIN?: string;
  MATCH_WINDOW_AFTER_MIN?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'operador' | 'leitura';
}

export type Variables = {
  user: AuthUser;
};

export interface DeviceRow {
  id: string;
  name: string;
  serial: string | null;
  room_id: string | null;
  direction: 'entrada' | 'saida' | 'ambos';
  active: number;
}

export interface ClassSessionRow {
  id: string;
  class_id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  room_id: string | null;
  tolerance_minutes: number;
  min_presence_percent: number;
  require_checkout: number;
  canceled: number;
}

export interface ScanRow {
  id: string;
  device_id: string | null;
  badge_code: string;
  person_id: string | null;
  scanned_at: string;
  direction: 'entrada' | 'saida' | 'desconhecida';
  session_id: string | null;
  source: 'dispositivo' | 'manual' | 'importacao';
}

export type AttendanceStatus = 'presente' | 'parcial' | 'ausente' | 'justificada';
