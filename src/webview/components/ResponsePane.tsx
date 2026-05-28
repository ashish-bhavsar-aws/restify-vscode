import React, { useState, useRef, useEffect } from 'react';
import { ResponseState, getStatusClass } from '../types';
import { Icon } from './FaIcon';
import { PdfViewer } from './PdfViewer';
import {
  faPaperPlane, faCopy, faTerminal, faMagnifyingGlass,
  faClipboardList, faXmark, faChevronRight,
  faArrowUp, faList, faLink, faFileCode, faDownload, faCode,
} from '@fortawesome/free-solid-svg-icons';
import { PrettyBodyViewer } from './PrettyBodyViewer';

const LARGE_RESPONSE_THRESHOLD = 500 * 1024; // 500 KB
const FILE_PREVIEW_RENDER_THRESHOLD = 5 * 1024 * 1024; // 5 MB

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHeaderValue(headers: Record<string, string | string[]> | undefined, name: string): string {
  if (!headers) return '';
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  if (!hit) return '';
  return Array.isArray(hit) ? (hit[0] || '') : hit;
}

function flattenHeaders(headers: Record<string, string | string[]> | undefined): Array<{ key: string; value: string }> {
  if (!headers) return [];
  const rows: Array<{ key: string; value: string }> = [];
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => rows.push({ key, value: String(v) }));
      return;
    }
    rows.push({ key, value: String(value) });
  });
  return rows;
}

function decodeBase64ToText(base64: string): string {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

// Helper: detect if response is JSON
function isLikelyJson(body: string | undefined | null, headers?: Record<string, string | string[]>): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isLikelyXml(body: string | undefined | null, headers?: Record<string, string | string[]>): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/xml') || ct.includes('text/xml') || ct.includes('+xml')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('<') && !trimmed.startsWith('<!DOCTYPE html');
}

function isLikelyHtml(body: string | undefined | null, headers?: Record<string, string | string[]>): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return true;
  const trimmed = body.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

interface ResponsePaneProps {
  response: ResponseState | null;
  loading: boolean;
  request?: any; // Request details for logging
  onDownloadFile?: (payload: { fileName: string; mimeType: string; fileBase64: string }) => void;
  post?: (msg: any) => void;
}

type ResTab = 'body' | 'headers' | 'logs' | 'raw';

