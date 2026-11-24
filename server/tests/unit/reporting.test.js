/**
 * UNIT tests for the reporting helpers: time-zone dates (utils/dates.js), safe CSV
 * (utils/csv.js) and the report period rules (resolvePeriod in admin.service.js).
 * Pure functions: no database, no HTTP, so they run in milliseconds.
 */
import {
  DAY_MS,
  isValidTimeZone,
  tzOffsetMs,
  startOfDayInZone,
  endOfDayInZone,
  dayInZone,
} from '../../src/utils/dates.js';
import { CSV_BOM, csvCell, csvRow } from '../../src/utils/csv.js';
import { resolvePeriod } from '../../src/modules/admin/admin.service.js';

describe('utils/dates', () => {
  it('isValidTimeZone accepts IANA names and rejects anything else', () => {
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Asia/Karachi')).toBe(true);
    expect(isValidTimeZone('Mars/Base')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(isValidTimeZone(['UTC'])).toBe(false);
  });

  it('tzOffsetMs: Pakistan is always +5 h, New York changes with daylight saving', () => {
    const jan = new Date('2026-01-15T12:00:00Z');
    const jul = new Date('2026-07-15T12:00:00Z');
    expect(tzOffsetMs(jan, 'UTC')).toBe(0);
    expect(tzOffsetMs(jan, 'Asia/Karachi')).toBe(5 * 3600e3);
    expect(tzOffsetMs(jul, 'Asia/Karachi')).toBe(5 * 3600e3);
    expect(tzOffsetMs(jan, 'America/New_York')).toBe(-5 * 3600e3); // EST
    expect(tzOffsetMs(jul, 'America/New_York')).toBe(-4 * 3600e3); // EDT
  });

  it('startOfDayInZone / endOfDayInZone give the exact UTC instants of a local day', () => {
    expect(startOfDayInZone('2026-01-05', 'UTC').toISOString()).toBe('2026-01-05T00:00:00.000Z');
    expect(endOfDayInZone('2026-01-05', 'UTC').toISOString()).toBe('2026-01-05T23:59:59.999Z');
    // Midnight in Lahore is 19:00 UTC the evening before
    expect(startOfDayInZone('2026-01-05', 'Asia/Karachi').toISOString()).toBe(
      '2026-01-04T19:00:00.000Z',
    );
    // Month and year roll-over
    expect(endOfDayInZone('2026-12-31', 'UTC').toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('handles a daylight-saving day (23 hours long in New York)', () => {
    // On 8 March 2026 clocks jump from 02:00 to 03:00 in New York
    const start = startOfDayInZone('2026-03-08', 'America/New_York');
    const end = endOfDayInZone('2026-03-08', 'America/New_York');
    expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z'); // midnight EST
    expect(end.toISOString()).toBe('2026-03-09T03:59:59.999Z'); // midnight EDT − 1 ms
    expect(end - start + 1).toBe(23 * 3600e3);
  });

  it('dayInZone names the calendar day people see in that zone', () => {
    const lateEvening = new Date('2026-01-05T20:30:00Z');
    expect(dayInZone(lateEvening, 'UTC')).toBe('2026-01-05');
    expect(dayInZone(lateEvening, 'Asia/Karachi')).toBe('2026-01-06');
  });
});

describe('utils/csv', () => {
  it('writes plain values as they are', () => {
    expect(csvCell('Ali Khan')).toBe('Ali Khan');
    expect(csvCell(2250)).toBe('2250');
    expect(csvCell(-5)).toBe('-5'); // a real negative NUMBER is data, not a formula
    expect(csvCell(true)).toBe('true');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(new Date('2026-01-05T10:00:00Z'))).toBe('2026-01-05T10:00:00.000Z');
  });

  it('quotes commas, quotes and line breaks (RFC 4180)', () => {
    expect(csvCell('Khan, Ali')).toBe('"Khan, Ali"');
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(csvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('defuses spreadsheet formulas (CSV injection)', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+92300')).toBe("'+92300");
    expect(csvCell('-2')).toBe("'-2"); // TEXT starting with "-" could be a formula
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('=HYPERLINK("x"),y')).toBe('"\'=HYPERLINK(""x""),y"');
  });

  it('csvRow joins cells with commas and ends with CRLF; BOM is the UTF-8 mark', () => {
    expect(csvRow(['a', 1, null, 'b,c'])).toBe('a,1,,"b,c"\r\n');
    expect(CSV_BOM).toBe('﻿');
  });
});

describe('resolvePeriod (report date rules)', () => {
  const now = new Date('2026-06-15T12:00:00Z');

  it('defaults to the last 30 days ending now', () => {
    const { start, end, tz } = resolvePeriod({}, now);
    expect(tz).toBe('UTC');
    expect(end).toEqual(now);
    expect(end - start).toBe(30 * DAY_MS);
  });

  it('turns calendar days into whole days in the zone', () => {
    const { start, end } = resolvePeriod(
      { from: '2026-01-01', to: '2026-01-31', tz: 'Asia/Karachi' },
      now,
    );
    expect(start.toISOString()).toBe('2025-12-31T19:00:00.000Z');
    expect(end.toISOString()).toBe('2026-01-31T18:59:59.999Z');
  });

  it('accepts exactly one day and a full leap year', () => {
    expect(() => resolvePeriod({ from: '2026-01-05', to: '2026-01-05' }, now)).not.toThrow();
    expect(() => resolvePeriod({ from: '2024-01-01', to: '2024-12-31' }, now)).not.toThrow();
  });

  it('rejects reversed dates and periods longer than 366 days (400)', () => {
    expect(() => resolvePeriod({ from: '2026-02-01', to: '2026-01-01' }, now)).toThrow(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(() => resolvePeriod({ from: '2025-01-01', to: '2026-01-03' }, now)).toThrow(
      'Range can be at most one year',
    );
  });
});
