function getMainPanelHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Restify</title>
<style>
:root {
  --bg: var(--vscode-editor-background, #1e1e2e);
  --fg: var(--vscode-editor-foreground, #cdd6f4);
  --border: var(--vscode-panel-border, #313244);
  --input-bg: var(--vscode-input-background, #181825);
  --input-fg: var(--vscode-input-foreground, #cdd6f4);
  --accent: #89b4fa;
  --accent-2: #cba6f7;
  --surface: #181825;
  --surface-2: #313244;
  --hover: #313244;
  --muted: #6c7086;
  --tag-get: #a6e3a1;
  --tag-post: #fab387;
  --tag-put: #89dceb;
  --tag-delete: #f38ba8;
  --tag-patch: #f9e2af;
  --tag-head: #cba6f7;
  --tag-opt: #94e2d5;
  --success: #a6e3a1;
  --warning: #f9e2af;
  --error: #f38ba8;
  --radius: 6px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
  font-size: 13px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* ─── Top Bar ─────────────────────── */
.top-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}
.brand {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  flex-shrink: 0;
}
.request-name-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--muted);
  font-size: 12px;
  outline: none;
  padding: 3px 6px;
}
.request-name-input:focus { color: var(--fg); }
.request-name-input::placeholder { color: var(--muted); }
.env-selector {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 4px 28px 4px 10px;
  border-radius: var(--radius);
  font-size: 11px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236c7086'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
}
.env-selector:focus { border-color: var(--accent); }
/* ─── URL Bar ─────────────────────── */
.url-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.method-select {
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--fg);
  padding: 7px 28px 7px 10px;
  border-radius: var(--radius);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236c7086'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  min-width: 90px;
}
.method-select:focus { border-color: var(--accent); }
.method-select.m-GET { color: var(--tag-get); }
.method-select.m-POST { color: var(--tag-post); }
.method-select.m-PUT { color: var(--tag-put); }
.method-select.m-DELETE { color: var(--tag-delete); }
.method-select.m-PATCH { color: var(--tag-patch); }
.method-select.m-HEAD { color: var(--tag-head); }
.method-select.m-OPTIONS { color: var(--tag-opt); }
.url-input {
  flex: 1;
  background: var(--input-bg);
  border: 1px solid var(--border);
  color: var(--input-fg);
  padding: 7px 12px;
  border-radius: var(--radius);
  font-size: 13px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  outline: none;
  transition: border-color .15s;
}
.url-input:focus { border-color: var(--accent); }
.url-input::placeholder { color: var(--muted); }
.send-btn {
  background: var(--accent);
  color: #1e1e2e;
  border: none;
  padding: 7px 18px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s;
  letter-spacing: .3px;
  white-space: nowrap;
}
.send-btn:hover { background: color-mix(in srgb, var(--accent) 85%, white); }
.send-btn:active { transform: scale(.97); }
.send-btn:disabled { opacity: .5; cursor: not-allowed; }
.save-btn {
  background: var(--surface-2);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 7px 12px;
  border-radius: var(--radius);
  font-size: 12px;
  cursor: pointer;
  transition: all .15s;
}
.save-btn:hover { background: var(--hover); }
/* ─── Main Split ──────────────────── */
.main-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.split-pane {
  flex: 1;
  display: flex;
  overflow: hidden;
}
/* ─── Tabs ────────────────────────── */
.tab-bar {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
  padding: 0 14px;
  background: var(--surface);
  flex-shrink: 0;
  gap: 2px;
}
.tab {
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--muted);
  border-bottom: 2px solid transparent;
  transition: all .15s;
  user-select: none;
  white-space: nowrap;
}
.tab:hover { color: var(--fg); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-badge {
  display: inline-block;
  background: var(--accent);
  color: #1e1e2e;
  font-size: 9px;
  padding: 0 4px;
  border-radius: 8px;
  margin-left: 4px;
  font-weight: 700;
  vertical-align: middle;
}
/* ─── Request Panels ──────────────── */
.request-pane {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  min-width: 0;
}
.response-pane {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.tab-content { display: none; flex: 1; overflow: hidden; flex-direction: column; }
.tab-content.active { display: flex; }
/* ─── Key-Value Table ─────────────── */
.kv-table {
  width: 100%;
  border-collapse: collapse;
}
.kv-table th {
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  padding: 6px 8px;
  text-transform: uppercase;
  letter-spacing: .5px;
  border-bottom: 1px solid var(--border);
}
.kv-row {
  display: flex;
  align-items: center;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
}
.kv-row:last-child { border-bottom: none; }
.kv-check {
  padding: 0 6px;
  flex-shrink: 0;
}
.kv-check input[type=checkbox] { cursor: pointer; accent-color: var(--accent); }
.kv-input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--fg);
  padding: 6px 8px;
  font-size: 12px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  outline: none;
  border-right: 1px solid color-mix(in srgb, var(--border) 40%, transparent);
  min-width: 0;
}
.kv-input:last-of-type { border-right: none; }
.kv-input:focus { background: color-mix(in srgb, var(--accent) 5%, transparent); }
.kv-del {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 4px 8px;
  font-size: 14px;
  transition: color .1s;
  flex-shrink: 0;
}
.kv-del:hover { color: var(--error); }
.add-row-btn {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 11px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  transition: opacity .15s;
}
.add-row-btn:hover { opacity: .8; }
/* ─── Body Editor ─────────────────── */
.body-type-bar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 4px;
}
.body-type-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--muted);
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all .15s;
}
.body-type-btn:hover { color: var(--fg); border-color: var(--border); }
.body-type-btn.active {
  background: var(--surface-2);
  color: var(--fg);
  border-color: var(--border);
}
.code-editor {
  flex: 1;
  background: var(--input-bg);
  border: none;
  color: var(--input-fg);
  padding: 10px 14px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  resize: none;
  outline: none;
  line-height: 1.6;
  tab-size: 2;
}
.scroll-area {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
.scroll-area::-webkit-scrollbar { width: 5px; }
.scroll-area::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
/* ─── Response ────────────────────── */
.response-status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex-shrink: 0;
}
.status-code {
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;
}
.status-2xx { color: var(--success); background: color-mix(in srgb, var(--success) 15%, transparent); }
.status-3xx { color: var(--warning); background: color-mix(in srgb, var(--warning) 15%, transparent); }
.status-4xx { color: var(--error); background: color-mix(in srgb, var(--error) 15%, transparent); }
.status-5xx { color: var(--error); background: color-mix(in srgb, var(--error) 15%, transparent); }
.status-text { color: var(--muted); font-size: 12px; }
.meta-chip {
  font-size: 11px;
  color: var(--muted);
  padding: 2px 8px;
  background: var(--surface-2);
  border-radius: 4px;
}
.response-body {
  flex: 1;
  background: var(--input-bg);
  color: var(--input-fg);
  padding: 12px 14px;
  font-family: 'Cascadia Code', 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.7;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
.response-body::-webkit-scrollbar { width: 5px; height: 5px; }
.response-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
.response-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  gap: 10px;
}
.response-empty .icon { font-size: 40px; opacity: .3; }
/* ─── Loading ─────────────────────── */
.loading-bar {
  height: 2px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2), var(--accent));
  background-size: 200% 100%;
  animation: loading 1.2s linear infinite;
  display: none;
}
.loading-bar.active { display: block; }
@keyframes loading {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
/* ─── JSON Highlighting ───────────── */
.json-string { color: #a6e3a1; }
.json-number { color: #fab387; }
.json-bool { color: #89dceb; }
.json-null { color: #f38ba8; }
.json-key { color: #cba6f7; }
/* ─── Resizer ─────────────────────── */
.resizer {
  width: 4px;
  cursor: col-resize;
  background: var(--border);
  flex-shrink: 0;
  transition: background .15s;
}
.resizer:hover { background: var(--accent); }
/* ─── Misc ────────────────────────── */
.ssl-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted);
  background: var(--surface);
  flex-shrink: 0;
}
.ssl-row label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.ssl-row input[type=checkbox] { accent-color: var(--accent); }
.copy-btn {
  margin-left: auto;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--muted);
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  transition: all .15s;
}
.copy-btn:hover { color: var(--fg); background: var(--hover); }
/* ─── Modal ───────────────────────── */
.modal-overlay {
  display: none; position: fixed; inset: 0;
  background: rgba(0,0,0,.6); z-index: 200;
  align-items: center; justify-content: center;
}
.modal-overlay.open { display: flex; }
.modal {
  background: var(--vscode-editor-background, #1e1e2e);
  border: 1px solid var(--border);
  border-radius: 8px; padding: 18px;
  width: 340px;
  box-shadow: 0 20px 60px rgba(0,0,0,.6);
}
.modal h3 { font-size: 14px; margin-bottom: 14px; }
.modal label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 4px; }
.modal input, .modal select {
  width: 100%; background: var(--input-bg); border: 1px solid var(--border);
  color: var(--fg); padding: 7px 10px; border-radius: var(--radius); font-size: 12px; outline: none; margin-bottom: 10px;
}
.modal input:focus, .modal select:focus { border-color: var(--accent); }
.modal-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 6px; }
.btn { background: var(--accent); color: #1e1e2e; border: none; padding: 6px 14px; border-radius: var(--radius); font-size: 12px; font-weight: 700; cursor: pointer; }
.btn:hover { opacity: .85; }
.btn-ghost { background: transparent; color: var(--fg); border: 1px solid var(--border); padding: 6px 14px; border-radius: var(--radius); font-size: 12px; cursor: pointer; }
.btn-ghost:hover { background: var(--hover); }
</style>
</head>
<body>

<!-- Top Bar -->
<div class="top-bar">
  <div class="brand">⚡ Restify</div>
  <input class="request-name-input" id="req-name" placeholder="Untitled Request" type="text">
  <select class="env-selector" id="env-select" onchange="onEnvChange(this.value)">
    <option value="">No Environment</option>
  </select>
</div>

<!-- Loading bar -->
<div class="loading-bar" id="loading-bar"></div>

<!-- URL Bar -->
<div class="url-bar">
  <select class="method-select m-GET" id="method-select" onchange="onMethodChange(this.value)">
    <option>GET</option>
    <option>POST</option>
    <option>PUT</option>
    <option>PATCH</option>
    <option>DELETE</option>
    <option>HEAD</option>
    <option>OPTIONS</option>
  </select>
  <input class="url-input" id="url-input" placeholder="https://api.example.com/endpoint" type="text"
    onkeydown="if(event.key==='Enter') sendRequest()">
  <button class="save-btn" onclick="showSaveModal()">💾 Save</button>
  <button class="send-btn" id="send-btn" onclick="sendRequest()">Send →</button>
</div>

<!-- SSL toggle -->
<div class="ssl-row">
  <label title="Allow self-signed and untrusted certificates">
    <input type="checkbox" id="ssl-bypass" checked>
    Allow self-signed certs
  </label>
  <span style="font-size:10px;opacity:.5">Useful for local dev / internal APIs</span>
</div>

<!-- Main Split Area -->
<div class="main-area">
  <div class="split-pane" id="split-pane">

    <!-- Request Pane -->
    <div class="request-pane" id="req-pane">
      <div class="tab-bar" id="req-tabs">
        <div class="tab active" onclick="switchTab('req','params')">Params <span id="params-badge" class="tab-badge" style="display:none">0</span></div>
        <div class="tab" onclick="switchTab('req','headers')">Headers <span id="headers-badge" class="tab-badge" style="display:none">0</span></div>
        <div class="tab" onclick="switchTab('req','body')">Body</div>
        <div class="tab" onclick="switchTab('req','auth')">Auth</div>
      </div>

      <!-- Params Tab -->
      <div class="tab-content active scroll-area" id="req-tab-params">
        <div id="params-list"></div>
        <button class="add-row-btn" onclick="addKvRow('params')">+ Add Parameter</button>
      </div>

      <!-- Headers Tab -->
      <div class="tab-content scroll-area" id="req-tab-headers">
        <div id="headers-list"></div>
        <button class="add-row-btn" onclick="addKvRow('headers')">+ Add Header</button>
      </div>

      <!-- Body Tab -->
      <div class="tab-content" id="req-tab-body">
        <div class="body-type-bar">
          <button class="body-type-btn active" onclick="setBodyType('none')">none</button>
          <button class="body-type-btn" onclick="setBodyType('json')">JSON</button>
          <button class="body-type-btn" onclick="setBodyType('form')">Form</button>
          <button class="body-type-btn" onclick="setBodyType('text')">Text</button>
          <button class="body-type-btn" onclick="setBodyType('xml')">XML</button>
          <button class="body-type-btn" onclick="setBodyType('graphql')">GraphQL</button>
        </div>
        <div id="body-none" style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:12px">
          This request has no body
        </div>
        <textarea class="code-editor" id="body-editor" placeholder="Enter request body..." style="display:none"></textarea>
        <div id="body-form" style="display:none;flex-direction:column;flex:1;overflow:hidden">
          <div class="scroll-area" style="flex:1">
            <div id="form-list"></div>
            <button class="add-row-btn" onclick="addKvRow('form')">+ Add Field</button>
          </div>
        </div>
        <div id="body-graphql" style="display:none;flex-direction:column;flex:1;overflow:hidden">
          <div style="padding:6px 10px;font-size:10px;color:var(--muted);border-bottom:1px solid var(--border)">QUERY</div>
          <textarea class="code-editor" id="gql-query" placeholder="{ users { id name } }" style="flex:1;min-height:0"></textarea>
          <div style="padding:6px 10px;font-size:10px;color:var(--muted);border-bottom:1px solid var(--border);border-top:1px solid var(--border)">VARIABLES (JSON)</div>
          <textarea class="code-editor" id="gql-vars" placeholder='{"id": 1}' style="height:100px;flex-shrink:0"></textarea>
        </div>
      </div>

      <!-- Auth Tab -->
      <div class="tab-content scroll-area" id="req-tab-auth">
        <div style="padding:12px">
          <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:6px">Auth Type</label>
          <select id="auth-type" style="background:var(--surface-2);border:1px solid var(--border);color:var(--fg);padding:6px 10px;border-radius:var(--radius);font-size:12px;outline:none;width:100%;margin-bottom:12px" onchange="renderAuth()">
            <option value="none">No Auth</option>
            <option value="bearer">Bearer Token</option>
            <option value="basic">Basic Auth</option>
            <option value="apikey">API Key</option>
          </select>
          <div id="auth-fields"></div>
        </div>
      </div>
    </div>

    <!-- Resizer -->
    <div class="resizer" id="resizer"></div>

    <!-- Response Pane -->
    <div class="response-pane" id="res-pane">
      <div class="response-status-bar" id="res-status-bar" style="display:none">
        <span class="status-code" id="res-status-code"></span>
        <span class="status-text" id="res-status-text"></span>
        <span class="meta-chip" id="res-time"></span>
        <span class="meta-chip" id="res-size"></span>
        <button class="copy-btn" onclick="copyResponse()">Copy</button>
      </div>

      <div class="tab-bar" id="res-tabs" style="display:none">
        <div class="tab active" onclick="switchTab('res','body')">Body</div>
        <div class="tab" onclick="switchTab('res','headers')">Headers</div>
        <div class="tab" onclick="switchTab('res','raw')">Raw</div>
      </div>

      <div class="tab-content active" id="res-tab-body" style="flex:1;overflow:hidden">
        <div class="response-empty" id="res-empty">
          <div class="icon">→</div>
          <div>Send a request to see the response</div>
          <div style="font-size:11px;opacity:.5">Results will appear here</div>
        </div>
        <pre class="response-body" id="res-body" style="display:none"></pre>
      </div>

      <div class="tab-content" id="res-tab-headers" style="flex:1;overflow:hidden">
        <div class="scroll-area" style="flex:1">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="border-bottom:1px solid var(--border)">
                <th style="text-align:left;padding:7px 12px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px">Header</th>
                <th style="text-align:left;padding:7px 12px;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px">Value</th>
              </tr>
            </thead>
            <tbody id="res-headers-table"></tbody>
          </table>
        </div>
      </div>

      <div class="tab-content" id="res-tab-raw" style="flex:1;overflow:hidden">
        <pre class="response-body" id="res-raw" style="display:flex"></pre>
      </div>
    </div>
  </div>
</div>

<!-- Save Modal -->
<div class="modal-overlay" id="save-modal">
  <div class="modal">
    <h3>Save to Collection</h3>
    <label>Request Name</label>
    <input id="save-req-name" placeholder="My Request">
    <label>Collection</label>
    <select id="save-collection-select">
      <option value="__new__">+ New Collection</option>
    </select>
    <div id="new-col-wrap">
      <label>New Collection Name</label>
      <input id="new-col-name" placeholder="My Collection">
    </div>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="doSave()">Save</button>
    </div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();

// ─── State ─────────────────────────────────────────────────
let state = {
  method: 'GET',
  url: '',
  name: '',
  queryParams: [],
  headers: [],
  bodyType: 'none',
  body: '',
  formData: [],
  gqlQuery: '',
  gqlVars: '',
  authType: 'none',
  authData: {},
  rejectUnauthorized: false,
  environments: [],
  activeEnvId: null,
  collections: []
};

let currentResponse = null;
let isLoading = false;

// ─── Init ──────────────────────────────────────────────────
addKvRow('params');
addKvRow('headers');
renderAuth();

// ─── Message Handling ──────────────────────────────────────
window.addEventListener('message', e => {
  const msg = e.data;
  switch(msg.command) {
    case 'loadRequest':
      loadRequestData(msg.data);
      break;
    case 'requestStart':
      onRequestStart();
      break;
    case 'requestComplete':
      onRequestComplete(msg.response);
      break;
    case 'requestError':
      onRequestError(msg.error, msg.duration);
      break;
    case 'setEnvironments':
      state.environments = msg.environments || [];
      state.activeEnvId = msg.activeEnvId;
      renderEnvSelector();
      break;
    case 'collections':
      state.collections = msg.data || [];
      populateSaveModal();
      break;
  }
});

// ─── Method ────────────────────────────────────────────────
function onMethodChange(val) {
  state.method = val;
  const sel = document.getElementById('method-select');
  sel.className = 'method-select m-' + val;
}

// ─── Environment ───────────────────────────────────────────
function renderEnvSelector() {
  const sel = document.getElementById('env-select');
  sel.innerHTML = '<option value="">No Environment</option>';
  state.environments.forEach(env => {
    const opt = document.createElement('option');
    opt.value = env.id;
    opt.textContent = env.name;
    if (env.id === state.activeEnvId) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onEnvChange(id) {
  state.activeEnvId = id;
  vscode.postMessage({ command: 'setActiveEnvironment', id });
}

// ─── KV Row Management ─────────────────────────────────────
function buildKvRow(listId, item, idx) {
  const row = document.createElement('div');
  row.className = 'kv-row';
  row.dataset.idx = idx;
  row.innerHTML = \`
    <div class="kv-check"><input type="checkbox" \${item.enabled !== false ? 'checked' : ''} onchange="updateKv('\${listId}', \${idx}, 'enabled', this.checked)"></div>
    <input class="kv-input" placeholder="Key" value="\${escHtml(item.key||'')}" oninput="updateKv('\${listId}', \${idx}, 'key', this.value); updateBadge()">
    <input class="kv-input" placeholder="Value" value="\${escHtml(item.value||'')}" oninput="updateKv('\${listId}', \${idx}, 'value', this.value)">
    <button class="kv-del" onclick="delKvRow('\${listId}', \${idx})">×</button>
  \`;
  return row;
}

function addKvRow(type) {
  if (type === 'params') {
    state.queryParams.push({ key: '', value: '', enabled: true });
    renderKvList('params-list', state.queryParams);
  } else if (type === 'headers') {
    state.headers.push({ key: '', value: '', enabled: true });
    renderKvList('headers-list', state.headers);
  } else if (type === 'form') {
    state.formData.push({ key: '', value: '', enabled: true });
    renderKvList('form-list', state.formData);
  }
}

function delKvRow(type, idx) {
  if (type === 'params-list') { state.queryParams.splice(idx, 1); renderKvList('params-list', state.queryParams); }
  else if (type === 'headers-list') { state.headers.splice(idx, 1); renderKvList('headers-list', state.headers); }
  else if (type === 'form-list') { state.formData.splice(idx, 1); renderKvList('form-list', state.formData); }
  updateBadge();
}

function updateKv(listId, idx, field, value) {
  if (listId === 'params-list') state.queryParams[idx][field] = value;
  else if (listId === 'headers-list') state.headers[idx][field] = value;
  else if (listId === 'form-list') state.formData[idx][field] = value;
}

function renderKvList(listId, items) {
  const container = document.getElementById(listId);
  if (!container) return;
  container.innerHTML = '';
  items.forEach((item, idx) => {
    container.appendChild(buildKvRow(listId, item, idx));
  });
}

function updateBadge() {
  const activePArr = state.queryParams.filter(p => p.key && p.enabled !== false);
  const activeHArr = state.headers.filter(h => h.key && h.enabled !== false);
  const pb = document.getElementById('params-badge');
  const hb = document.getElementById('headers-badge');
  if (pb) { pb.textContent = activePArr.length; pb.style.display = activePArr.length > 0 ? '' : 'none'; }
  if (hb) { hb.textContent = activeHArr.length; hb.style.display = activeHArr.length > 0 ? '' : 'none'; }
}

// ─── Body Type ─────────────────────────────────────────────
function setBodyType(type) {
  state.bodyType = type;
  document.querySelectorAll('.body-type-btn').forEach((b,i) => {
    const types = ['none','json','form','text','xml','graphql'];
    b.classList.toggle('active', types[i] === type);
  });
  document.getElementById('body-none').style.display = type === 'none' ? 'flex' : 'none';
  document.getElementById('body-editor').style.display = ['json','text','xml'].includes(type) ? 'flex' : 'none';
  document.getElementById('body-form').style.display = type === 'form' ? 'flex' : 'none';
  document.getElementById('body-graphql').style.display = type === 'graphql' ? 'flex' : 'none';

  if (type === 'json' && !document.getElementById('body-editor').value) {
    document.getElementById('body-editor').value = '{\\n  \\n}';
  }
}

// ─── Auth ──────────────────────────────────────────────────
function renderAuth() {
  const type = document.getElementById('auth-type').value;
  state.authType = type;
  const container = document.getElementById('auth-fields');
  if (type === 'none') { container.innerHTML = ''; return; }
  if (type === 'bearer') {
    container.innerHTML = \`<label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Token</label>
      <input id="auth-token" style="width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:7px 10px;border-radius:var(--radius);font-size:12px;font-family:monospace;outline:none;" placeholder="eyJhbGciOiJSUzI1NiJ9..." value="\${escHtml(state.authData.token||'')}" oninput="state.authData.token=this.value">\`;
  } else if (type === 'basic') {
    container.innerHTML = \`<label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Username</label>
      <input style="width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:7px 10px;border-radius:var(--radius);font-size:12px;outline:none;margin-bottom:8px" placeholder="username" value="\${escHtml(state.authData.username||'')}" oninput="state.authData.username=this.value">
      <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Password</label>
      <input type="password" style="width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:7px 10px;border-radius:var(--radius);font-size:12px;outline:none" placeholder="••••••••" value="\${escHtml(state.authData.password||'')}" oninput="state.authData.password=this.value">\`;
  } else if (type === 'apikey') {
    container.innerHTML = \`<label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Key Name</label>
      <input style="width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:7px 10px;border-radius:var(--radius);font-size:12px;outline:none;margin-bottom:8px" placeholder="X-API-Key" value="\${escHtml(state.authData.keyName||'')}" oninput="state.authData.keyName=this.value">
      <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Key Value</label>
      <input style="width:100%;background:var(--input-bg);border:1px solid var(--border);color:var(--fg);padding:7px 10px;border-radius:var(--radius);font-size:12px;font-family:monospace;outline:none;margin-bottom:8px" placeholder="api_key_value" value="\${escHtml(state.authData.keyValue||'')}" oninput="state.authData.keyValue=this.value">
      <label style="font-size:11px;color:var(--muted);display:block;margin-bottom:4px">Add to</label>
      <select style="width:100%;background:var(--surface-2);border:1px solid var(--border);color:var(--fg);padding:7px 10px;border-radius:var(--radius);font-size:12px;outline:none" onchange="state.authData.addTo=this.value">
        <option value="header" \${state.authData.addTo==='header'?'selected':''}>Header</option>
        <option value="query" \${state.authData.addTo==='query'?'selected':''}>Query Param</option>
      </select>\`;
  }
}

// ─── Build request payload ─────────────────────────────────
function buildRequest() {
  // Apply auth to headers/params
  const headers = [...state.headers];
  const queryParams = [...state.queryParams];

  if (state.authType === 'bearer' && state.authData.token) {
    headers.push({ key: 'Authorization', value: 'Bearer ' + state.authData.token, enabled: true });
  } else if (state.authType === 'basic' && state.authData.username) {
    const creds = btoa(state.authData.username + ':' + (state.authData.password || ''));
    headers.push({ key: 'Authorization', value: 'Basic ' + creds, enabled: true });
  } else if (state.authType === 'apikey' && state.authData.keyName) {
    if (state.authData.addTo === 'query') {
      queryParams.push({ key: state.authData.keyName, value: state.authData.keyValue || '', enabled: true });
    } else {
      headers.push({ key: state.authData.keyName, value: state.authData.keyValue || '', enabled: true });
    }
  }

  let body = document.getElementById('body-editor').value;
  if (state.bodyType === 'graphql') {
    const gqlQuery = document.getElementById('gql-query').value;
    const gqlVars = document.getElementById('gql-vars').value;
    body = JSON.stringify({ query: gqlQuery, variables: gqlVars ? JSON.parse(gqlVars) : undefined });
    headers.push({ key: 'Content-Type', value: 'application/json', enabled: true });
  }

  const sslBypass = document.getElementById('ssl-bypass').checked;

  return {
    name: document.getElementById('req-name').value || state.url,
    method: document.getElementById('method-select').value,
    url: document.getElementById('url-input').value,
    headers,
    queryParams,
    bodyType: state.bodyType === 'graphql' ? 'json' : state.bodyType,
    body,
    formData: state.formData,
    rejectUnauthorized: !sslBypass
  };
}

// ─── Send Request ──────────────────────────────────────────
function sendRequest() {
  if (isLoading) return;
  const url = document.getElementById('url-input').value.trim();
  if (!url) { document.getElementById('url-input').focus(); return; }

  const req = buildRequest();
  vscode.postMessage({ command: 'executeRequest', request: req });
}

function onRequestStart() {
  isLoading = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('send-btn').textContent = 'Sending...';
  document.getElementById('loading-bar').classList.add('active');
  document.getElementById('res-empty').style.display = 'flex';
  document.getElementById('res-body').style.display = 'none';
  document.getElementById('res-status-bar').style.display = 'none';
  document.getElementById('res-tabs').style.display = 'none';
}

function onRequestComplete(response) {
  isLoading = false;
  currentResponse = response;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('send-btn').textContent = 'Send →';
  document.getElementById('loading-bar').classList.remove('active');

  // Status bar
  const statusEl = document.getElementById('res-status-code');
  const code = response.status;
  statusEl.textContent = code;
  statusEl.className = 'status-code ' + (code < 300 ? 'status-2xx' : code < 400 ? 'status-3xx' : code < 500 ? 'status-4xx' : 'status-5xx');
  document.getElementById('res-status-text').textContent = response.statusText || '';
  document.getElementById('res-time').textContent = response.duration + 'ms';
  document.getElementById('res-size').textContent = formatBytes(response.size || 0);
  document.getElementById('res-status-bar').style.display = 'flex';
  document.getElementById('res-tabs').style.display = 'flex';

  // Body
  const body = response.body || '';
  document.getElementById('res-raw').textContent = body;
  document.getElementById('res-empty').style.display = 'none';

  const bodyEl = document.getElementById('res-body');
  bodyEl.style.display = 'block';

  // Try JSON pretty print
  const ct = (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) || '';
  if (ct.includes('json') || (body.trimStart().startsWith('{') || body.trimStart().startsWith('['))) {
    try {
      const parsed = JSON.parse(body);
      bodyEl.innerHTML = syntaxHighlight(JSON.stringify(parsed, null, 2));
    } catch(e) {
      bodyEl.textContent = body;
    }
  } else {
    bodyEl.textContent = body;
  }

  // Response headers
  const headersTable = document.getElementById('res-headers-table');
  headersTable.innerHTML = '';
  if (response.headers) {
    Object.entries(response.headers).forEach(([k, v]) => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid color-mix(in srgb, var(--border) 40%, transparent)';
      tr.innerHTML = \`<td style="padding:6px 12px;color:var(--accent);font-family:monospace;font-size:11px;vertical-align:top;white-space:nowrap">\${escHtml(k)}</td>
                      <td style="padding:6px 12px;font-size:11px;word-break:break-all;font-family:monospace;color:var(--fg)">\${escHtml(String(v))}</td>\`;
      headersTable.appendChild(tr);
    });
  }
}

function onRequestError(error, duration) {
  isLoading = false;
  document.getElementById('send-btn').disabled = false;
  document.getElementById('send-btn').textContent = 'Send →';
  document.getElementById('loading-bar').classList.remove('active');
  document.getElementById('res-status-bar').style.display = 'flex';
  document.getElementById('res-tabs').style.display = 'flex';
  document.getElementById('res-empty').style.display = 'none';
  document.getElementById('res-status-code').textContent = 'ERR';
  document.getElementById('res-status-code').className = 'status-code status-4xx';
  document.getElementById('res-status-text').textContent = error;
  document.getElementById('res-time').textContent = (duration || 0) + 'ms';
  document.getElementById('res-size').textContent = '—';
  const bodyEl = document.getElementById('res-body');
  bodyEl.style.display = 'block';
  bodyEl.textContent = '⚠ ' + error;
}

// ─── Load Request from History/Collection ─────────────────
function loadRequestData(data) {
  if (!data) return;
  if (data.method) {
    document.getElementById('method-select').value = data.method;
    onMethodChange(data.method);
  }
  if (data.url) document.getElementById('url-input').value = data.url;
  if (data.name) document.getElementById('req-name').value = data.name;

  state.queryParams = data.queryParams || [];
  state.headers = data.headers || [];
  state.formData = data.formData || [];
  state.authType = data.authType || 'none';
  state.authData = data.authData || {};
  state.bodyType = data.bodyType || 'none';

  renderKvList('params-list', state.queryParams);
  renderKvList('headers-list', state.headers);
  renderKvList('form-list', state.formData);
  updateBadge();
  setBodyType(data.bodyType || 'none');

  if (data.body) document.getElementById('body-editor').value = data.body;
  if (data.gqlQuery) document.getElementById('gql-query').value = data.gqlQuery;
  if (data.gqlVars) document.getElementById('gql-vars').value = data.gqlVars;

  document.getElementById('auth-type').value = state.authType;
  renderAuth();
  if (state.authType === 'bearer' && state.authData.token) {
    setTimeout(() => { const el = document.getElementById('auth-token'); if (el) el.value = state.authData.token; }, 50);
  }

  const sslEl = document.getElementById('ssl-bypass');
  if (sslEl) sslEl.checked = data.rejectUnauthorized === false || data.rejectUnauthorized === undefined ? true : false;
}

// ─── Tabs ──────────────────────────────────────────────────
function switchTab(pane, tab) {
  const prefix = pane === 'req' ? 'req-tab-' : 'res-tab-';
  const tabBarId = pane === 'req' ? 'req-tabs' : 'res-tabs';

  document.querySelectorAll('#' + tabBarId + ' .tab').forEach((t, i) => {
    const tabNames = pane === 'req' ? ['params','headers','body','auth'] : ['body','headers','raw'];
    t.classList.toggle('active', tabNames[i] === tab);
  });
  document.querySelectorAll('[id^="' + prefix + '"]').forEach(el => {
    el.classList.toggle('active', el.id === prefix + tab);
  });
}

// ─── Save Modal ────────────────────────────────────────────
function showSaveModal() {
  vscode.postMessage({ command: 'getCollections' });
  document.getElementById('save-req-name').value = document.getElementById('req-name').value || document.getElementById('url-input').value;
  document.getElementById('save-modal').classList.add('open');
}

function populateSaveModal() {
  const sel = document.getElementById('save-collection-select');
  if (!sel) return;
  const current = sel.value;
  sel.innerHTML = '<option value="__new__">+ New Collection</option>';
  state.collections.forEach(col => {
    const opt = document.createElement('option');
    opt.value = col.name;
    opt.textContent = col.name;
    sel.appendChild(opt);
  });
  sel.value = current || '__new__';
  updateNewColVisibility();
}

document.getElementById('save-collection-select').addEventListener('change', updateNewColVisibility);

function updateNewColVisibility() {
  const sel = document.getElementById('save-collection-select');
  document.getElementById('new-col-wrap').style.display = sel.value === '__new__' ? 'block' : 'none';
}

function closeModal() {
  document.getElementById('save-modal').classList.remove('open');
}

function doSave() {
  const reqName = document.getElementById('save-req-name').value.trim();
  const colSel = document.getElementById('save-collection-select').value;
  const colName = colSel === '__new__' ? document.getElementById('new-col-name').value.trim() : colSel;
  if (!colName) return;
  const req = buildRequest();
  req.name = reqName || req.url;
  vscode.postMessage({ command: 'saveToCollection', request: req, collectionName: colName });
  closeModal();
}

document.getElementById('save-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('save-modal')) closeModal();
});

// ─── Resizer ───────────────────────────────────────────────
(function() {
  const resizer = document.getElementById('resizer');
  const reqPane = document.getElementById('req-pane');
  const resPane = document.getElementById('res-pane');
  let dragging = false, startX = 0, startW = 0;

  resizer.addEventListener('mousedown', e => {
    dragging = true;
    startX = e.clientX;
    startW = reqPane.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const total = document.getElementById('split-pane').offsetWidth;
    const newW = Math.max(250, Math.min(total - 250, startW + delta));
    reqPane.style.flex = 'none';
    reqPane.style.width = newW + 'px';
  });

  document.addEventListener('mouseup', () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
})();

// ─── Utils ─────────────────────────────────────────────────
function syntaxHighlight(json) {
  return json.replace(/("(\\\\u[a-zA-Z0-9]{4}|\\\\[^u]|[^\\\\"])*"(\\s*:)?|\\b(true|false|null)\\b|-?\\d+(?:\\.\\d*)?(?:[eE][+\\-]?\\d+)?)/g, function(match) {
    let cls = 'json-number';
    if (/^"/.test(match)) {
      if (/:$/.test(match)) { cls = 'json-key'; }
      else { cls = 'json-string'; }
    } else if (/true|false/.test(match)) { cls = 'json-bool'; }
    else if (/null/.test(match)) { cls = 'json-null'; }
    return '<span class="' + cls + '">' + match + '</span>';
  });
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}

function copyResponse() {
  if (!currentResponse) return;
  navigator.clipboard.writeText(currentResponse.body || '');
}

function escHtml(s) {
  if (typeof s !== 'string') s = String(s || '');
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
</script>
</body>
</html>`;
}

module.exports = { getMainPanelHtml };
