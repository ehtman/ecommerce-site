/**
 * src/utils/dates.js – small date helpers for reports that must respect TIME ZONES.
 *
 * WHY THIS FILE EXISTS: MongoDB stores every date in UTC (one world-wide clock). But "sales
 * on 5 January" depends on WHERE you stand: an order placed at 02:00 on 5 January in Lahore
 * (UTC+5) is stored as 21:00 UTC on 4 January. A report must turn a calendar day such as
 * "2026-01-05" into the exact UTC instants where that day starts and ends in the chosen zone.
 *
 * We use only the built-in Intl API (no date library): it knows every IANA time zone
 * ("Asia/Karachi", "Europe/London"…) including daylight-saving rules.
 * Used by: modules/admin/admin.service.js and admin.validation.js.
 * Concept: docs/concepts/24-reporting-aggregation-and-csv.md
 */

export const DAY_MS = 24 * 60 * 60 * 1000; // milliseconds in one day

/** true if `tz` is a time zone name the JavaScript runtime knows, e.g. "Asia/Karachi". */
export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || tz.length === 0) return false; // "" or a non-string: no
  // Intl throws a RangeError for unknown zones, so "try it and see" is the simplest check
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * How far `tz` is ahead of UTC at instant `date`, in milliseconds.
 * Example: Asia/Karachi → +5 h = 18 000 000. It can change during the year (daylight
 * saving), which is why we always ask "at which instant?".
 */
export function tzOffsetMs(date, tz) {
  // Ask Intl for the wall-clock parts (year, month, …) that people in `tz` see at `date`
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23', // 0–23 hours, never "24:00"
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  // Read that wall clock AS IF it were UTC; its distance to the real instant is the offset
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1, // JavaScript months are 0-based (0 = January)
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  const whole = Math.floor(date.getTime() / 1000) * 1000; // drop milliseconds (Intl has none)
  return asUtc - whole;
}

/**
 * The UTC instant where calendar day `day` ("YYYY-MM-DD") STARTS in time zone `tz`.
 *   startOfDayInZone('2026-01-05', 'Asia/Karachi') → 2026-01-04T19:00:00.000Z
 */
export function startOfDayInZone(day, tz) {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d); // midnight in UTC
  // Shift by the zone's offset. Then ask again at the shifted instant, in case a
  // daylight-saving switch happens between the two moments.
  const first = guess - tzOffsetMs(new Date(guess), tz);
  return new Date(guess - tzOffsetMs(new Date(first), tz));
}

/** The last millisecond of calendar day `day` in `tz` (= the next day's start − 1 ms). */
export function endOfDayInZone(day, tz) {
  const [y, m, d] = day.split('-').map(Number);
  // Date.UTC rolls over months and years for us: 2026-01-31 + 1 day = 2026-02-01
  const nextDay = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return new Date(startOfDayInZone(nextDay, tz).getTime() - 1);
}

/** The calendar day ("YYYY-MM-DD") that people in `tz` see at instant `date`. */
export function dayInZone(date, tz) {
  // The 'en-CA' locale happens to format dates as YYYY-MM-DD, exactly the ISO shape we want
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}
