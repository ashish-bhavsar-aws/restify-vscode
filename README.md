# Restify — REST API Client for VS Code

A fast, lightweight REST API client built right into VS Code. Test APIs, debug endpoints, and manage requests without ever leaving your editor.

---

## Table of Contents

- [Installation & Getting Started](#installation--getting-started)
- [Making Your First Request](#making-your-first-request)
- [Request Builder](#request-builder)
  - [URL & Method](#url--method)
  - [Query Parameters](#query-parameters)
  - [Headers](#headers)
  - [Request Body](#request-body)
  - [Code Generation](#code-generation)
  - [Authentication](#authentication)
- [Understanding Responses](#understanding-responses)
  - [Response Tabs](#response-tabs)
  - [Viewing Results](#viewing-results)
- [Saving Requests to Collections](#saving-requests-to-collections)
  - [Create a Collection](#create-a-collection)
  - [Save a Request](#save-a-request)
  - [Organize with Folders](#organize-with-folders)
  - [Reuse Saved Requests](#reuse-saved-requests)
  - [Move & Copy Requests](#move--copy-requests)
- [Request History](#request-history)
- [Environments & Reusable Values](#environments--reusable-values)
  - [Create an Environment](#create-an-environment)
  - [Use Values in Requests](#use-values-in-requests)
  - [Switch Environments](#switch-environments)
- [Advanced Features](#advanced-features)
  - [Proxy Configuration](#proxy-configuration)
  - [Client Certificates (mTLS)](#client-certificates-mtls)
  - [SSL Settings](#ssl-settings)
- [Tips & Shortcuts](#tips--shortcuts)

---

## Installation & Getting Started

1. **Install Restify** from the VS Code Extensions marketplace
2. **Open Restify** by clicking the icon in the VS Code activity bar (left sidebar), or use the command palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and search for "Restify"
3. The main request panel opens automatically — you're ready to test APIs!

---

## Making Your First Request

1. **Choose an HTTP method** — click the dropdown next to the URL bar to select GET, POST, PUT, DELETE, PATCH, HEAD, or OPTIONS. Each has its own color for easy recognition.
2. **Enter a URL** — type your API endpoint into the address bar
3. **Click Send** or press `Enter` — the request fires immediately
4. **View the response** — results appear below with the status code, response time, and formatted data

That's it! You've just made your first request with Restify.

---

## Request Builder

The request panel is organized into sections, each handling a specific part of your request.

### URL & Method

- **HTTP Method dropdown** — select the appropriate method for your request
- **Address bar** — paste or type your full URL
- **Send button** — fires the request, or press `Enter` while in the URL bar

### Query Parameters

Query parameters are the `?key=value` pairs in a URL. Restify makes them easy:

- **Type in the URL** — parameters you type directly into the URL automatically populate the table below
- **Use the table** — add rows to the **Params** tab; they're automatically added to the URL
- **Enable/disable** — check or uncheck rows without deleting them — useful for testing with/without specific parameters

### Headers

Headers provide metadata about your request. Restify includes autocomplete to speed up entry:

- **Click to add** — start typing a header name and suggestions appear (like "Content-Type", "Authorization")
- **Common values** — value suggestions also appear (like "application/json" or "Bearer")
- **Key/value pairs** — each header is a simple name-value row
- **Enable/disable** — uncheck rows to temporarily remove them without deletion

### Request Body

Some requests need to send data. Choose your body format from the options:

- **None** — no body sent (typical for GET requests)
- **JSON** — send structured data as JSON, with syntax highlighting
- **XML** — send XML-formatted data
- **Text** — send raw text
- **Form Data** — key/value pairs sent as a form (useful for uploading files)
- **URL Encoded** — standard form submission format
- **GraphQL** — send GraphQL queries and variables

The body editor includes formatting options to clean up your data.

### Code Generation

Restify can turn the current request into ready-to-run code snippets for popular languages and tooling:

- **Generate code** — click the code icon in the top bar to open the generator from the current request
- **Multiple languages** — generate snippets for cURL, JavaScript, Node.js, Python, Java, Go, Swift, PowerShell, PHP, and C#
- **Copy-ready output** — quickly copy the generated snippet into your app, script, or terminal
- **Request-aware** — the snippet reflects the selected method, URL, headers, body, and auth details

This is useful when you want to reuse an API call outside the extension or share it with teammates.

### Authentication

Authentication proves your identity to the API. Choose your auth method:

- **None** — no authentication
- **Bearer Token** — paste an access token; Restify adds the auth header automatically
- **Basic Auth** — enter username and password; they're automatically encoded
- **API Key** — provide a key/value pair and choose whether it goes in headers or as a query parameter

You don't need to manually create auth headers — Restify handles it all.

---

## Understanding Responses

### Response Tabs

Once you send a request, the response appears in tabs:

- **Body** — the main response data, automatically formatted (JSON with syntax highlighting, XML pretty-printed)
- **Headers** — all headers sent back by the server
- **Logs** — detailed debug information about the request and response
- **Raw** — the unformatted response if you need to see the raw output

### Viewing Results

- **Status code** — top of the response shows the HTTP status (200 OK, 404 Not Found, 500 Server Error, etc.)
- **Response time & size** — how long the request took and how much data was returned
- **Formatted data** — JSON and XML are automatically pretty-printed and highlighted
- **Search** — click the search icon to find text within large responses
- **Copy as cURL** — copy a curl command to run the same request from your terminal

The Logs tab gives you a complete breakdown: exactly what was sent, what was received, headers, parameters, and more — perfect for debugging.

### File Previews (CSV, PDF, Text, Excel)

- Restify shows native previews for common file responses: **CSV**, **Excel (XLS/XLSX)**, **plain text**, and **PDF**.
- CSV and Excel files are parsed in the webview and displayed as read-only tables for quick inspection.
- PDF files are rendered in the webview using a bundled PDF renderer (`react-pdf` / `pdfjs`) so they display inline without relying on external CDNs. If rendering fails, you can download the PDF to view it locally.
- Preview size limit: in-webview previews are capped at **5 MB**; files larger than this will prompt you to download instead of rendering inline.
- Download behavior: the Download button attempts to suggest a filename (from the `Content-Disposition` header or the URL) and will save the binary to your chosen location.


---

## Saving Requests to Collections

Collections let you organize and reuse requests. Instead of typing the same URL over and over, save it once and open it instantly.

### Create a Collection

1. **Open the Collections panel** — click the "Collections" tab in the Restify sidebar
2. **Click the "+" button** in the panel header
3. **Name your collection** — something like "My API", "GitHub API", "Stripe API", etc.
4. **Done** — your collection is ready to receive requests

### Save a Request

1. **Build your request** — enter the URL, headers, body, auth, etc.
2. **Click the Save button** (💾) next to the URL bar
3. **Give it a name** — something descriptive like "Get User Profile" or "Create Order"
4. **Choose a collection** — select where to save it, or create a new collection
5. **Click Save** — it's now stored and reusable

### Organize with Folders

Collections support nested folders for better organization:

1. **Right-click a collection** and select "Add Folder", or use the "+" folder button
2. **Name the folder** — group related requests like "Auth", "Users", "Products"
3. **Drag requests** into folders to organize them
4. **Nested folders** are fully supported — create folders within folders for deep organization

### Reuse Saved Requests

1. **Open the Collections panel** in the Restify sidebar
2. **Browse your collections** — expand folders to see requests
3. **Click any request** — it opens instantly with all settings restored (URL, headers, body, auth)
4. **Make changes** — modify the request as needed, then click Send

You can also save a new version by clicking the Save button again — it updates the existing request.

### Move & Copy Requests

- **Move between folders** — drag a request from one folder to another (even across collections)
- **Copy a request** — hover over a request and click the copy button to duplicate it within the same collection
- **Rename** — hover and click the edit button to rename requests
- **Delete** — hover and click the delete button to remove requests

---

## Request History

Restify automatically keeps a record of your last 25 executed requests:

1. **Open the History panel** — click the "History" tab in the sidebar
2. **Browse your requests** — each shows the method, URL, status code, and response time
3. **Click to reload** — click any history entry to restore the full request and response
4. **Save to collection** — hover an entry and click "+" to save it to a collection
5. **Delete** — hover and click "×" to remove from history
6. **Clear all** — use the Clear button to wipe entire history

History is automatic — every request you send is recorded. This is perfect for testing workflows or coming back to something you tried earlier.

---

## Environments & Reusable Values

Environments let you store reusable values (like API URLs, tokens, or server names) so you don't have to type them repeatedly. You can have multiple environments and switch between them for different scenarios (dev, staging, production).

### Create an Environment

1. **Click the environment dropdown** at the top of the request panel
2. **Select "Manage Environments"**
3. **Click "+ New Environment"**
4. **Name it** — something like "Development", "Production", or "Local Testing"
5. **Add values** — enter key/value pairs:
   - Base URL: `https://api.example.com`
   - API Token: `abc123xyz`
   - Username: `testuser`
6. **Save** — your environment is ready to use

### Use Values in Requests

Once you've created an environment with values, reference them anywhere in your request:

1. **In URLs** — type `{{baseUrl}}/users` instead of typing the full URL
2. **In headers** — type `{{apiToken}}` in an Authorization header
3. **In body** — reference values like `{{username}}`
4. **Visual feedback** — the variable name turns green if it exists, red if not found

The `{{variableName}}` syntax is replaced with the actual value when you send the request.

### Switch Environments

- **Use the dropdown** at the top to switch between environments instantly
- **Different data, same requests** — switch from "Development" to "Production" and all values update automatically
- **Edit anytime** — click "Manage Environments" to add, edit, or delete values

---

## Advanced Features

### Proxy Configuration

If you need to route requests through a proxy server:

1. **Open Settings** — click the gear icon (⚙) at the top right
2. **Go to Proxy Settings**
3. **Enter your proxy details:**
   - **Host** — the proxy server address
   - **Port** — the proxy port number
   - **Username/Password** — if authentication is required, check the box and enter credentials
   - **No Proxy Hosts** — list hostnames that should bypass the proxy
4. **Save** — all requests now route through the proxy

The proxy is now active for all requests. Hosts in the "No Proxy" list will connect directly, bypassing the proxy.

### Client Certificates (mTLS)

If an API requires client certificates for mutual TLS authentication:

1. **Open Settings** (⚙ icon) and go to **Client Certificates**
2. **Add a certificate entry:**
   - **Hostname** — the domain that requires the certificate (e.g., `api.internal.company.com`)
   - **Certificate Path** — path to your certificate file
   - **Key Path** — path to your private key file
   - **CA Path** (optional) — path to a CA certificate for additional verification
3. **Save** — requests to that hostname automatically use the certificate

Certificates can be added for multiple hostnames. Restify handles certificate validation automatically.

### SSL Settings

For requests with SSL/TLS concerns:

- **"Verify SSL Connection" checkbox** — located below the URL bar
- **Enabled (default)** — strict certificate verification
- **Disabled** — allows self-signed or untrusted certificates (useful for testing, not recommended for production)

---

## Tips & Shortcuts

### Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Send request | `Enter` (in URL bar) or `Ctrl+Enter` (anywhere) |
| Save request | `Ctrl+S` |
| Format body (JSON/XML) | `Shift+Alt+F` |
| Close search | `Esc` |

### Pro Tips

- **Organize by API** — create one collection per API service you use
- **Use environments** — keeps requests clean and makes switching between servers effortless
- **Reference history** — check recent requests to jog your memory about a workflow
- **Drag to organize** — drag requests between folders for quick reorganization
- **Copy requests** — duplicate complex requests as a starting point for similar ones
- **Check the logs** — when something goes wrong, the Logs tab shows exactly what happened

---

## Need Help?

- **Stuck on a request?** — check the Logs tab for detailed debugging information
- **Want to organize better?** — create folders within collections for better structure
- **Testing multiple APIs?** — use environments to switch between different servers instantly
