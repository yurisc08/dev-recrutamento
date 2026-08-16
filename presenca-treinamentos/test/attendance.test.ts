import { describe, expect, it } from 'vitest';
import { computeAttendance, pickSessionForScan, summarizeClassAttendance } from '../src/attendance';

// Aula das 08:00 as 12:00 (horario de Brasilia = 11:00 as 15:00 UTC).
const aula = {
  starts_at: '2026-08-17T11:00:00.000Z',
  ends_at: '2026-08-17T15:00:00.000Z',
  tolerance_minutes: 10,
  min_presence_percent: 75,
  require_checkout: 0,
};

describe('computeAttendance', () => {
  it('marca ausente quem nao passou o cracha', () => {
    const result = computeAttendance(aula, []);
    expect(result.status).toBe('ausente');
    expect(result.minutes_present).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('conta presenca integral com entrada e saida nos horarios', () => {
    const result = computeAttendance(aula, ['2026-08-17T10:56:00.000Z', '2026-08-17T15:02:00.000Z']);
    expect(result.status).toBe('presente');
    expect(result.percent).toBe(100);
    expect(result.minutes_present).toBe(240);
    expect(result.late).toBe(false);
  });

  it('nao credita tempo fora do intervalo da aula', () => {
    // Chegou 1h antes e saiu 1h depois: continua 240 minutos, nao 360.
    const result = computeAttendance(aula, ['2026-08-17T10:00:00.000Z', '2026-08-17T16:00:00.000Z']);
    expect(result.minutes_present).toBe(240);
    expect(result.percent).toBe(100);
  });

  it('sinaliza atraso acima da tolerancia', () => {
    const result = computeAttendance(aula, ['2026-08-17T11:35:00.000Z', '2026-08-17T15:00:00.000Z']);
    expect(result.late).toBe(true);
    expect(result.minutes_present).toBe(205);
    expect(result.status).toBe('presente'); // 85% >= 75%
  });

  it('marca parcial quem saiu antes de atingir o minimo', () => {
    const result = computeAttendance(aula, ['2026-08-17T11:00:00.000Z', '2026-08-17T13:00:00.000Z']);
    expect(result.status).toBe('parcial');
    expect(result.percent).toBe(50);
    expect(result.left_early).toBe(true);
  });

  it('com uma unica leitura assume permanencia ate o fim da aula', () => {
    const result = computeAttendance(aula, ['2026-08-17T11:02:00.000Z']);
    expect(result.status).toBe('presente');
    expect(result.minutes_present).toBe(238); // entrou 2 min depois e ficou ate 15:00
    expect(result.missing_checkout).toBe(false);
  });

  it('quando a saida e obrigatoria, uma leitura so nao gera tempo', () => {
    const result = computeAttendance({ ...aula, require_checkout: 1 }, ['2026-08-17T11:02:00.000Z']);
    expect(result.missing_checkout).toBe(true);
    expect(result.minutes_present).toBe(0);
    expect(result.status).toBe('parcial');
  });

  it('usa a primeira e a ultima leitura quando ha varias', () => {
    const result = computeAttendance(aula, [
      '2026-08-17T11:00:00.000Z',
      '2026-08-17T12:30:00.000Z', // intervalo do cafe
      '2026-08-17T12:45:00.000Z',
      '2026-08-17T15:00:00.000Z',
    ]);
    expect(result.scan_count).toBe(4);
    expect(result.minutes_present).toBe(240);
  });

  it('ignora a ordem em que as leituras chegam', () => {
    const result = computeAttendance(aula, ['2026-08-17T15:00:00.000Z', '2026-08-17T11:00:00.000Z']);
    expect(result.first_seen_at).toBe('2026-08-17T11:00:00.000Z');
    expect(result.last_seen_at).toBe('2026-08-17T15:00:00.000Z');
  });
});

describe('summarizeClassAttendance', () => {
  const sessionMinutes = { a1: 240, a2: 240, a3: 240 };

  it('aprova quem cumpriu a frequencia minima', () => {
    const summary = summarizeClassAttendance({
      sessionMinutes,
      minAttendancePercent: 75,
      records: [
        { session_id: 'a1', minutes_present: 240, status: 'presente' },
        { session_id: 'a2', minutes_present: 240, status: 'presente' },
        { session_id: 'a3', minutes_present: 120, status: 'parcial' },
      ],
    });
    expect(summary.percent).toBe(83.33);
    expect(summary.approved).toBe(true);
    expect(summary.sessions_present).toBe(2);
    expect(summary.sessions_partial).toBe(1);
  });

  it('reprova quem faltou demais', () => {
    const summary = summarizeClassAttendance({
      sessionMinutes,
      minAttendancePercent: 75,
      records: [
        { session_id: 'a1', minutes_present: 240, status: 'presente' },
        { session_id: 'a2', minutes_present: 0, status: 'ausente' },
        { session_id: 'a3', minutes_present: 0, status: 'ausente' },
      ],
    });
    expect(summary.percent).toBe(33.33);
    expect(summary.approved).toBe(false);
    expect(summary.sessions_absent).toBe(2);
  });

  it('falta abonada conta como tempo cumprido', () => {
    const summary = summarizeClassAttendance({
      sessionMinutes,
      minAttendancePercent: 75,
      records: [
        { session_id: 'a1', minutes_present: 240, status: 'presente' },
        { session_id: 'a2', minutes_present: 0, status: 'justificada' },
        { session_id: 'a3', minutes_present: 240, status: 'presente' },
      ],
    });
    expect(summary.percent).toBe(100);
    expect(summary.approved).toBe(true);
    expect(summary.sessions_justified).toBe(1);
  });
});

describe('pickSessionForScan', () => {
  const manha = { id: 'manha', starts_at: '2026-08-17T11:00:00.000Z', ends_at: '2026-08-17T15:00:00.000Z', room_id: 'sala1' };
  const tarde = { id: 'tarde', starts_at: '2026-08-17T17:00:00.000Z', ends_at: '2026-08-17T21:00:00.000Z', room_id: 'sala2' };

  it('escolhe a aula em andamento no momento da leitura', () => {
    expect(pickSessionForScan('2026-08-17T12:00:00.000Z', [manha, tarde], null)?.id).toBe('manha');
    expect(pickSessionForScan('2026-08-17T18:00:00.000Z', [manha, tarde], null)?.id).toBe('tarde');
  });

  it('desempata pela sala do leitor quando nenhuma aula esta em andamento', () => {
    // 16:00 fica a 1h do fim da manha e a 1h do inicio da tarde.
    const escolhida = pickSessionForScan('2026-08-17T16:00:00.000Z', [manha, tarde], 'sala2');
    expect(escolhida?.id).toBe('tarde');
  });

  it('devolve nulo quando nao ha candidatos', () => {
    expect(pickSessionForScan('2026-08-17T12:00:00.000Z', [], 'sala1')).toBeNull();
  });
});
