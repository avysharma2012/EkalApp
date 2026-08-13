import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchChapters, createUser, resolveChapterByName } from '../lib/api';
import { parseCsv, toCsv, downloadCsv } from '../lib/csv';
import { checkPasswordPolicy } from '../lib/passwordPolicy';

const MAX_ROWS = 100;
const TEMPLATE = `# Ekal Volunteering bulk user import template
# - full_name, email, and password are required
# - password must be 8+ characters with upper, lower, digit, and special character
# - chapter is optional (defaults to Unassigned); parent_chapter only needed if
#   two chapters share the same name and you need to say which one you mean
# - remove these comment lines before uploading; max 100 rows per file
full_name,email,password,chapter,parent_chapter
Jane Doe,jane@example.com,Ch4ngeMe!,Boston,North East
`;

function validateRow(row, chapters, forcedChapterId) {
  const errors = [];
  if (!row.full_name) errors.push('Missing full_name');
  if (!row.email) errors.push('Missing email');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) errors.push('Invalid email format');
  if (!row.password) errors.push('Missing password');
  else if (!checkPasswordPolicy(row.password).valid) errors.push('Password does not meet the policy');

  let chapterId = forcedChapterId;
  if (forcedChapterId === undefined) {
    const { chapterId: resolved, error } = resolveChapterByName(chapters, row.chapter, row.parent_chapter);
    if (error) errors.push(error);
    chapterId = resolved;
  }

  return { errors, chapterId };
}

export function AdminBulkImportPage() {
  const { isSuperAdmin, adminChapterId } = useAuth();
  const [chapters, setChapters] = useState([]);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [parseError, setParseError] = useState('');
  const [results, setResults] = useState([]); // { row, status: 'pending'|'created'|'skipped'|'error', reason }
  const [running, setRunning] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchChapters().then(setChapters);
  }, []);

  function handleDownloadTemplate() {
    downloadCsv('ekal-bulk-import-template.csv', TEMPLATE);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults([]);
    setParseError('');
    const text = await file.text();
    const cleanText = text.split('\n').filter((line) => !line.trim().startsWith('#')).join('\n');
    const parsed = parseCsv(cleanText);
    if (parsed.length === 0) {
      setParseError('No rows found in that file.');
      setRows([]);
      return;
    }
    if (parsed.length > MAX_ROWS) {
      setParseError(`This file has ${parsed.length} rows — the limit is ${MAX_ROWS} per upload.`);
      setRows([]);
      return;
    }
    setRows(parsed);
  }

  async function handleRun() {
    setRunning(true);
    const forcedChapterId = isSuperAdmin ? undefined : adminChapterId;
    const liveResults = rows.map((row) => ({ row, status: 'pending', reason: '' }));
    setResults([...liveResults]);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { errors, chapterId } = validateRow(row, chapters, forcedChapterId);
      if (errors.length > 0) {
        liveResults[i] = { row, status: 'error', reason: errors.join('; ') };
        setResults([...liveResults]);
        continue;
      }
      try {
        await createUser({ name: row.full_name, email: row.email, password: row.password, chapterId });
        liveResults[i] = { row, status: 'created', reason: '' };
      } catch (err) {
        const message = err.message || 'Unknown error';
        liveResults[i] = {
          row,
          status: message.toLowerCase().includes('already') || message.toLowerCase().includes('registered') ? 'skipped' : 'error',
          reason: message,
        };
      }
      setResults([...liveResults]);
      // NFR-02: small delay between rows to respect downstream rate limits.
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setRunning(false);
  }

  function handleDownloadErrorReport() {
    const failed = results.filter((r) => r.status === 'error' || r.status === 'skipped');
    const csvRows = failed.map((r) => ({ ...r.row, error: r.reason }));
    downloadCsv(
      `ekal-bulk-import-errors-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(csvRows, [
        { key: 'full_name', label: 'full_name' },
        { key: 'email', label: 'email' },
        { key: 'password', label: 'password' },
        { key: 'chapter', label: 'chapter' },
        { key: 'parent_chapter', label: 'parent_chapter' },
        { key: 'error', label: 'error' },
      ])
    );
  }

  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }),
    { pending: 0, created: 0, skipped: 0, error: 0 }
  );
  const failedCount = summary.error + summary.skipped;
  const finished = results.length > 0 && summary.pending === 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Bulk Import Volunteers</h1>
          <p>Upload up to {MAX_ROWS} volunteers at once from a CSV file.</p>
        </div>
      </div>

      {!isSuperAdmin && (
        <div className="success-banner">
          You're a chapter admin, so every row will be added to your chapter regardless of any chapter column in the file.
        </div>
      )}

      <div className="card">
        <h2>1. Get the template</h2>
        <p style={{ marginBottom: 12, color: 'var(--muted)' }}>Columns: full_name, email, password, chapter (optional), parent_chapter (optional, for disambiguation).</p>
        <button className="btn btn-secondary" onClick={handleDownloadTemplate}>Download template CSV</button>
      </div>

      <div className="card">
        <h2>2. Upload your file</h2>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} />
        {parseError && <div className="error-banner" style={{ marginTop: 12 }}>{parseError}</div>}
        {rows.length > 0 && !parseError && (
          <>
            <p style={{ marginTop: 12 }}>{fileName}: {rows.length} row{rows.length === 1 ? '' : 's'} ready to import.</p>
            <button className="btn btn-primary" onClick={handleRun} disabled={running || results.length > 0}>
              {running ? 'Importing…' : 'Start import'}
            </button>
          </>
        )}
      </div>

      {results.length > 0 && (
        <div className="card">
          <h2>3. Results {running && `(${results.filter((r) => r.status !== 'pending').length}/${results.length})`}</h2>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <div className="stat-card"><div className="stat-value">{summary.created}</div><div className="stat-label">Created</div></div>
            <div className="stat-card"><div className="stat-value">{summary.skipped}</div><div className="stat-label">Skipped</div></div>
            <div className="stat-card"><div className="stat-value">{summary.error}</div><div className="stat-label">Errors</div></div>
            <div className="stat-card"><div className="stat-value">{summary.pending}</div><div className="stat-label">Remaining</div></div>
          </div>
          {finished && failedCount > 0 && (
            <button className="btn btn-secondary" onClick={handleDownloadErrorReport} style={{ marginBottom: 16 }}>
              Download error report ({failedCount} row{failedCount === 1 ? '' : 's'})
            </button>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Row</th><th>Name</th><th>Email</th><th>Status</th><th>Reason</th></tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>{r.row.full_name}</td>
                    <td>{r.row.email}</td>
                    <td>
                      {r.status === 'pending' && <span className="badge badge-pending">Pending</span>}
                      {r.status === 'created' && <span className="badge badge-approved">Created</span>}
                      {r.status === 'skipped' && <span className="badge badge-pending">Skipped</span>}
                      {r.status === 'error' && <span className="badge badge-rejected">Error</span>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{r.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
