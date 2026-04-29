import React, { useState } from 'react';
import { ResponseState, getStatusClass } from '../types';

// Helper: detect if response is JSON
function isLikelyJson(body: string | undefined | null, headers?: Record<string, string>): boolean {
  if (!body) return false;
  const contentType = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isLikelyXml(body: string | undefined | null, headers?: Record<string, string>): boolean {
  if (!body) return false;
  const contentType = Object.entries(headers || {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1] || '';
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/xml') || ct.includes('text/xml') || ct.includes('+xml')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('<') && !trimmed.startsWith('<!DOCTYPE html');
}

function prettyPrintXml(xml: string): string {
  try {
    let formatted = '';
    let indent = 0;
    const lines = xml.replace(/>\s*</g, '>\n<').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Closing tag — dedent before printing
      if (/^<\//.test(trimmed)) indent = Math.max(0, indent - 1);
      formatted += '  '.repeat(indent) + trimmed + '\n';
      // Open tag (not self-closing, not declaration, not comment, not closing) — indent after
      if (!trimmed.startsWith('<?') && !trimmed.startsWith('<!--') && !trimmed.endsWith('/>') && !/^<\//.test(trimmed) && /<[^!][^>]*[^/]>$/.test(trimmed)) {
        indent++;
      }
    }
    return formatted.trim();
  } catch {
    return xml;
  }
}

function syntaxHighlightXml(line: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Escape first, then re-apply highlight spans on the escaped string.
  // We work on the raw line so we can safely colour XML tokens.
  return line
    .replace(/&/g, '&amp;').replace(/</g, '\x00LT\x00').replace(/>/g, '\x00GT\x00')
    .replace(
      /(\x00LT\x00\/?)([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)(\s*\/?(\x00GT\x00))/g,
      (_, open, tag, attrs, close) => {
        const coloredAttrs = attrs.replace(
          /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
          `<span class="xml-attr-name">$1</span>$2<span class="xml-attr-value">$3</span>`
        );
        return `<span class="xml-bracket">&lt;${open.includes('\x00LT\x00/') ? '/' : ''}</span><span class="xml-tag">${tag}</span>${coloredAttrs}<span class="xml-bracket">${close.replace('\x00GT\x00', '&gt;')}</span>`;
      }
    )
    .replace(/\x00LT\x00\?([\w]+)/g, '<span class="xml-bracket">&lt;?</span><span class="xml-tag">$1</span>')
    .replace(/\x00GT\x00/g, '&gt;').replace(/\x00LT\x00/g, '&lt;');
}

const XmlPrettyViewer: React.FC<{ text: string }> = ({ text }) => {
  const pretty = React.useMemo(() => {
    if (!text) return '';
    return prettyPrintXml(text);
  }, [text]);

  const lines = React.useMemo(() => (pretty || '').split('\n'), [pretty]);

  return (
    <div style={{ display: 'table', width: '100%', borderSpacing: 0 }}>
      {lines.map((line, idx) => (
        <div key={idx} style={{ display: 'table-row' }}>
          <div style={{ display: 'table-cell', width: '3em', background: 'var(--line-number-bg)', color: 'var(--line-number-fg)', textAlign: 'right', paddingRight: '8px', borderRight: '1px solid var(--border)', fontFamily: "'Cascadia Code','Fira Code',Consolas,monospace", fontSize: 11, userSelect: 'none', whiteSpace: 'nowrap' }}>{idx + 1}</div>
          <div style={{ display: 'table-cell', paddingLeft: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }} dangerouslySetInnerHTML={{ __html: syntaxHighlightXml(line) }} />
        </div>
      ))}
    </div>
  );
};

// Syntax highlight JSON (returns HTML string safe-ish for our controlled data)
function syntaxHighlightJSON(jsonLine: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc(jsonLine).replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, (match) => {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) cls = 'json-key';
      else cls = 'json-string';
    } else if (/true|false/.test(match)) {
      cls = 'json-boolean';
    } else if (/null/.test(match)) {
      cls = 'json-null';
    }
    return `<span class="${cls}">${match}</span>`;
  });
}

