/**
 * src/utils/csv.js – turn values into safe CSV text (the format Excel and Google Sheets open).
 *
 * CSV = "comma-separated values": one line per row, commas between cells. Simple, but three
 * traps catch beginners (RFC 4180 is the standard that solves the first two):
 *   1) a cell containing a comma, a quote or a line break must be wrapped in "quotes",
 *      and quotes inside it are doubled:   He said "hi"   →   "He said ""hi"""
 *   2) lines end with \r\n (CRLF), which every spreadsheet program understands
 *   3) CSV / FORMULA INJECTION: a cell starting with = + - @ is run as a FORMULA by Excel.
 *      A customer who registers as  =HYPERLINK("http://evil")  could attack the admin who
 *      opens the export. We put a ' in front of such text, so it is shown, never executed
 *      (OWASP's advice).
 *
 * Used by: modules/admin (sales report and orders CSV exports).
 * Concept: docs/concepts/24-reporting-aggregation-and-csv.md
 */

// Excel only detects UTF-8 (needed for names with accents, Urdu text…) when the file starts
// with this invisible "byte order mark".
export const CSV_BOM = '﻿';

// Text starting with one of these makes a spreadsheet treat the cell as a formula
const FORMULA_START = /^[=+\-@\t\r]/;
// Text containing one of these must be wrapped in quotes
const NEEDS_QUOTES = /[",\r\n]/;

/** One value → one safe CSV cell. */
export function csvCell(value) {
  if (value === null || value === undefined) return ''; // nothing → empty cell
  if (value instanceof Date) return value.toISOString(); // dates in one unambiguous format
  // Real numbers/booleans are written as-is (a negative NUMBER is data, not a formula)
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`; // defuse formula injection
  // Quote only when needed (keeps files readable); double every inner quote
  return NEEDS_QUOTES.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** An array of values → one CSV line, ending with CRLF. */
export const csvRow = (values) => `${values.map(csvCell).join(',')}\r\n`;
