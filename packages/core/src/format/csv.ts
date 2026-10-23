/** One CSV cell: always quoted, with spreadsheet formula injection neutralized. */
export const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Rows (first row = header) as CSV text with CRLF line endings. */
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
