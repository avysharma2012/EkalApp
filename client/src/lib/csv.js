// RFC4180-ish CSV parsing: handles quoted fields containing commas, quotes
// (doubled), and newlines.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  const normalized = text.replace(/\r\n/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (inQuotes) {
      if (char === '"') {
        if (normalized[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((cell) => cell.trim() !== ''))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()])));
}

function escapeCsvField(value) {
  const str = value == null ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// `columns` is an array of { key, label } (label defaults to key).
export function toCsv(rows, columns) {
  const header = columns.map((c) => escapeCsvField(c.label || c.key)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvField(row[c.key])).join(',')).join('\n');
  return header + '\n' + body;
}

export function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// GLOBAL-03: `{entity}-{YYYY-MM-DD}.csv`, UTF-8, comma-delimited.
export function exportEntityToCsv(entityName, rows, columns) {
  const date = new Date().toISOString().slice(0, 10);
  downloadCsv(`${entityName}-${date}.csv`, toCsv(rows, columns));
}
