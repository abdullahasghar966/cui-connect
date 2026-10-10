/** Minimal RFC-4180 CSV parser (quoted fields, escaped quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/**
 * Splits a CSV into a header-aware reader. Throws a readable message when required columns
 * are missing, so imports fail before anything is written.
 */
export function readCsv(text: string, required: readonly string[]) {
  const rows = parseCsv(text);
  const header = rows.shift()?.map((h) => h.trim()) ?? [];
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length) {
    throw new Error(`The first row must be a header with at least: ${required.join(',')}`);
  }
  const col = (row: string[], name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (row[index] ?? '').trim() : '';
  };
  return { rows, col };
}
