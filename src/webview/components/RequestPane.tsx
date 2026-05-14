import React, { useState, useRef, useEffect } from 'react';
import { KVItem, FormDataItem, RequestState, Environment } from '../types';
import { KeyValueTable } from './KeyValueTable';
import VariableTextInput from './VariableTextInput';
import { CodeEditor } from './CodeEditor';
import { getScriptTemplate } from './scriptExecutor';
import { Icon, faEye, faEyeSlash } from './FaIcon';

interface RequestPaneProps {
  request: RequestState;
  onUpdate: (updates: Partial<RequestState>) => void;
  themeKind?: number;
  environment?: Environment | null; // Current environment for variable resolution
}

type ReqTab = 'params' | 'headers' | 'body' | 'script' | 'auth';
type BodyType = RequestState['bodyType'];
type AuthType = RequestState['authType'];

const AUTH_TYPES: Array<{ value: AuthType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
];

const AddToDropdown: React.FC<{ value: 'header' | 'query'; onChange: (v: 'header' | 'query') => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    { val: 'header' as const, label: 'Header' },
    { val: 'query' as const, label: 'Query Param' },
  ];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(options.findIndex((o) => o.val === value));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(options[activeIndex].val);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const label = value === 'header' ? 'Header' : 'Query Param';

  return (
    <div className="add-to-dropdown" ref={ref}>
      <button
        className="add-to-trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="add-to-trigger-label">{label}</span>
        <svg className={`add-to-chevron${open ? ' open' : ''}`} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <ul className="add-to-menu" role="listbox">
          {options.map((opt, idx) => (
            <li
              key={opt.val}
              role="option"
              aria-selected={opt.val === value}
              className={`add-to-option${opt.val === value ? ' selected' : ''}${idx === activeIndex ? ' highlighted' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.val);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="add-to-option-label">{opt.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const AuthTypeDropdown: React.FC<{ authType: AuthType; onChange: (type: AuthType) => void }> = ({ authType, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(AUTH_TYPES.findIndex((t) => t.value === authType));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, AUTH_TYPES.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(AUTH_TYPES[activeIndex].value);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const label = AUTH_TYPES.find((t) => t.value === authType)?.label || 'None';

  return (
    <div className="auth-type-dropdown" ref={ref}>
      <button
        className="auth-type-trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="auth-type-trigger-label">{label}</span>
        <svg className={`auth-type-chevron${open ? ' open' : ''}`} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <ul className="auth-type-menu" role="listbox">
          {AUTH_TYPES.map((t, idx) => (
            <li
              key={t.value}
              role="option"
              aria-selected={t.value === authType}
              className={`auth-type-option${t.value === authType ? ' selected' : ''}${idx === activeIndex ? ' highlighted' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t.value);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="auth-type-option-label">{t.label}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const BODY_TYPES: BodyType[] = ['none', 'json', 'form', 'urlencoded', 'text', 'xml', 'graphql'];

export const RequestPane: React.FC<RequestPaneProps> = ({ request, onUpdate, themeKind, environment }) => {
  const [activeTab, setActiveTab] = useState<ReqTab>('params');

  const activeParamCount = request.queryParams.filter((p) => p.key && p.enabled !== false).length;
  const activeHeaderCount = request.headers.filter((h) => h.key && h.enabled !== false).length;
  const hasBody = request.bodyType !== 'none' && (
    (request.bodyType === 'form' && (request.formData||[]).some(f => f.key)) ||
    (request.bodyType === 'urlencoded' && (request.urlencoded||[]).some(u => u.key)) ||
    (['json','text','xml','graphql'].includes(request.bodyType) && (request.body||'').trim().length > 0)
  );
  const hasAuth = request.authType && request.authType !== 'none';
  const hasScript = (request.script || '').trim().length > 0;

  const updateKvList = (field: 'queryParams' | 'headers' | 'formData', index: number, key: keyof KVItem, value: any) => {
    const items = [...request[field]] as KVItem[];
    items[index] = { ...items[index], [key]: value };
    onUpdate({ [field]: items });
  };

  const addKvRow = (field: 'queryParams' | 'headers' | 'formData') => {
    if (field === 'formData') {
      onUpdate({
        formData: [
          ...(request.formData || []),
          { key: '', value: '', enabled: true, formType: 'text' },
        ],
      });
      return;
    }
    onUpdate({ [field]: [...(request[field] as KVItem[]), { key: '', value: '', enabled: true }] });
  };

  const removeKvRow = (field: 'queryParams' | 'headers' | 'formData', index: number) => {
    onUpdate({ [field]: (request[field] as KVItem[]).filter((_, i) => i !== index) });
  };

  const updateFormDataRow = (index: number, updates: Partial<FormDataItem>) => {
    const next = [...(request.formData || [])];
    next[index] = { ...next[index], ...updates };
    onUpdate({ formData: next });
  };

  const handleSelectFormFile = (index: number, file?: File | null) => {
    if (!file) {
      updateFormDataRow(index, {
        fileName: '',
        fileContentBase64: '',
        contentType: '',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) return;

      const bytes = new Uint8Array(result);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }

      updateFormDataRow(index, {
        formType: 'file',
        value: '',
        fileName: file.name,
        fileContentBase64: btoa(binary),
        contentType: file.type || 'application/octet-stream',
      });
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="request-pane" id="req-pane">
      {/* Tab Bar */}
      <div className="tab-bar" id="req-tabs">
        {(['params', 'headers', 'body', 'script', 'auth'] as ReqTab[]).map((tab) => (
          <div
            key={tab}
            className={`tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'params' && activeParamCount > 0 && (
              <span className="tab-badge">{activeParamCount}</span>
            )}
            {tab === 'headers' && activeHeaderCount > 0 && (
              <span className="tab-badge">{activeHeaderCount}</span>
            )}
            {tab === 'body' && hasBody && (
              <span className="tab-badge tab-badge-dot" />
            )}
            {tab === 'auth' && hasAuth && (
              <span className="tab-badge tab-badge-dot" />
            )}
            {tab === 'script' && hasScript && (
              <span className="tab-badge tab-badge-dot" />
            )}
          </div>
        ))}
      </div>

      {/* Params Tab */}
      {activeTab === 'params' && (
        <div className="tab-content active scroll-area">
          <KeyValueTable
            items={request.queryParams}
            addLabel="+ Add Parameter"
            onAdd={() => addKvRow('queryParams')}
            onUpdate={(i, f, v) => updateKvList('queryParams', i, f, v)}
            onRemove={(i) => removeKvRow('queryParams', i)}
            environment={environment}
          />
        </div>
      )}

      {/* Headers Tab */}
      {activeTab === 'headers' && (
        <div className="tab-content active scroll-area">
          <KeyValueTable
            items={request.headers}
            addLabel="+ Add Header"
            onAdd={() => addKvRow('headers')}
            onUpdate={(i, f, v) => updateKvList('headers', i, f, v)}
            onRemove={(i) => removeKvRow('headers', i)}
            environment={environment}
            isHeaderTable={true}
          />
        </div>
      )}

      {/* Body Tab */}
      {activeTab === 'body' && (
        <div className="tab-content active" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          {/* Body type selector */}
          <div className="body-type-bar">
            {BODY_TYPES.map((bt) => (
              <button
                key={bt}
                className={`body-type-btn ${request.bodyType === bt ? 'active' : ''}`}
                onClick={() => onUpdate({ bodyType: bt })}
              >
                {bt}
              </button>
            ))}
          </div>

          {request.bodyType === 'none' && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--muted)', fontSize: 12 }}>
              This request has no body
            </div>
          )}

          {(request.bodyType === 'json' || request.bodyType === 'text' || request.bodyType === 'xml') && (
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <CodeEditor
                value={request.body}
                onChange={(body) => onUpdate({ body })}
                language={request.bodyType as 'json' | 'xml' | 'text'}
                themeKind={themeKind}
                jsonFormatMode={request.bodyFormat || 'formatted'}
                onJsonFormatModeChange={(bodyFormat) => onUpdate({ bodyFormat })}
                placeholder={request.bodyType === 'json' ? '{\n  \n}' : 'Enter request body…'}
              />
            </div>
          )}

          {/* Post-response script editor moved to Script tab */}

          {request.bodyType === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="scroll-area" style={{ flex: 1 }}>
                <div className="kv-wrap">
                  {(request.formData || []).map((item, i) => {
                    const rowType = item.formType || 'text';
                    return (
                      <div key={i} className="kv-row">
                        <div className="kv-check">
                          <input
                            type="checkbox"
                            checked={item.enabled !== false}
                            onChange={(e) => updateFormDataRow(i, { enabled: e.target.checked })}
                          />
                        </div>
                        <div className="form-key-wrapper">
                          <input
                            type="text"
                            className="kv-input"
                            placeholder="Key"
                            value={item.key}
                            onChange={(e) => updateFormDataRow(i, { key: e.target.value })}
                          />
                          <select
                            className="form-type-select"
                            value={rowType}
                            onChange={(e) => {
                              const nextType = e.target.value as 'text' | 'file';
                              updateFormDataRow(i, {
                                formType: nextType,
                                value: nextType === 'text' ? item.value || '' : '',
                                fileName: nextType === 'file' ? item.fileName || '' : '',
                                fileContentBase64: nextType === 'file' ? item.fileContentBase64 || '' : '',
                                contentType: nextType === 'file' ? item.contentType || '' : '',
                              });
                            }}
                            title={rowType === 'text' ? 'Text value' : 'File upload'}
                          >
                            <option value="text">T</option>
                            <option value="file">F</option>
                          </select>
                        </div>

                        {rowType === 'file' ? (
                          <div className="form-file-wrapper" data-has-file={!!item.fileName}>
                            <input
                              type="file"
                              className="form-file-input"
                              onChange={(e) => handleSelectFormFile(i, e.target.files?.[0])}
                            />
                            <span
                              className="form-file-name"
                              title={item.fileName || 'No file selected'}
                            >
                              {item.fileName || 'No file selected'}
                            </span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            className="kv-input"
                            placeholder="Value"
                            value={item.value || ''}
                            onChange={(e) => updateFormDataRow(i, { value: e.target.value })}
                          />
                        )}

                        <button className="kv-del" onClick={() => removeKvRow('formData', i)}>
                          ×
                        </button>
                      </div>
                    );
                  })}
                  <button className="add-row-btn" onClick={() => addKvRow('formData')}>
                    + Add Field
                  </button>
                </div>
              </div>
            </div>
          )}

          {request.bodyType === 'urlencoded' && (
            <div className="scroll-area" style={{ flex: 1 }}>
              <KeyValueTable
                items={request.urlencoded || []}
                addLabel="+ Add Parameter"
                onAdd={() => {
                  onUpdate({
                    urlencoded: [...(request.urlencoded || []), { key: '', value: '', enabled: true }],
                  });
                }}
                onUpdate={(i, f, v) => {
                  const items = [...(request.urlencoded || [])];
                  items[i] = { ...items[i], [f]: v };
                  onUpdate({ urlencoded: items });
                }}
                onRemove={(i) => {
                  onUpdate({
                    urlencoded: (request.urlencoded || []).filter((_, idx) => idx !== i),
                  });
                }}
                environment={environment}
              />
            </div>
          )}

          {request.bodyType === 'graphql' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>QUERY</div>
              <textarea
                className="code-editor"
                value={request.gqlQuery}
                placeholder="{ users { id name } }"
                style={{ flex: 1, minHeight: 0 }}
                onChange={(e) => onUpdate({ gqlQuery: e.target.value })}
              />
              <div style={{ padding: '6px 10px', fontSize: 10, color: 'var(--muted)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>VARIABLES (JSON)</div>
              <textarea
                className="code-editor"
                value={request.gqlVars}
                placeholder='{"id": 1}'
                style={{ height: 100, flexShrink: 0 }}
                onChange={(e) => onUpdate({ gqlVars: e.target.value })}
              />
            </div>
          )}
        </div>
      )}

      {/* Script Tab */}
      {activeTab === 'script' && (
        <div className="tab-content active" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>Post-response Script (optional)</div>
            <div>
              <button
                className="add-row-btn"
                onClick={() => onUpdate({ script: getScriptTemplate() })}
              >
                Insert Example
              </button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
            Write JavaScript that runs after a response arrives. Use <span style={{ fontFamily: 'monospace' }}>set(key, value)</span> to store environment variables, and <span style={{ fontFamily: 'monospace' }}>log()</span> to add script logs.
          </div>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CodeEditor
              value={request.script || ''}
              onChange={(script) => onUpdate({ script })}
              language={'javascript'}
              themeKind={themeKind}
              placeholder={'// Example: vars[\'token\'] = response.body.access_token;'}
            />
          </div>
        </div>
      )}

      {/* Auth Tab */}
      {activeTab === 'auth' && (
        <div className="tab-content active scroll-area">
          <AuthPanel
            authType={request.authType}
            authData={request.authData}
            environment={environment}
            onAuthTypeChange={(authType) => onUpdate({ authType })}
            onAuthDataChange={(authData) => onUpdate({ authData: { ...request.authData, ...authData } })}
          />
        </div>
      )}

      {/* Script tab removed */}
    </div>
  );
};

/* ─── Auth Panel ─────────────────────────────────── */
interface AuthPanelProps {
  authType: AuthType;
  authData: RequestState['authData'];
  environment?: Environment | null;
  onAuthTypeChange: (type: AuthType) => void;
  onAuthDataChange: (data: Partial<RequestState['authData']>) => void;
}


const AuthPanel: React.FC<AuthPanelProps> = ({ authType, authData, environment, onAuthTypeChange, onAuthDataChange }) => {
  const [showPassword, setShowPassword] = useState(false);
  return (
  <div style={{ padding: 12 }}>
    <label className="field-label">Auth Type</label>
    <AuthTypeDropdown authType={authType} onChange={onAuthTypeChange} />

    {authType === 'bearer' && (
      <div className="auth-fields">
        <label className="field-label" style={{ marginTop: 8 }}>Token</label>
        <div style={{ position: 'relative' }}>
          <VariableTextInput
            value={authData.token || ''}
            placeholder="your_token_here or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ token: v })}
            variables={environment?.variables}
            className="auth-input"
          />
        </div>
      </div>
    )}

    {authType === 'basic' && (
      <div className="auth-fields">
        <label className="field-label" style={{ marginTop: 8 }}>Username</label>
        <div style={{ position: 'relative' }}>
          <VariableTextInput
            value={authData.username || ''}
            placeholder="username or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ username: v })}
            variables={environment?.variables}
            className="auth-input"
          />
        </div>
        <label className="field-label" style={{ marginTop: 8 }}>Password</label>
        <div style={{ position: 'relative' }}>
          <VariableTextInput
            value={authData.password || ''}
            placeholder="password or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ password: v })}
            variables={environment?.variables}
            className="auth-input"
            type={showPassword ? 'text' : 'password'}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            title={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--muted)', padding: 2, lineHeight: 1,
            }}
          >
            <Icon icon={showPassword ? faEyeSlash : faEye} size={12} />
          </button>
        </div>
      </div>
    )}

    {authType === 'apikey' && (
      <div className="auth-fields">
        <label className="field-label">Key Name</label>
        <VariableTextInput
          value={authData.keyName || ''}
          placeholder="X-API-Key or {{variable_name}}"
          onChange={(v) => onAuthDataChange({ keyName: v })}
          variables={environment?.variables}
          className="auth-input"
        />
        <label className="field-label" style={{ marginTop: 8 }}>Key Value</label>
        <div style={{ position: 'relative' }}>
          <VariableTextInput
            value={authData.keyValue || ''}
            placeholder="api_key_value or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ keyValue: v })}
            variables={environment?.variables}
            className="auth-input"
          />
        </div>
        <label className="field-label" style={{ marginTop: 8 }}>Add To</label>
        <AddToDropdown value={authData.addTo || 'header'} onChange={(v) => onAuthDataChange({ addTo: v })} />
      </div>
)}
  </div>
  );
};
