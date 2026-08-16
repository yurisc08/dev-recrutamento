import { describe, expect, it } from 'vitest';
import { normalizeBadge, normalizeEvents } from '../src/services/ingest';
import { parseTimestamp } from '../src/lib/time';

const TZ = 'America/Sao_Paulo';

describe('parseTimestamp', () => {
  it('aceita ISO com fuso explicito', () => {
    expect(parseTimestamp('2026-08-17T08:00:00-03:00', TZ)).toBe('2026-08-17T11:00:00.000Z');
  });

  it('interpreta data sem fuso no horario local do leitor', () => {
    expect(parseTimestamp('2026-08-17 08:00:00', TZ)).toBe('2026-08-17T11:00:00.000Z');
  });

  it('aceita epoch em segundos e em milissegundos', () => {
    expect(parseTimestamp(1755428400, TZ)).toBe('2025-08-17T11:00:00.000Z');
    expect(parseTimestamp(1755428400000, TZ)).toBe('2025-08-17T11:00:00.000Z');
  });

  it('rejeita valor invalido', () => {
    expect(parseTimestamp('ontem de manha', TZ)).toBeNull();
    expect(parseTimestamp('', TZ)).toBeNull();
  });
});

describe('normalizeBadge', () => {
  it('remove zeros a esquerda de codigos numericos', () => {
    expect(normalizeBadge('0001234')).toBe('1234');
    expect(normalizeBadge(' 1234 ')).toBe('1234');
  });

  it('mantem codigos alfanumericos em maiusculas', () => {
    expect(normalizeBadge('ab12cd')).toBe('AB12CD');
  });
});

describe('normalizeEvents', () => {
  it('le um evento simples', () => {
    const { events } = normalizeEvents(
      { badge: '0001234', timestamp: '2026-08-17T08:00:00-03:00', direction: 'entrada' },
      TZ,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      badge: '1234',
      scannedAt: '2026-08-17T11:00:00.000Z',
      direction: 'entrada',
    });
  });

  it('aceita os nomes de campo usados por outros leitores', () => {
    const { events } = normalizeEvents(
      [{ cardNumber: '1002', data_hora: '2026-08-17 08:30:00', tipo: 'out', log_id: '77' }],
      TZ,
    );
    expect(events[0]).toMatchObject({
      badge: '1002',
      scannedAt: '2026-08-17T11:30:00.000Z',
      direction: 'saida',
      externalId: '77',
    });
  });

  it('processa lote em {"events": [...]}', () => {
    const { events } = normalizeEvents(
      { events: [{ badge: '1', time: 1755428400 }, { badge: '2', time: 1755428460 }] },
      TZ,
    );
    expect(events.map((event) => event.badge)).toEqual(['1', '2']);
  });

  it('processa lote no formato {"values": [...]}', () => {
    const { events } = normalizeEvents({ object: 'access_logs', values: [{ card: '55', time: 1755428400 }] }, TZ);
    expect(events).toHaveLength(1);
    expect(events[0].badge).toBe('55');
  });

  it('separa eventos invalidos sem derrubar o lote', () => {
    const { events, invalid } = normalizeEvents(
      { events: [{ badge: '1', time: 1755428400 }, { time: 1755428400 }, { badge: '3', time: 'quinta' }] },
      TZ,
    );
    expect(events).toHaveLength(1);
    expect(invalid.map((item) => item.reason)).toEqual(['cracha_ausente', 'data_invalida']);
  });

  it('usa o horario do servidor quando o leitor nao manda a hora', () => {
    const { events } = normalizeEvents({ badge: '1234' }, TZ);
    expect(events).toHaveLength(1);
    expect(Date.parse(events[0].scannedAt)).toBeGreaterThan(Date.now() - 5000);
  });
});
