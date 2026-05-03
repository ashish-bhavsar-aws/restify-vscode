# Restify API Client

A full-featured REST API client that lives entirely inside VS Code — think Postman or Insomnia, but without leaving your editor. All HTTP requests run on Node.js directly, which means real proxy support and mTLS work out of the box.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Sending a Request](#sending-a-request)
- [Request Tabs](#request-tabs)
  - [Params](#params)
  - [Headers](#headers)
  - [Body](#body)
  - [Auth](#auth)
- [Environments & Variables](#environments--variables)
- [Post-Response Scripts](#post-response-scripts)
- [Setting Up a Proxy](#setting-up-a-proxy)
- [Setting Up mTLS (Client Certificates)](#setting-up-mtls-client-certificates)
- [Collections — Saving & Organizing Requests](#collections--saving--organizing-requests)
- [History](#history)
- [Response Details](#response-details)

---

## Getting Started

Open the **Restify sidebar** from the activity bar (look for the Restify icon). The main request panel opens automatically as an editor tab. You can also use the command palette → `Open Restify` or `New Request`.

---

## Sending a Request

1. Pick your **HTTP method** from the dropdown (GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS — colour-coded).
2. Type your **URL** in the address bar. Press `Enter` or click **Send**.
3. Query parameters can be typed directly into the URL (`?key=value`) — they auto-populate the **Params tab** below, and vice versa.

The response pane shows status code, duration, and size instantly. Response bodies are auto-formatted — JSON with syntax highlighting, XML pretty-printed.

---

## Request Tabs

### Params

Key/value rows synced bidirectionally with the URL. Check/uncheck rows to enable or disable individual params without deleting them.

### Headers

Same key/value table with **autocomplete** — start typing a header name (`Content-Type`, `Authorization`, `Accept`, etc.) and suggestions appear. Values also have autocomplete (e.g. `application/json`, `Bearer `).

### Body

Choose a body format from the toolbar:

| Format | Description |
|---|---|
| **none** | No body sent |
| **JSON / XML / Text** | Full code editor with syntax highlighting, formatting (`Shift+Alt+F`), and minify |
| **Form** | Key/value rows; individual rows can be switched to **File** type to upload files (multipart/form-data handled automatically) |
| **URL Encoded** | Key/value pairs sent as `application/x-www-form-urlencoded` |
| **GraphQL** | Separate Query and Variables (JSON) editors |

### Auth

Pick an auth type — no manual header construction needed:

| Type | Description |
|---|---|
| **None** | No auth header injected |
| **Bearer Token** | Paste your token; `Authorization: Bearer ...` is injected automatically |
| **Basic Auth** | Enter username + password; base64 encoding is handled for you |
| **API Key** | Enter key name + value; choose whether it goes in a **Header** or **Query Param** |

All auth fields support `{{variable}}` syntax (see [Environments & Variables](#environments--variables)).

---

## Environments & Variables

Variables use `{{VARIABLE_NAME}}` syntax anywhere — in URLs, headers, body, and auth fields.

**Visual indicator while you type:**
- Variable name turns **green** → found in active environment, will be resolved
- Variable name turns **red** → not found; hover to debug

### Creating an Environment

1. Open the **Environments** sidebar panel
2. Click the **`+` button in the panel title bar** and give the environment a name
3. Add key/value pairs (e.g. `baseUrl = https://api.example.com`, `token = abc123`)
4. Select it as active by clicking the radio button next to its name in the panel

Switch environments per-request from the top bar. The active environment is saved with each history entry, so reopening a past request restores the same environment automatically.

---

## Post-Response Scripts

Run JavaScript automatically after every response. Open the **Script tab** in the Request pane. Click **Insert Example** to see a starter template.

### Available Globals

```javascript
response.status       // HTTP status code, e.g. 200
response.statusText   // e.g. "OK", "Not Found"
response.headers      // response headers object
response.body         // parsed JSON (or raw string if not JSON)
response.rawBody      // always the raw string

// Save a value to the active environment (persists between requests)
set("token", response.body.access_token)

// Log output visible in the Logs tab → Script Logs section
log("Token saved:", response.body.access_token)

// console.log / console.warn / console.error also work
console.log(response.status)
```

### Common Use Cases

- **Extract and save a token** from a login response:
  ```javascript
  set("authToken", response.body.token)
  ```
  Then use `{{authToken}}` in the `Authorization` header of subsequent requests.

- **Assert a status code:**
  ```javascript
  if (response.status !== 200) {
    log("ERROR: unexpected status", response.status)
  }
  ```

- **Save a resource ID for chaining requests:**
  ```javascript
  set("userId", response.body.data.id)
  ```
  Then use `{{userId}}` in the next request URL.

> **Note:** Variables set via `set()` expire after **2 hours** automatically. Manually entered environment variables never expire.

Script output and `console.log` calls appear in **Logs tab → Script Logs**. Scripts have a 5-second execution timeout.

---

## Setting Up a Proxy

Open **Settings** (⚙ icon in the top bar) → **Proxy Settings** section.

| Field | Example | Notes |
|---|---|---|
| **Host** | `proxy.company.com` | Proxy server hostname |
| **Port** | `8080` | Proxy port |
| **Proxy Authentication** | checkbox | Reveals username + password fields |
| **No Proxy Hosts** | `localhost`, `internal.corp` | Press Enter after each hostname to add as a tag |

Once saved, all requests route through the proxy. Hosts in the No Proxy list bypass it (exact hostname or any subdomain).

> Restify explicitly prevents Node.js environment variables (`HTTP_PROXY`, `HTTPS_PROXY`) from interfering — the proxy you configure here is the only one used.

---

## Setting Up mTLS (Client Certificates)

Open **Settings** (⚙ icon) → **Client Certificates** section. Add one entry per hostname:

| Field | Example | Required |
|---|---|---|
| **Hostname** | `api.internal.company.com` | Yes |
| **Certificate Path** | `/home/user/certs/client.pem` | Yes |
| **Key Path** | `/home/user/certs/client.key` | Yes |
| **CA Path** | `/home/user/certs/ca-bundle.pem` | No |

### Notes

- Hostname matching is **exact or subdomain** — a cert configured for `api.company.com` also applies to `v2.api.company.com`.
- Certificates are read directly from the filesystem in **PEM format**. No import or conversion step needed.
- The **Logs tab → Request section** shows mTLS status (`✓ Enabled` / `✗ Not Used`) and which hostname matched.
- Multiple entries can be added for different hostnames.

### SSL Verification (per-request)

The **"Verify SSL Connection"** checkbox beneath the URL bar controls `rejectUnauthorized` on a per-request basis. Uncheck it to allow self-signed or untrusted certificates for that specific request. This is independent of mTLS.

---

## Collections — Saving & Organizing Requests

### Saving a Request

1. Click the **💾 Save** button next to the URL bar
2. Give the request a name
3. Choose an existing collection from the dropdown, or select **+ New Collection** and type a name

### Using the Collections Sidebar

- Browse all saved collections with collapsible groups
- Click any saved request to open it instantly with all settings restored (body, headers, auth, script, environment)
- **Rename** collections or individual requests with the ✎ edit button (appears on hover)
- **Copy** a request within or across collections with the ⊕ button (appears on hover)
- **Drag & drop** requests to reorder within a collection or move between collections
- Delete individual requests or entire collections (confirmation required)
- Use the **search box** in the panel to filter by collection or request name
- **Expand / collapse all** collections with the ⊞/⊟ toggle button
- **Import / export** collections as JSON with the 📥 / 📤 buttons
- Click the **`+` button in the panel title bar** to create a new collection

---

## History

The **History sidebar panel** keeps the last **25 executed requests** automatically. Each entry shows:

- Method badge + URL
- Status code with colour indicator (green = 2xx, yellow = 3xx/4xx, red = 5xx)
- Response duration

Click any entry to re-open it with the full request state restored. Large request/response bodies are stored on disk and loaded on demand.

- Hover an entry to reveal the **`+`** button (save to a collection) and the **`×`** delete button
- Use the **Clear** button (visible when history is non-empty) to wipe all history

---

## Response Details

### Response Tabs

| Tab | Contents |
|---|---|
| **Body** | Auto-formatted JSON (syntax highlighted) or XML (pretty-printed); raw text for other types |
| **Headers** | All response headers in a table |
| **Logs** | Full request/response debug breakdown (see below) |
| **Raw** | Unformatted raw response body |

### Response Body Features

- **Search** — click the 🔍 icon in the Body tab toolbar to open an inline search bar; matches are highlighted and a match count is shown. Press `Escape` to close.
- **Large responses** — bodies over 500 KB show a warning with a **Show Raw** button to avoid rendering slowdowns.
- **Copy as cURL** — the response status bar has a **Copy cURL** button that copies the exact `curl` command to reproduce the request.

### Logs Tab — Debug Breakdown

The Logs tab is your debugging companion. It shows collapsible sections:

- **📤 Request** — method, URL, protocol, SSL verification status, mTLS status + matched hostname, proxy URL + auth status or "Direct Connection"
- **📨 Request Headers** — all headers actually sent (count badge)
- **🔗 Query Parameters** — all enabled query params
- **📝 Request Body** — raw body preview
- **📥 Response** — status code, duration, size, timestamp
- **📨 Response Headers** — all response headers
- **🧩 Script Logs** — output from `log()` / `console.log` in post-response script, with pass/fail badge
- **curl equivalent** — auto-generated `curl` command to reproduce the exact request in a terminal

### Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` (in URL bar) | Send request |
| `Ctrl+Enter` | Send request (from anywhere in the panel) |
| `Ctrl+S` | Save / update the current request |
| `Shift+Alt+F` | Format JSON / XML in body editor |
| `Tab` | Insert 2 spaces in code editor |
| `Escape` | Close response body search bar |