const JsonPrettyViewer: React.FC<{ text: string }> = ({ text }) => {
  const pretty = React.useMemo(() => {
    if (!text) return '';
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  }, [text]);

  const lines = React.useMemo(() => (pretty || '').split('\n'), [pretty]);

  return (
    <div style={{ display: 'table', width: '100%', borderSpacing: 0 }}>
      {lines.map((line, idx) => (
        <div key={idx} style={{ display: 'table-row' }}>
          <div style={{ display: 'table-cell', width: '3em', background: 'var(--line-number-bg)', color: 'var(--line-number-fg)', textAlign: 'right', paddingRight: '8px', borderRight: '1px solid var(--border)', fontFamily: "'Cascadia Code','Fira Code',Consolas,monospace", fontSize: 11, userSelect: 'none', whiteSpace: 'nowrap' }}>{idx + 1}</div>
          <div style={{ display: 'table-cell', paddingLeft: '8px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }} dangerouslySetInnerHTML={{ __html: syntaxHighlightJSON(line) }} />
        </div>
      ))}
    </div>
  );
};

interface ResponsePaneProps {
  response: ResponseState | null;
  loading: boolean;
  request?: any; // Request details for logging
}

type ResTab = 'body' | 'headers' | 'logs' | 'raw';

export const ResponsePane: React.FC<ResponsePaneProps> = ({ response, loading, request }) => {
  const [activeTab, setActiveTab] = useState<ResTab>('body');
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
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
          <div className="icon">→</div>
          <div>Send a request to see the response</div>
          <div style={{ fontSize: 11, opacity: 0.5 }}>Results will appear here</div>
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
        <button className="copy-btn" onClick={handleCopy}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Tab bar */}
      <div className="tab-bar" id="res-tabs">
        {(['body', 'headers', 'logs', 'raw'] as ResTab[]).map((tab) => (
          <div
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'logs' ? '📋 Logs' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && (
              <span className="tab-badge">{Object.keys(response.headers).length}</span>
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
        <div className="tab-content active" style={{ flex: 1, overflow: 'auto' }}>
          {isLikelyJson(response.body, response.headers) ? (
            <div style={{ padding: 8 }}>
              <JsonPrettyViewer text={response.body} />
            </div>
          ) : isLikelyXml(response.body, response.headers) ? (
            <div style={{ padding: 8 }}>
              <XmlPrettyViewer text={response.body} />
            </div>
          ) : (
            <pre style={{
              margin: 0,
              padding: '12px',
              fontSize: 12,
              fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              color: 'var(--fg)',
            }}>
              {response.body}
            </pre>
          )}
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
                {Object.entries(response.headers).map(([key, val]) => (
                  <tr key={key} style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace', color: 'var(--accent-2)' }}>{key}</td>
                    <td style={{ padding: '6px 12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>{String(val)}</td>
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


/* ─── Collapsible Section ───────────────────────────── */
interface CollapsibleSectionProps {
  title: string;
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
        <span style={{ fontSize: 10, color: 'var(--muted)', transition: 'transform .15s', display: 'inline-block', transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
        <span className="log-title" style={{ margin: 0, flex: 1, color: accentColor }}>{title}</span>
        {badge !== undefined && (
          <span style={{ fontSize: 10, background: 'var(--border)', borderRadius: 8, padding: '1px 6px', color: 'var(--muted)' }}>{badge}</span>
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

      <CollapsibleSection title="📤 Request" defaultOpen={true}>
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
        <CollapsibleSection title="📨 Request Headers" defaultOpen={false} badge={enabledRequestHeaders.length}>
          {enabledRequestHeaders.map((h: any, idx: number) => (
            <LogEntry key={idx} label={h.key} value={h.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {enabledQueryParams.length > 0 && (
        <CollapsibleSection title="🔗 Query Parameters" defaultOpen={false} badge={enabledQueryParams.length}>
          {enabledQueryParams.map((p: any, idx: number) => (
            <LogEntry key={idx} label={p.key} value={p.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {request?.body && (
        <CollapsibleSection title="📝 Request Body" defaultOpen={false}>
          <pre style={{ fontSize: 11, color: 'var(--input-fg)', background: 'color-mix(in srgb, var(--input-bg) 50%, transparent)', padding: '8px 10px', borderRadius: '4px', overflow: 'auto', maxHeight: '150px', margin: '0', border: '1px solid var(--border)' }}>{request.body}</pre>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="📥 Response" defaultOpen={true}>
        <LogEntry label="Status Code" value={`${response.status} ${response.statusText}`} highlight={response.status >= 400} />
        <LogEntry label="Duration" value={`${response.duration}ms`} />
        <LogEntry label="Response Size" value={formatSize(response.size)} />
        <div style={{ fontSize: 10, color: 'var(--muted)', paddingTop: 6 }}>📅 {new Date().toLocaleString()}</div>
      </CollapsibleSection>

      <CollapsibleSection title="📨 Response Headers" defaultOpen={false} badge={Object.keys(response.headers).length}>
        {Object.entries(response.headers).map(([key, val]) => (
          <LogEntry key={key} label={key} value={String(val)} monospace small />
        ))}
      </CollapsibleSection>

      {request?.scriptLogs && request.scriptLogs.length > 0 && (
        <CollapsibleSection title="🧩 Script Logs" defaultOpen={true} badge={request.scriptLogs.length}>
          {request.scriptLogs.map((ln: string, idx: number) => (
            <div key={idx} style={{ fontFamily: "'Cascadia Code', 'Fira Code', monospace", padding: '3px 0', fontSize: 11, color: 'var(--input-fg)' }}>{ln}</div>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection title="🐚 cURL Command" defaultOpen={false}>
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
        📋 Copy cURL Command
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