export const ResponsePane: React.FC<ResponsePaneProps> = ({ response, loading, request, onDownloadFile, post }) => {
  const [activeTab, setActiveTab] = useState<ResTab>('body');
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [bodySearch, setBodySearch] = useState('');
  const [showRawForLarge, setShowRawForLarge] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Local alias for the post function (ensures a named variable in this scope)
  const send = post;

  useEffect(() => { if (showSearch) searchRef.current?.focus(); }, [showSearch]);
  useEffect(() => { setShowSearch(false); setBodySearch(''); }, [response]);

  const decodedFileText = React.useMemo(() => {
    if (!response?.isFileResponse || !response.fileBase64) return '';
    if (response.filePreviewType !== 'text' && response.filePreviewType !== 'csv') return '';
    return decodeBase64ToText(response.fileBase64);
  }, [response]);

  // Hide search control for PDF previews (we render PDF visually instead)
  const hideSearchButton = !!response?.isFileResponse && (response.filePreviewType === 'pdf') && !!response.fileBase64;
  useEffect(() => {
    if (hideSearchButton) {
      setShowSearch(false);
      setBodySearch('');
    }
  }, [hideSearchButton]);

  const isLargeFilePreviewBlocked = !!response?.isFileResponse && response.size > FILE_PREVIEW_RENDER_THRESHOLD;
  const isPdfPreview = !!response?.isFileResponse && response.filePreviewType === 'pdf' && !!response.fileBase64;
  const searchableText = isPdfPreview ? '' : (response?.body || decodedFileText || '');

  const headerRows = React.useMemo(
    () => flattenHeaders(response?.headers),
    [response?.headers],
  );

  const handleCopy = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleCopyCurlStatus = () => {
    const curlCmd = request?.curlCommand || (request ? buildCurlCommand(request) : '');
    if (curlCmd) {
      navigator.clipboard.writeText(curlCmd);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    }
  };

  const handleDownloadFile = () => {
    if (!response?.fileBase64) return;
    const mimeType = response.fileMimeType || 'application/octet-stream';
    const fileName = response.fileName || 'response.bin';

    try {
      if (onDownloadFile) {
        onDownloadFile({
          fileName,
          mimeType,
          fileBase64: response.fileBase64,
        });
      } else {
        const selectedName = window.prompt('Save file as', fileName);
        if (!selectedName) return;
        const bytes = Uint8Array.from(atob(response.fileBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = selectedName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 1500);
    } catch {
      // Ignore download failures silently.
    }
  };

  /* loading state */
  if (loading) {
    return (
      <div className="response-pane" id="res-pane">
        <div className="response-empty">
          <div className="spinner" />
          <div style={{ fontSize: 12 }}>Sending request…</div>
        </div>
      </div>
    );
  }

    /* empty state */
  if (!response) {
    return (
      <div className="response-pane" id="res-pane">
        <div className="response-empty">
          <div className="icon"><Icon icon={faPaperPlane} size={28} style={{ opacity: 0.5 }} /></div>
          <div>Send a request to see the response</div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 8, lineHeight: 1.8 }}>
            <span style={{ display: 'block' }}>⏎ Enter — send request</span>
            <span style={{ display: 'block' }}>Ctrl+S — save request</span>
            <span style={{ display: 'block' }}>Ctrl+Enter — send request</span>
          </div>
        </div>
      </div>
    );
  }

  const statusClass = getStatusClass(response.status);

  return (
    <div className="response-pane" id="res-pane">
      {/* Status bar */}
      <div className="response-status-bar">
        <span className={`status-code ${statusClass}`}>
          {response.status || 'ERR'}
        </span>
        <span className="status-text">{response.statusText}</span>
        <span className="meta-chip">{response.duration} ms</span>
        <span className="meta-chip">{formatSize(response.size)}</span>
        {response.isFileResponse && response.fileDetectionSource === 'filename' && (
          <span className="meta-chip" title="File type inferred from filename when response headers were generic">
            Detected from filename
          </span>
        )}
        <div className="response-actions">
          {request && (
            <button className="copy-btn" onClick={handleCopyCurlStatus} title="Copy as cURL command">
              <Icon icon={faTerminal} size={12} style={{ marginRight: 4 }} />
              {copiedCurl ? 'cURL ✓' : 'cURL'}
            </button>
          )}
          {response.body && !isLargeFilePreviewBlocked && (
            <button className="copy-btn" onClick={handleCopy}>
              <Icon icon={faCopy} size={12} style={{ marginRight: 4 }} />
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
          )}
          {!isLargeFilePreviewBlocked && !hideSearchButton && (response.body || decodedFileText || response.isFileResponse) && (
            <button className="copy-btn" title="Search in preview" onClick={() => setShowSearch(s => !s)}>
              <Icon icon={faMagnifyingGlass} size={12} />
            </button>
          )}
          {response.isFileResponse && response.fileBase64 && (
            <button className={`copy-btn ${downloaded ? 'active' : ''}`} onClick={handleDownloadFile} title={response.fileName || 'Download file'}>
              <Icon icon={faDownload} size={12} style={{ marginRight: 4 }} />
              {downloaded ? 'Downloaded ✓' : 'Download'}
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" id="res-tabs">
        {(['body', 'headers', 'logs', 'raw'] as ResTab[]).map((tab) => (
          <div
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'logs' ? <><Icon icon={faClipboardList} size={12} style={{ marginRight: 5 }} />Logs</> : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && (
              <span className="tab-badge">{headerRows.length}</span>
            )}
            {tab === 'logs' && request?.scriptLogs && request.scriptLogs.length > 0 && (
              <span className="tab-badge" style={{ background: request.scriptSuccess === false ? 'var(--error, #c0392b)' : 'var(--accent, #50fa7b)', color: '#000' }}>
                {request.scriptSuccess === false ? '✗' : '✓'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Body tab — pretty JSON / XML when appropriate, otherwise raw text */}
      {activeTab === 'body' && (
        <div className="tab-content active" style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
          {/* Search bar */}
          {showSearch && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <input ref={searchRef} type="text" placeholder="Search in response..." value={bodySearch}
                onChange={e => setBodySearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setShowSearch(false), setBodySearch(''))}
                style={{ flex: 1, background: 'var(--input-bg)', border: '1px solid var(--accent)', color: 'var(--fg)', padding: '3px 8px', borderRadius: 4, fontSize: 11, fontFamily: 'inherit', outline: 'none' }} />
              {bodySearch && (
                <span style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0 }}>
                  {(() => { try { return (searchableText.match(new RegExp(escapeRegex(bodySearch), 'gi')) || []).length; } catch { return 0; } })()} matches
                </span>
              )}
              <button onClick={() => { setShowSearch(false); setBodySearch(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}><Icon icon={faXmark} size={13} /></button>
            </div>
          )}
          {/* Large response warning */}
          {response.size > LARGE_RESPONSE_THRESHOLD && !showRawForLarge && (
            <div style={{ padding: '6px 12px', background: 'color-mix(in srgb, var(--warning, #f9e2af) 15%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--warning, #f9e2af) 30%, transparent)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span>⚠️ Large response ({formatSize(response.size)}) — syntax highlighting may be slow.</span>
              <button onClick={() => { setShowRawForLarge(true); setActiveTab('raw'); }}
                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--fg)', flexShrink: 0 }}>Show Raw</button>
            </div>
          )}
          {/* Body content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {response.isFileResponse && response.fileBase64 ? (
              <FilePreview response={response} search={bodySearch} post={send} />
            ) : isLikelyJson(response.body, response.headers) ? (
              <div style={{ padding: 8 }}><PrettyBodyViewer text={response.body} language="json" search={bodySearch} /></div>
            ) : isLikelyHtml(response.body, response.headers) ? (
              <div style={{ padding: 8 }}><PrettyBodyViewer text={response.body} language="html" search={bodySearch} /></div>
            ) : isLikelyXml(response.body, response.headers) ? (
              <div style={{ padding: 8 }}><PrettyBodyViewer text={response.body} language="xml" search={bodySearch} /></div>
            ) : (
              <div style={{ padding: 8 }}><PrettyBodyViewer text={searchableText} language="text" search={bodySearch} /></div>
            )}
          </div>
        </div>
      )}

      {/* Headers tab */}
      {activeTab === 'headers' && (
        <div className="tab-content active" style={{ flex: 1, overflow: 'hidden' }}>
          <div className="scroll-area" style={{ flex: 1 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Header</th>
                  <th style={{ textAlign: 'left', padding: '7px 12px', color: 'var(--muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.5px' }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {headerRows.map(({ key, value }, idx) => (
                  <tr key={`${key}-${idx}`} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: 'var(--accent-2)' }}>{key}</td>
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <div className="tab-content active" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="scroll-area" style={{ flex: 1 }}>
            <div style={{ padding: '12px' }}>
              <RequestLog response={response} request={request} />
              <ScriptResultLog request={request} />
            </div>
          </div>
        </div>
      )}

      {/* Raw tab */}
      {activeTab === 'raw' && (
        <div className="tab-content active" style={{ flex: 1, overflow: 'hidden' }}>
          <pre className="response-body">{response.body}</pre>
        </div>
      )}

      {/* script-result removed */}
    </div>
  );
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ─── Searchable Body ────────────────────────────── */
const SearchableBody: React.FC<{ text: string; search: string }> = ({ text, search }) => {
  const parts = React.useMemo(() => {
    if (!search) return [{ text, match: false }];
    try {
      return text.split(new RegExp(`(${escapeRegex(search)})`, 'gi')).map((part, i) => ({ text: part, match: i % 2 === 1 }));
    } catch { return [{ text, match: false }]; }
  }, [text, search]);
  return (
    <pre style={{ margin: 0, padding: '12px', fontSize: 12, fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--fg)' }}>
      {parts.map((p, i) => p.match
        ? <mark key={i} style={{ background: 'color-mix(in srgb, var(--accent, #89b4fa) 50%, transparent)', color: 'var(--fg)', borderRadius: 2 }}>{p.text}</mark>
        : <React.Fragment key={i}>{p.text}</React.Fragment>)}
    </pre>
  );
};

const FilePreview: React.FC<{ response: ResponseState; search: string; post?: (msg: any) => void }> = ({ response, search, post }) => {
  const previewType = response.filePreviewType || 'none';
  const fileName = response.fileName || 'response.bin';

  const decodedText = React.useMemo(() => {
    if (!response.fileBase64) return '';
    if (previewType !== 'text' && previewType !== 'csv') return '';
    return decodeBase64ToText(response.fileBase64);
  }, [response.fileBase64, previewType]);

  const [excelData, setExcelData] = React.useState<{ error: string; rows: string[][]; sheetName: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let workbook: any = null;
    if (previewType !== 'excel' || !response.fileBase64) {
      setExcelData(null);
      return undefined;
    }

    (async () => {
      try {
        const binary = Uint8Array.from(atob(response.fileBase64!), (c) => c.charCodeAt(0));
        // Lazy-load exceljs to avoid bundling it into the mainPanel chunk
        const mod = await import('exceljs');
        const ExcelJSLib = (mod && (mod as any).default) ? (mod as any).default : mod;
        workbook = new ExcelJSLib.Workbook();
        await workbook.xlsx.load(binary.buffer as any);
        const ws = workbook.worksheets[0];
        if (!ws) {
          if (!cancelled) setExcelData({ error: 'No worksheet found in file', rows: [], sheetName: '' });
          return;
        }
        const rows: string[][] = [];
        ws.eachRow((row: any) => {
          const vals = (row.values as any[]).slice(1).map((v) => (v == null ? '' : String(v)));
          rows.push(vals);
        });
        if (!cancelled) setExcelData({ error: '', rows, sheetName: ws.name || '' });
      } catch {
        if (!cancelled) setExcelData({ error: 'Unable to parse Excel file for preview', rows: [], sheetName: '' });
      } finally {
        // Release reference to workbook so it can be GC'd
        try { workbook = null; } catch { /* ignore */ }
      }
    })();

    return () => {
      cancelled = true;
      // Clear parsed data and drop references to free memory
      try { setExcelData(null); } catch { /* ignore */ }
      try { workbook = null; } catch { /* ignore */ }
    };
  }, [previewType, response.fileBase64]);

  if (response.size > FILE_PREVIEW_RENDER_THRESHOLD) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
        Preview skipped for large file ({formatSize(response.size)}). Preview limit is 5 MB. Use Download to save {fileName}.
      </div>
    );
  }

  if (previewType === 'pdf' && response.fileBase64) {
    return <PdfViewer fileBase64={response.fileBase64} fileName={fileName} post={post} />;
  }

  if ((previewType === 'text' || previewType === 'csv') && decodedText) {
    if (previewType === 'csv') {
      const rows = parseCsvRows(decodedText);
      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);
        const filteredRows = search
          ? dataRows.filter((r) => r.join(' ').toLowerCase().includes(search.toLowerCase()))
          : dataRows;
        const cappedRows = filteredRows.slice(0, 300);
        return (
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              CSV Preview: {filteredRows.length} rows {filteredRows.length > cappedRows.length ? `(showing first ${cappedRows.length})` : ''} {search && `(filtered)`}
            </div>
            <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }} role="grid" aria-label="CSV data (read-only)">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--input-bg) 65%, transparent)' }}>
                    {headers.map((h, idx) => (
                      <th key={`${h}-${idx}`} style={{ textAlign: 'left', padding: '7px 10px', whiteSpace: 'nowrap' }}>
                        {h || `Column ${idx + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cappedRows.map((r, rIdx) => (
                    <tr key={rIdx} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 35%, transparent)' }}>
                      {headers.map((_, cIdx) => (
                        <td key={`${rIdx}-${cIdx}`} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                          {r[cIdx] || ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
    }

    if (search) return <SearchableBody text={decodedText} search={search} />;
    return (
      <pre style={{ margin: 0, padding: '12px', fontSize: 12, fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--fg)' }} role="document" aria-label="File preview (read-only)">
        {decodedText}
      </pre>
    );
  }

  if (previewType === 'excel') {
    if (!excelData) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
          Excel file is empty. Use Download to open {fileName}.
        </div>
      );
    }

    if (excelData.error) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
          {excelData.error}. Use Download to open {fileName} in your spreadsheet app.
        </div>
      );
    }

    if (!excelData.rows.length) {
      return (
        <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
          Excel file is empty. Use Download to open {fileName}.
        </div>
      );
    }

    const headers = excelData.rows[0] || [];
    const dataRows = excelData.rows.slice(1);
    const filteredRows = search
      ? dataRows.filter((r) => r.join(' ').toLowerCase().includes(search.toLowerCase()))
      : dataRows;
    const cappedRows = filteredRows.slice(0, 300);

    return (
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>
          Excel Preview ({excelData.sheetName}): {filteredRows.length} rows {filteredRows.length > cappedRows.length ? `(showing first ${cappedRows.length})` : ''} {search && `(filtered)`}
        </div>
        <div style={{ overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          <table style={{ width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 }} role="grid" aria-label="Excel data (read-only)">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--input-bg) 65%, transparent)' }}>
                {headers.map((h, idx) => (
                  <th key={`${h}-${idx}`} style={{ textAlign: 'left', padding: '7px 10px', whiteSpace: 'nowrap' }}>
                    {h || `Column ${idx + 1}`}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cappedRows.map((r, rIdx) => (
                <tr key={rIdx} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 35%, transparent)' }}>
                  {headers.map((_, cIdx) => (
                    <td key={`${rIdx}-${cIdx}`} style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                      {r[cIdx] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
      Binary file response detected ({fileName}). Use Download to save and open it locally.
    </div>
  );
};


/* ─── Collapsible Section ───────────────────────────── */
interface CollapsibleSectionProps {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
  accentColor?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, defaultOpen = true, children, badge, accentColor }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="log-section" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer', userSelect: 'none',
          padding: '7px 10px',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          background: 'color-mix(in srgb, var(--input-bg) 40%, transparent)',
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--muted)', transition: 'transform .15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}><Icon icon={faChevronRight} size={9} /></span>
        <span className="log-title" style={{ margin: 0, flex: 1, color: accentColor }}>{title}</span>
        {badge !== undefined && (
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, background: 'var(--border)', borderRadius: 9, minWidth: 18, height: 18, padding: '0 5px', color: 'var(--muted)', lineHeight: 1, fontWeight: 700 }}>{badge}</span>
        )}
      </div>
      {open && <div style={{ padding: '8px 10px' }}>{children}</div>}
    </div>
  );
};

interface RequestLogProps {
  response: ResponseState | null;
  request?: any;
}

const RequestLog: React.FC<RequestLogProps> = ({ response, request }) => {
  if (!response) {
    return <div style={{ color: 'var(--muted)', fontSize: 12 }}>No request data available</div>;
  }

  // Detect if mTLS is being used (client certificates)
  const hasMtls = request?.mtlsUsed || false;
  const mtlsHostname = request?.mtlsHostname || null;

  const enabledRequestHeaders = (request?.headers || []).filter((h: any) => h.enabled !== false);
  const enabledQueryParams = (request?.queryParams || []).filter((p: any) => p.enabled !== false);

  return (
    <div className="request-log" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

      <CollapsibleSection title={<><Icon icon={faArrowUp} size={11} style={{ marginRight: 5 }} />Request</>} defaultOpen={true}>
        <LogEntry label="Method" value={request?.method || 'N/A'} />
        <LogEntry label="URL" value={request?.url || 'N/A'} monospace />
        <LogEntry label="Protocol" value={request?.url?.startsWith('https') ? 'HTTPS' : 'HTTP'} />
        <LogEntry label="SSL Verification" value={request?.rejectUnauthorized ? '✓ Enabled' : '✗ Disabled (Insecure)'} highlight={!request?.rejectUnauthorized} />
        <LogEntry label="mTLS (Client Certificate)" value={hasMtls ? '✓ Enabled' : '✗ Not Used'} highlight={hasMtls} />
        {hasMtls && mtlsHostname && <LogEntry label="  Certificate Hostname" value={mtlsHostname} monospace indent />}
        <LogEntry label="Proxy" value={request?.proxyUsed ? '✓ Enabled' : '✗ Not Used'} highlight={false} />
        {request?.proxyUsed && request?.proxyUrl ? (
          <>
            <LogEntry label="  Proxy URL" value={request.proxyUrl} monospace indent />
            {request?.hasProxyAuth && <LogEntry label="  Proxy Authentication" value="✓ Configured (Basic Auth)" indent />}
          </>
        ) : !request?.proxyUsed && request?.proxyUrl ? (
          <LogEntry label="  Note" value="Proxy configured but not used (hostname may be in no-proxy list)" indent highlight={true} />
        ) : null}
      </CollapsibleSection>

      {enabledRequestHeaders.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faList} size={11} style={{ marginRight: 5 }} />Request Headers</>} defaultOpen={false} badge={enabledRequestHeaders.length}>
          {enabledRequestHeaders.map((h: any, idx: number) => (
            <LogEntry key={idx} label={h.key} value={h.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {enabledQueryParams.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faLink} size={11} style={{ marginRight: 5 }} />Query Parameters</>} defaultOpen={false} badge={enabledQueryParams.length}>
          {enabledQueryParams.map((p: any, idx: number) => (
            <LogEntry key={idx} label={p.key} value={p.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {request?.body && (
        <CollapsibleSection title={<><Icon icon={faFileCode} size={11} style={{ marginRight: 5 }} />Request Body</>} defaultOpen={false}>
          <pre style={{ fontSize: 11, color: 'var(--input-fg)', background: 'color-mix(in srgb, var(--input-bg) 50%, transparent)', padding: '8px 10px', borderRadius: '4px', overflow: 'auto', maxHeight: '150px', margin: '0', border: '1px solid var(--border)' }}>{request.body}</pre>
        </CollapsibleSection>
      )}

      <CollapsibleSection title={<><Icon icon={faDownload} size={11} style={{ marginRight: 5 }} />Response</>} defaultOpen={true}>
        <LogEntry label="Status Code" value={`${response.status} ${response.statusText}`} highlight={response.status >= 400} />
        <LogEntry label="Duration" value={`${response.duration}ms`} />
        <LogEntry label="Response Size" value={formatSize(response.size)} />
        <div style={{ fontSize: 10, color: 'var(--muted)', paddingTop: 6 }}>{new Date().toLocaleString()}</div>
      </CollapsibleSection>

      <CollapsibleSection title={<><Icon icon={faList} size={11} style={{ marginRight: 5 }} />Response Headers</>} defaultOpen={false} badge={Object.keys(response.headers).length}>
        {Object.entries(response.headers).map(([key, val]) => (
          <LogEntry key={key} label={key} value={String(val)} monospace small />
        ))}
      </CollapsibleSection>

      {request?.scriptLogs && request.scriptLogs.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faCode} size={11} style={{ marginRight: 5 }} />Script Logs</>} defaultOpen={true} badge={request.scriptLogs.length}>
          {request.scriptLogs.map((ln: string, idx: number) => (
            <div key={idx} style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace", padding: '3px 0', fontSize: 11, color: 'var(--input-fg)' }}>{ln}</div>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection title={<><Icon icon={faTerminal} size={11} style={{ marginRight: 5 }} />cURL Command</>} defaultOpen={false}>
        <CurlCommandGenerator request={request} response={response} />
      </CollapsibleSection>

    </div>
  );
};

interface CurlCommandGeneratorProps {
  request?: any;
  response: ResponseState | null;
}

const CurlCommandGenerator: React.FC<CurlCommandGeneratorProps> = ({ request }) => {
  if (!request) {
    return <div style={{ color: 'var(--muted)', fontSize: 11 }}>No request data available</div>;
  }

  // Use pre-built curl command from backend if available
  const curlCmd = request.curlCommand || buildCurlCommand(request);

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCmd);
  };

  return (
    <div>
      <pre style={{
        fontSize: 10,
        color: 'var(--input-fg)',
        background: 'color-mix(in srgb, var(--input-bg) 50%, transparent)',
        padding: '8px 10px',
        borderRadius: '4px',
        overflow: 'auto',
        maxHeight: '150px',
        margin: '0 0 8px 0',
        border: '1px solid var(--border)',
        wordBreak: 'break-all',
        whiteSpace: 'pre-wrap',
      }}>
        {curlCmd}
      </pre>
      <button
        onClick={handleCopyCurl}
        style={{
          background: 'var(--accent)',
          color: '#1e1e2e',
          border: 'none',
          padding: '4px 10px',
          borderRadius: '4px',
          fontSize: '11px',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        <Icon icon={faCopy} size={11} style={{ marginRight: 4 }} /> Copy cURL Command
      </button>
    </div>
  );
};

// Helper function to build curl command if not provided
function buildCurlCommand(request: any): string {
  let curlCmd = `curl `;
  
  // Add insecure flag if SSL verification is disabled
  if (request.rejectUnauthorized === false) {
    curlCmd += `-k `;
  }
  
  curlCmd += `-X ${request.method || 'GET'} `;
  
  // Add proxy if used
  if (request.proxyUsed && request.proxyUrl) {
    curlCmd += `-x "${request.proxyUrl}" `;
    if (request.hasProxyAuth) {
      curlCmd += `-U "username:password" `;
    }
  }

  // Add headers (use resolved headers if available)
  const enabledHeaders = (request.headers || []).filter((h: any) => h.enabled !== false);
  enabledHeaders.forEach((h: any) => {
    if (h.key && h.value) {
      curlCmd += `-H "${h.key}: ${h.value}" `;
    }
  });

  // Add body if present
  if (request.body) {
    const escapedBody = request.body.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    curlCmd += `-d "${escapedBody}" `;
  }

  // Add URL with query params
  let fullUrl = request.url || '';
  const enabledParams = (request.queryParams || []).filter((p: any) => p.enabled !== false);
  if (enabledParams.length > 0) {
    const queryString = enabledParams
      .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
  }

  curlCmd += `"${fullUrl}" -v`;
  return curlCmd;
}

/* ─── Script Result Log ─────────────────────────────── */
interface ScriptResultLogProps {
  request?: any;
}

const ScriptResultLog: React.FC<ScriptResultLogProps> = ({ request }) => {
  const [logsOpen, setLogsOpen] = useState(true);
  const [varsOpen, setVarsOpen] = useState(true);

  // Show a running spinner while the extension host is executing the script
  if (request?.scriptRunning) {
    return (
      <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />
        Running post-response script…
      </div>
    );
  }

  // Only show if a script was actually run (scriptLogs is set — even if empty — after execution)
  if (!request || request.scriptLogs === undefined) return null;

  const success: boolean = request.scriptSuccess !== false;
  const logs: string[] = request.scriptLogs || [];
  const error: string | undefined = request.scriptError;
  const variables: Record<string, any> = request.scriptVariables || {};
  const hasVars = Object.keys(variables).length > 0;

  const sectionStyle: React.CSSProperties = {
    marginTop: 16,
    border: `1px solid ${success ? 'color-mix(in srgb, var(--accent, #50fa7b) 35%, transparent)' : 'color-mix(in srgb, var(--error, #c0392b) 35%, transparent)'}`,
    borderRadius: 6,
    overflow: 'hidden',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    background: success
      ? 'color-mix(in srgb, var(--accent, #50fa7b) 12%, transparent)'
      : 'color-mix(in srgb, var(--error, #c0392b) 12%, transparent)',
    fontSize: 12,
    fontWeight: 600,
  };

  const badge: React.CSSProperties = {
    padding: '1px 7px',
    borderRadius: 10,
    fontSize: 10,
    fontWeight: 700,
    background: success ? 'var(--accent, #50fa7b)' : 'var(--error, #c0392b)',
    color: success ? '#000' : '#fff',
  };

  const monoBlock: React.CSSProperties = {
    fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
    fontSize: 11,
    padding: '6px 12px',
    background: 'color-mix(in srgb, var(--input-bg) 50%, transparent)',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
  };

  const subHeader = (label: string, count: number, open: boolean, toggle: () => void): React.ReactNode => (
    <div
      onClick={toggle}
      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', cursor: 'pointer', userSelect: 'none', borderTop: '1px solid var(--border)', background: 'color-mix(in srgb, var(--input-bg) 30%, transparent)' }}
    >
      <span style={{ fontSize: 9, color: 'var(--muted)', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .15s' }}>▶</span>
      <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 10, background: 'var(--border)', borderRadius: 8, padding: '1px 5px', color: 'var(--muted)' }}>{count}</span>
    </div>
  );

  return (
    <div style={sectionStyle}>
      <div style={headerStyle}>
        <span>🧩 Post-response Script</span>
        <span style={badge}>{success ? 'Executed' : 'Error'}</span>
      </div>

      {error && (
        <div style={{ ...monoBlock, color: 'var(--error, #c0392b)', borderTop: '1px solid var(--border)', padding: '8px 12px' }}>
          ✗ {error}
        </div>
      )}

      {logs.length > 0 && (
        <>
          {subHeader('Logs', logs.length, logsOpen, () => setLogsOpen((v) => !v))}
          {logsOpen && logs.map((ln, i) => (
            <div key={i} style={monoBlock}>{ln}</div>
          ))}
        </>
      )}

      {logs.length === 0 && !error && (
        <div style={{ ...monoBlock, color: 'var(--muted)', borderTop: '1px solid var(--border)', padding: '8px 12px' }}>Script ran with no logs. Use log() to output values.</div>
      )}

      {hasVars && (
        <>
          {subHeader('Variables Extracted', Object.keys(variables).length, varsOpen, () => setVarsOpen((v) => !v))}
          {varsOpen && Object.entries(variables).map(([k, v]) => (
            <div key={k} style={{ ...monoBlock, display: 'flex', gap: 12 }}>
              <span style={{ color: 'var(--accent-2, #8be9fd)', minWidth: 140 }}>{k}</span>
              <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

interface LogEntryProps {
  label: string;
  value: string;
  monospace?: boolean;
  small?: boolean;
  highlight?: boolean;
  indent?: boolean;
}

const LogEntry: React.FC<LogEntryProps> = ({ 
  label, 
  value, 
  monospace = false, 
  small = false,
  highlight = false,
  indent = false
}) => (
  <div style={{
    display: 'flex',
    gap: '12px',
    padding: small ? '4px 0' : '8px 0',
    borderBottom: small ? 'none' : '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
    fontSize: small ? 11 : 12,
    marginLeft: indent ? '20px' : '0',
    color: highlight ? 'var(--error)' : 'var(--fg)',
  }}>
    <span style={{
      minWidth: '180px',
      color: 'var(--muted)',
      fontWeight: 500,
    }}>
      {label}:
    </span>
    <span style={{
      flex: 1,
      fontFamily: monospace ? "'Cascadia Code', 'Fira Code', monospace" : 'inherit',
      wordBreak: 'break-all',
      color: highlight ? 'var(--error)' : 'var(--input-fg)',
    }}>
      {value}
    </span>
  </div>
);
