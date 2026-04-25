function getSidebarHtml(type) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-sideBar-background, #1e1e2e);
    --fg: var(--vscode-sideBar-foreground, #cdd6f4);
    --border: var(--vscode-panel-border, #313244);
    --input-bg: var(--vscode-input-background, #181825);
    --accent: var(--vscode-button-background, #89b4fa);
    --accent-fg: var(--vscode-button-foreground, #1e1e2e);
    --hover: var(--vscode-list-hoverBackground, #313244);
    --active: var(--vscode-list-activeSelectionBackground, #45475a);
    --tag-get: #a6e3a1;
    --tag-post: #fab387;
    --tag-put: #89dceb;
    --tag-delete: #f38ba8;
    --tag-patch: #f9e2af;
    --tag-head: #cba6f7;
    --success: #a6e3a1;
    --error: #f38ba8;
    --muted: var(--vscode-descriptionForeground, #6c7086);
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    background: var(--bg);
    color: var(--fg);
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    font-size: 12px;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 6px 8px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .toolbar input {
    flex: 1;
    background: var(--input-bg);
    border: 1px solid var(--border);
    color: var(--fg);
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    outline: none;
  }
  .toolbar input:focus { border-color: var(--accent); }
  .btn {
    background: var(--accent);
    color: var(--accent-fg);
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    transition: opacity .15s;
  }
  .btn:hover { opacity: .85; }
  .btn-ghost {
    background: transparent;
    color: var(--muted);
    border: 1px solid var(--border);
    padding: 3px 7px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all .15s;
  }
  .btn-ghost:hover { background: var(--hover); color: var(--fg); }
  .btn-icon {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--muted);
    padding: 2px 4px;
    border-radius: 3px;
    font-size: 13px;
    line-height: 1;
    transition: all .15s;
  }
  .btn-icon:hover { background: var(--hover); color: var(--fg); }
  .list { flex: 1; overflow-y: auto; }
  .list::-webkit-scrollbar { width: 4px; }
  .list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  .empty {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100%; color: var(--muted); gap: 8px; padding: 20px; text-align: center;
  }
  .empty-icon { font-size: 28px; opacity: .4; }
  .item {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    cursor: pointer;
    transition: background .1s;
  }
  .item:hover { background: var(--hover); }
  .item-content { flex: 1; min-width: 0; }
  .item-name {
    font-size: 12px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--fg);
  }
  .item-meta {
    font-size: 10px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 1px;
  }
  .method-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
    letter-spacing: .5px;
    background: color-mix(in srgb, currentColor 15%, transparent);
  }
  .method-GET { color: var(--tag-get); }
  .method-POST { color: var(--tag-post); }
  .method-PUT { color: var(--tag-put); }
  .method-DELETE { color: var(--tag-delete); }
  .method-PATCH { color: var(--tag-patch); }
  .method-HEAD { color: var(--tag-head); }
  .method-OPTIONS { color: var(--muted); }
  .status-dot {
    width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
  }
  .status-ok { background: var(--success); }
  .status-err { background: var(--error); }
  .status-warn { background: var(--tag-patch); }
  /* Collections specific */
  .collection-group { border-bottom: 1px solid var(--border); }
  .collection-header {
    display: flex; align-items: center; gap: 6px;
    padding: 7px 8px; cursor: pointer;
    background: color-mix(in srgb, var(--hover) 60%, transparent);
    user-select: none;
  }
  .collection-header:hover { background: var(--hover); }
  .caret { font-size: 10px; transition: transform .2s; color: var(--muted); }
  .caret.open { transform: rotate(90deg); }
  .collection-name { flex: 1; font-weight: 600; font-size: 12px; }
  .collection-count { color: var(--muted); font-size: 10px; }
  .collection-requests { display: none; }
  .collection-requests.open { display: block; }
  .sub-item {
    display: flex; align-items: center; gap: 6px;
    padding: 5px 8px 5px 24px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 30%, transparent);
    cursor: pointer;
    transition: background .1s;
  }
  .sub-item:hover { background: var(--hover); }
  /* Env specific */
  .env-item {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 50%, transparent);
    cursor: pointer; transition: background .1s;
  }
  .env-item:hover { background: var(--hover); }
  .env-radio {
    width: 12px; height: 12px; border-radius: 50%;
    border: 2px solid var(--border); flex-shrink: 0;
    transition: all .15s;
  }
  .env-radio.active { border-color: var(--accent); background: var(--accent); }
  .env-name { flex: 1; font-size: 12px; font-weight: 500; }
  .env-count { color: var(--muted); font-size: 10px; }

  /* Modal */
  .modal-overlay {
    display: none; position: fixed; inset: 0;
    background: rgba(0,0,0,.6); z-index: 100;
    align-items: center; justify-content: center;
  }
  .modal-overlay.open { display: flex; }
  .modal {
    background: var(--vscode-editor-background, #1e1e2e);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    width: 90%; max-width: 320px;
    box-shadow: 0 16px 40px rgba(0,0,0,.5);
  }
  .modal h3 { font-size: 13px; margin-bottom: 12px; color: var(--fg); }
  .modal label { font-size: 11px; color: var(--muted); display: block; margin-bottom: 4px; margin-top: 8px; }
  .modal input, .modal textarea {
    width: 100%; background: var(--input-bg);
    border: 1px solid var(--border); color: var(--fg);
    padding: 6px 8px; border-radius: 4px; font-size: 12px; outline: none;
  }
  .modal input:focus, .modal textarea:focus { border-color: var(--accent); }
  .modal textarea { resize: vertical; min-height: 60px; font-family: monospace; }
  .modal-actions { display: flex; gap: 8px; margin-top: 12px; justify-content: flex-end; }
  .vars-table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .vars-table th {
    text-align: left; font-size: 10px; color: var(--muted);
    padding: 3px 4px; border-bottom: 1px solid var(--border);
  }
  .vars-table td { padding: 2px 4px; }
  .vars-table input {
    width: 100%; background: var(--input-bg); border: 1px solid transparent;
    color: var(--fg); padding: 3px 5px; border-radius: 3px; font-size: 11px;
  }
  .vars-table input:focus { border-color: var(--accent); outline: none; }
  .add-var-btn {
    font-size: 11px; color: var(--accent);
    background: none; border: none; cursor: pointer; padding: 4px 0; margin-top: 4px;
  }
  .add-var-btn:hover { text-decoration: underline; }
  .time { color: var(--muted); font-size: 9px; }
</style>
</head>
<body>
<div id="app"></div>

<div class="modal-overlay" id="modal">
  <div class="modal" id="modal-content"></div>
</div>

<script>
const vscode = acquireVsCodeApi();
let sidebarType = '${type}';
let state = {};
let openCollections = {}; // Tracks expanded collections by ID

// ─── Message handling ──────────────────────────────────────
window.addEventListener('message', e => {
  const msg = e.data;
  if (msg.command === 'setData') {
    state = msg.data;
    // Sync the local openCollections with the data from the extension
    if (msg.data.expansionStates) {
      openCollections = msg.data.expansionStates;
    }
    render();
  }
});

vscode.postMessage({ command: 'requestData' });

// ─── Rendering ────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  if (sidebarType === 'history') renderHistory(app);
  else if (sidebarType === 'collections') renderCollections(app);
  else if (sidebarType === 'environments') renderEnvironments(app);
}

// ─── HISTORY ──────────────────────────────────────────────
function renderHistory(app) {
  const history = state.history || [];
  let html = \`<div class="toolbar">
    <input type="text" placeholder="Filter history..." id="search-input" oninput="filterHistory(this.value)">
    <button class="btn-ghost" onclick="clearAll()">Clear</button>
  </div>
  <div class="list" id="hist-list">\`;

  if (history.length === 0) {
    html += \`<div class="empty">
      <div class="empty-icon">⚡</div>
      <div>No requests yet</div>
      <div style="font-size:10px;opacity:.6">Execute a request to see it here</div>
    </div>\`;
  } else {
    history.forEach(item => {
      const statusClass = !item.status || item.status === 0 ? 'status-err' :
                          item.status < 300 ? 'status-ok' :
                          item.status < 400 ? 'status-warn' : 'status-err';
      const method = item.method || 'GET';
      const t = new Date(item.timestamp).toLocaleTimeString();
      const url = item.url || '';
      const displayUrl = url.length > 40 ? url.substring(0, 40) + '...' : url;
      html += \`<div class="item" onclick="loadRequest('\${escHtml(JSON.stringify(item.request || item))}')">
        <span class="method-badge method-\${method}">\${method}</span>
        <div class="item-content">
          <div class="item-name">\${escHtml(item.name || url)}</div>
          <div class="item-meta">\${escHtml(displayUrl)}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex-shrink:0">
          <div style="display:flex;align-items:center;gap:3px">
            <div class="status-dot \${statusClass}"></div>
            <span style="font-size:10px;color:var(--muted)">\${item.status || 'err'}</span>
          </div>
          <span class="time">\${item.duration ? item.duration+'ms' : ''}</span>
        </div>
        <button class="btn-icon" title="Delete" onclick="event.stopPropagation();delHistory('\${item.id}')">×</button>
      </div>\`;
    });
  }
  html += '</div>';
  app.innerHTML = html;
}

function filterHistory(q) {
  const items = document.querySelectorAll('#hist-list .item');
  items.forEach(el => {
    const text = el.textContent.toLowerCase();
    el.style.display = text.includes(q.toLowerCase()) ? '' : 'none';
  });
}

function clearAll() {
  vscode.postMessage({ command: 'clearHistory' });
}

function delHistory(id) {
  vscode.postMessage({ command: 'deleteHistoryItem', id });
}

function loadRequest(dataStr) {
  try {
    const data = JSON.parse(dataStr);
    vscode.postMessage({ command: 'loadRequest', data });
  } catch(e) {}
}

// ─── COLLECTIONS ──────────────────────────────────────────
function renderCollections(app) {
  const collections = state.collections || [];
  let html = \`<div class="toolbar">
    <input type="text" placeholder="Filter..." id="col-search" oninput="filterCol(this.value)">
    <button class="btn" onclick="newCollection()">+ New</button>
  </div>
  <div class="list" id="col-list">\`;

  if (collections.length === 0) {
    html += \`<div class="empty">
      <div class="empty-icon">📁</div>
      <div>No collections</div>
      <div style="font-size:10px;opacity:.6">Save requests to organize them</div>
    </div>\`;
  } else {
    collections.forEach((col, idx) => {
      const reqs = col.requests || [];
      const isOpen = openCollections[col.id]; // Check if it should be open
      html += \`<div class="collection-group" data-colname="\${escHtml(col.name)}">
        <div class="collection-header" onclick="toggleCol(\${idx}, '\${col.id}')">
          <span class="caret \${isOpen ? 'open' : ''}" id="caret-\${idx}">▶</span>
          <span class="collection-name">\${escHtml(col.name)}</span>
          <span class="collection-count">\${reqs.length}</span>
          <button class="btn-icon" title="Delete" onclick="event.stopPropagation();delCol('\${col.id}')">×</button>
        </div>
        <div class="collection-requests" id="col-reqs-\${idx}">\`;
      
      reqs.forEach(req => {
        const method = req.method || 'GET';
        html += \`<div class="sub-item" onclick="loadRequest('\${escHtml(JSON.stringify(req))}')">
          <span class="method-badge method-\${method}">\${method}</span>
          <span class="item-name" style="flex:1;font-size:11px">\${escHtml(req.name || req.url || 'Untitled')}</span>
          <button class="btn-icon" title="Delete" onclick="event.stopPropagation();delColReq('\${col.id}','\${req.id}')">×</button>
        </div>\`;
      });
      html += '</div></div>';
    });
  }
  html += '</div>';
  app.innerHTML = html;
}

function toggleCol(idx, colId) {
  const el = document.getElementById('col-reqs-' + idx);
  const caret = document.getElementById('caret-' + idx);
  const isNowOpen = el.classList.toggle('open');
  caret.classList.toggle('open');
  
  openCollections[colId] = isNowOpen; 

  // PERSIST: Tell the extension to remember this
  vscode.postMessage({ 
    command: 'toggleCollectionState', 
    id: colId, 
    isOpen: isNowOpen 
  });
}

function newCollection() {
  showModal(\`<h3>New Collection</h3>
    <label>Name</label>
    <input id="col-name" placeholder="My Collection" autofocus>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="createCollection()">Create</button>
    </div>\`);
}

function createCollection() {
  const name = document.getElementById('col-name').value.trim();
  if (!name) return;
  vscode.postMessage({ command: 'saveCollection', data: { name, requests: [] } });
  closeModal();
}

function delCol(id) {
  vscode.postMessage({ command: 'deleteCollection', id });
}

function delColReq(collectionId, requestId) {
  vscode.postMessage({ command: 'deleteCollectionRequest', collectionId, requestId });
}

function filterCol(q) {
  document.querySelectorAll('.collection-group').forEach(el => {
    const name = el.dataset.colname || '';
    el.style.display = name.toLowerCase().includes(q.toLowerCase()) ? '' : 'none';
  });
}

// ─── ENVIRONMENTS ─────────────────────────────────────────
function renderEnvironments(app) {
  const envs = state.environments || [];
  const activeId = state.activeEnvId;
  let html = \`<div class="toolbar">
    <span style="flex:1;font-size:11px;color:var(--muted)">Active environment</span>
    <button class="btn" onclick="newEnv()">+ New</button>
  </div>
  <div class="list">\`;

  if (envs.length === 0) {
    html += \`<div class="empty">
      <div class="empty-icon">🌍</div>
      <div>No environments</div>
      <div style="font-size:10px;opacity:.6">Use {{variable}} in requests</div>
    </div>\`;
  } else {
    envs.forEach(env => {
      const isActive = env.id === activeId;
      const vars = env.variables || [];
      html += \`<div class="env-item" onclick="setActive('\${env.id}')">
        <div class="env-radio \${isActive ? 'active' : ''}"></div>
        <div style="flex:1;min-width:0">
          <div class="env-name">\${escHtml(env.name)}</div>
          <div style="font-size:10px;color:var(--muted)">\${vars.length} variable\${vars.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn-icon" title="Edit" onclick="event.stopPropagation();editEnv('\${escHtml(JSON.stringify(env))}')">✎</button>
        <button class="btn-icon" title="Delete" onclick="event.stopPropagation();delEnv('\${env.id}')">×</button>
      </div>\`;
    });
  }
  html += '</div>';
  app.innerHTML = html;
}

function setActive(id) {
  vscode.postMessage({ command: 'setActiveEnvironment', id });
}

function newEnv() {
  showEnvModal({ name: '', variables: [] });
}

function editEnv(dataStr) {
  try { showEnvModal(JSON.parse(dataStr)); } catch(e) {}
}

function showEnvModal(env) {
  let varsHtml = buildVarsTable(env.variables || []);
  showModal(\`<h3>\${env.id ? 'Edit' : 'New'} Environment</h3>
    <label>Name</label>
    <input id="env-name" value="\${escHtml(env.name || '')}" placeholder="Production">
    <label style="margin-top:10px">Variables</label>
    <div id="vars-container">\${varsHtml}</div>
    <button class="add-var-btn" onclick="addVarRow()">+ Add Variable</button>
    <div class="modal-actions">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn" onclick="saveEnv('\${escHtml(env.id || '')}')">Save</button>
    </div>\`);
}

function buildVarsTable(vars) {
  if (vars.length === 0) return '<div id="vars-table-wrap"></div>';
  let html = '<div id="vars-table-wrap"><table class="vars-table"><tr><th>Key</th><th>Value</th><th></th></tr>';
  vars.forEach((v, i) => {
    html += \`<tr>
      <td><input class="var-key" value="\${escHtml(v.key || '')}" placeholder="key"></td>
      <td><input class="var-val" value="\${escHtml(v.value || '')}" placeholder="value"></td>
      <td><button class="btn-icon" onclick="this.closest('tr').remove()">×</button></td>
    </tr>\`;
  });
  html += '</table></div>';
  return html;
}

function addVarRow() {
  let wrap = document.getElementById('vars-table-wrap');
  if (!wrap) {
    document.getElementById('vars-container').innerHTML = '<div id="vars-table-wrap"><table class="vars-table"><tr><th>Key</th><th>Value</th><th></th></tr></table></div>';
    wrap = document.getElementById('vars-table-wrap');
  }
  const tbody = wrap.querySelector('table');
  if (!tbody) {
    wrap.innerHTML = '<table class="vars-table"><tr><th>Key</th><th>Value</th><th></th></tr></table>';
  }
  const table = wrap.querySelector('table');
  const row = document.createElement('tr');
  row.innerHTML = \`<td><input class="var-key" placeholder="key"></td><td><input class="var-val" placeholder="value"></td><td><button class="btn-icon" onclick="this.closest('tr').remove()">×</button></td>\`;
  table.appendChild(row);
}

function saveEnv(id) {
  const name = document.getElementById('env-name').value.trim();
  if (!name) return;
  const vars = [];
  document.querySelectorAll('.vars-table tr').forEach((tr, i) => {
    if (i === 0) return; // header
    const k = tr.querySelector('.var-key')?.value.trim();
    const v = tr.querySelector('.var-val')?.value.trim();
    if (k) vars.push({ key: k, value: v || '' });
  });
  const env = { name, variables: vars };
  if (id) env.id = id;
  vscode.postMessage({ command: 'saveEnvironment', data: env });
  closeModal();
}

function delEnv(id) {
  vscode.postMessage({ command: 'deleteEnvironment', id });
}

// ─── Modal helpers ────────────────────────────────────────
function showModal(html) {
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal').classList.add('open');
  setTimeout(() => {
    const inp = document.getElementById('modal-content').querySelector('input');
    if (inp) inp.focus();
  }, 50);
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) closeModal();
});

// ─── Utils ────────────────────────────────────────────────
function escHtml(s) {
  if (typeof s !== 'string') s = JSON.stringify(s) || '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

render();
</script>
</body>
</html>`;
}

module.exports = { getSidebarHtml };
