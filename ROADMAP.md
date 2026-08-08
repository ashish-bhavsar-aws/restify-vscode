# Restify — Missing Features & Implementation Roadmap

**Status**: Living document · **Last reviewed**: 2026-08-05 · **Extension version**: 1.0.26

This document inventories the gaps between Restify's current feature set and what a mature REST API client (Postman, Thunder Client, Bruno, HTTPie, REST Client) offers, then sequences them into an implementation roadmap for features that belong inside the VS Code extension itself.

Legend: 🔴 **P0** critical (bug/security/core networking) · 🟠 **P1** high-value (most user impact) · 🟡 **P2** productivity/niche · ⚪ **P3** long-term/experimental

## Product Scope Guardrails
- **Extension-owned only**: every item below should be implemented directly in the VS Code extension through its UI, request engine, local storage, collections, environments, import/export logic, or editor integration.
- **Local-first only**: prioritize features that work well for single-user and local workspace workflows.
- **No cloud sync / org collaboration**: team cloud sync, hosted collaboration, and enterprise-managed sharing are explicitly out of scope for this roadmap.
- **VS Code discoverability**: improve marketplace findability with stronger metadata and keywords so the extension is easier to discover from within VS Code.

---

## Part 1 — Extension-Owned Missing Features Inventory

### 1.1 Bugs & Core Networking (verified by code inspection)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F1 | **GraphQL body never sent** | 🔴 P0 | `RequestState.bodyType='graphql'` + `gqlQuery`/`gqlVars` exist in the model, UI, and codegen — but `buildRequestData` in `RestifyPanel.ts` has no `graphql` branch, so no body is produced. *(fixed in `src/core/body.ts`; codegen side also fixed — see Phase 2 note)* |
| F2 | **SSL verification off by default** | 🔴 P0 | `DEFAULT_REQUEST.rejectUnauthorized = false` (types.ts:122). Should default to `true` and be exposed as an opt-out "verify SSL" per request. |
| F3 | **No redirect following** | 🔴 P0 | 3xx responses returned as-is. Need follow-redirect with max-hop limit + "follow / don't follow" toggle + manual redirect UI. |
| F4 | **No response decompression** | 🔴 P0 | `Accept-Encoding: gzip, deflate, br` is only a suggestion; compressed bytes render raw because no `zlib` inflate is applied. |
| F5 | **No cookie jar / cookie persistence** | 🔴 P0 | `Cookie`/`Set-Cookie` treated as plain headers. Need cookie storage, per-domain jar, and a Cookie Manager view. |
| F6 | **No request cancellation** | 🟠 P1 | No `AbortController`; only a 30s `req.setTimeout` destroy. Need cancel button + abort propagation + user-visible cancelled state. |
| F7 | **Proxy path missing 100MB cap** | 🔴 P0 | `MAX_RESPONSE_SIZE` enforced only on the direct path (RestifyPanel.ts:1488); proxy path neither caps nor counts size. |
| F8 | **Hardcoded 30s timeout** | 🟠 P1 | Timeout is hardcoded (RestifyPanel.ts:1536, 1613). Should be a per-request override + global default in Settings. |
| F9 | **No unit tests for core logic** | 🟠 P1 | Only black-box Playwright E2E. No unit tests for request engine, variable resolution, or importers. |

### 1.2 Request Builder

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F10 | **Pre-request scripts** | 🟠 P1 | Only post-response scripts exist (`scriptExecutor.ts`). Add pre-request hooks (set variables, sign payloads, randomize data). |
| F11 | **OAuth 2.0 flow** | 🟠 P1 | ✅ Authorization code + client credentials + password grant with token refresh. *(done — `src/core/oauth2.ts` incl. token cache + refresh + PKCE; E2E in `feature2.spec.ts`)* |
| F12 | **More auth types** | 🟡 P2 | AWS SigV4, Digest Auth, Hawk, NTLM, JWT-bearer, per-request "inherit from collection". |
| F13 | **cURL command import** | 🟠 P1 | ✅ Paste a `curl ...` command to build a full request (flags: `-X`, `-H`, `-d`, `-F`, `-u`, `--data-binary`, `--url`). Reverse of existing codegen. *(done — `src/core/curlParser.ts` tokenizer + parser; `restify.importCurl` command with input box + clipboard auto-detect; unit tests (17) + E2E tests)* |
| F14 | **Bulk editor for headers/params** | 🟡 P2 | Postman-style raw key-value text editor with parse-on-change. |
| F15 | **Clipboard paste into KV tables** | 🟡 P2 | Paste tab/newline-delimited rows from Excel/CSV into Params/Headers/Form tables. |
| F16 | **Dynamic variables** | 🟠 P1 | `{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}`, `{{$randomAlpha}}`, `{{$processEnv}}`, `{{$localDateTime}}` like Postman. |
| F17 | **Default dynamic headers** | 🟡 P2 | Add switchable default headers like `User-Agent`, `X-Request-Id`, `X-Correlation-Id`, or `Date` that can be injected automatically. *(done — settings toggles in Settings modal; injected at request time via `src/core/defaultHeaders.ts`, only when not already set explicitly; unit + E2E covered)* |
| F18 | **Variable autocomplete** | 🟡 P2 | Suggest `{{envVar}}` names in URL/headers/body inputs (currently only highlight + unresolved coloring). |
| F19 | **Basic Auth via URL** | 🟡 P2 | Support `https://user:pass@host/` URL form and carry it into Authorization header. |
| F20 | **Header presets / groups** | 🟡 P2 | Save reusable header sets and apply them to requests. |
| F61 | **Request templates** | ⚪ P3 | Starter templates (REST, GraphQL, Health-check) on "New Request". |
| F21 | **Request chaining** | 🟠 P1 | ✅ Post-response scripts store values with `set('key', value)` and they are scoped to the current window session, available in every later request as `{{key}}`; a new window starts a fresh scope. *(done — per-window session chain variables in `StorageManager` + script `set()`; E2E in `feature3.spec.ts`)* |

### 1.3 Response Viewer

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F22 | **JSON schema validation** | 🟡 P2 | ✅ Validate response body against a JSON Schema (from OpenAPI or pasted). *(done — `src/core/schemaValidation.ts` Ajv draft-07 validation (host-side, serializable results); request **Schema** tab with editor + validate toggle + badge; response **Schema** tab with valid/error summary; OpenAPI imports attach the resolved 2xx JSON response schema; 12 unit tests + E2E in `schema-validation.spec.ts`)* |
| F23 | **JSONPath / XPath / filter** | 🟡 P2 | ✅ Query the JSON response body with a JSONPath expression and highlight results. *(done — `src/core/jsonPath.ts` subset evaluator (`$`, `.name`, `[n]`, `[*]`, `..name`, `[?(filter)]` with `==/!=/</>/<=/>=`) + pretty-print offset mapping for exact match highlighting; search bar gains a **Text / JSONPath** mode toggle, match count, and a results list of `path → value`; 15 unit tests + E2E in `jsonpath.spec.ts`)* |
| F24 | **Response beautify options** | 🟡 P2 | Word wrap, font size, line numbers, collapse/expand tree view of JSON. |
| F25 | **Save response to file** | 🟡 P2 | ✅ Download raw body (not just binary file responses) to disk. *(done — response actions gain a **Save** button that opens the OS save dialog with a content-type-derived extension (`src/core/responseSave.ts`); filename auto-suggested from the request URL; `_downloadFile` refactored onto a shared `_saveViaDialog` helper; 12 unit tests + E2E in `save-response.spec.ts`)* |
| F26 | **Response diff** | ⚪ P3 | Compare two responses/requests side-by-side. |
| F27 | **Timeline / time breakdown** | 🟡 P2 | TTFB, transfer, DNS, TLS stages (needs refactor of `_doRequest` timing). |
| F28 | **Streaming / SSE support** | ⚪ P3 | Incremental body rendering for chunked/`text/event-stream` responses. |
| F29 | **Response cache / offline replay** | ⚪ P3 | Replay cached responses without a network round-trip. |
| F30 | **Notification on long request** | 🟡 P2 | ✅ Toast/status-bar notify when a request completes in background. *(done — after a request finishes, a VS Code notification is shown when the duration exceeds a threshold (default 5 s) while the window is unfocused (`src/core/completionNotify.ts`); Settings → General adds **Notify on long requests** + **Long Request Threshold**; 9 unit tests + E2E in `completion-notify.spec.ts`)* |

### 1.4 Collections & Workflow

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F31 | **Collection runner** | 🟠 P1 | ✅ Run all requests in a collection/folder sequentially; show per-request pass/fail + timing results grid. *(done — `src/core/collectionRunner.ts` + sidebar runner modal; E2E in `feature4.spec.ts`)* |
| F32 | **Data-driven runs** | 🟡 P2 | ✅ Iterate a collection against CSV/JSON data files (each row injects variables). *(done — `iterationData` in `collectionRunner.ts` + `_pickIterationData` file picker in `SidebarProvider.ts`; unit-tested)* |
| F33 | **Test/assertion scripts** | 🟠 P1 | Postman-style `tests` tab: assertions render as pass/fail badges in the response pane (builds on existing script engine). |
| F34 | **Export to OpenAPI / HAR / .http** | 🟡 P2 | Reverse of the importers. Postman export already supported via `importCollection`. |
| F35 | **Import HAR / Insomnia / .http** | 🟡 P2 | Extend importers beyond Postman + OpenAPI. |
| F36 | **OpenAPI viewer / explorer** | ⚪ P3 | Render an OpenAPI spec as browsable endpoints with generated requests (currently only imports spec → collections). |
| F37 | **Mock server generation** | ⚪ P3 | Spin up a local mock server from collection responses (e.g., Prism-style). |
| F38 | **Documentation generation** | ⚪ P3 | Publish a human-readable HTML/Markdown docs page from a collection. |
| F39 | **Workspace file format** | 🟡 P2 | `.restify` project files committed to a repo (like Postman workspaces / `.http` files), with git-friendly diff. |
| F40 | **Collection-level scripts** | 🟡 P2 | Pre-request/test scripts inherited by all children requests. |

### 1.5 Environments & Storage

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F41 | **Secret variables + encrypted storage** | 🟠 P1 | ✅ Masked `{{secret}}` values; store in keychain/`SecretStorage` instead of plaintext (globalState is currently plaintext). *(done — `SecretStorage` + mask/reveal; E2E in `feature5.spec.ts`)* |
| F42 | **Variable scoping** | 🟡 P2 | global / collection / environment / local scope precedence (currently one active env + a Global env). |
| F43 | **Initial vs current value** | 🟡 P2 | Postman-style two-column env values, with "reset to initial". |
| F44 | **Environment import/export** | 🟡 P2 | Share env files, incl. Postman env JSON format. |
| F45 | **Environment switching from sidebar** | ⚪ P3 | Currently only available in the main panel dropdown. |

### 1.6 Protocol & Runtime

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F46 | **WebSocket client** | 🟡 P2 | Connect, send/receive frames, message log — separate panel or request-body mode. |
| F47 | **gRPC support** | ⚪ P3 | Import `.proto`, invoke unary/server-streaming calls. |
| F48 | **HTTP/2 support** | ⚪ P3 | `http2` module for h2 endpoints. |
| F49 | **Request compression** | ⚪ P3 | Compress request body (gzip/deflate) with `Content-Encoding`. |
| F50 | **Interceptors / middleware** | ⚪ P3 | Pipeline hooks around request/response lifecycle. |
| F61 | **SOAP/WSDL import and SOAP body generation** | 🟡 P2 | ✅ Import a SOAP service definition (WSDL), generate method-specific SOAP request envelopes, set proper SOAP headers, and prefill body templates for each operation. *(done — see Phase 3; WS-Security UsernameToken/encryption/decryption included — settings-driven by hostname via Settings → SOAP Security)* |

### 1.7 Editor Integration & UX

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F51 | **.http file support** | 🟡 P2 | Open/send REST-Client-format `.http` files; export requests to `.http`. |
| F52 | **Multi-tab / multiple panels** | 🟡 P2 | Currently a single `RestifyPanel`; support multiple open request tabs. |
| F53 | **Codegen: more languages** | 🟡 P2 | Add TypeScript fetch, Dart, Ruby, Rust, Kotlin, HTTPie (currently 11). |
| F54 | **Command palette actions** | 🟡 P2 | "Restify: Send Request", "Search in Collections", "Restify: New from curl". |
| F55 | **Rich diff of saved request** | ⚪ P3 | Show unsaved-change indicator vs last saved (there's a dirty dot only). |
| F56 | **Undo/redo in body editor** | ⚪ P3 | CodeMirror history is present; ensure it's surfaced with shortcuts. |
| F57 | **History search & pins** | 🟡 P2 | Persist search query, pin favorites, fuzzy search across history. |
| F58 | **Screenshots/theme polish** | 🟡 P2 | Icon themes, method color on request rows, empty-state CTAs. |
| F59 | **VS Code discoverability / marketplace metadata** | 🟡 P2 | Improve extension keywords, tags, descriptions, and category metadata so Restify is easier to find in the VS Code marketplace and command palette. |
| F60 | **Code size and maintainability guardrails** | 🟠 P1 | ✅ Keep the extension maintainable by enforcing file-size limits, component boundaries, shared utilities, and a clear rule for when to extract logic into core modules. *(done — `scripts/check-guardrails.mjs` + `npm run guardrails`; rules in `GUARDRAILS.md`)* |

---

## Must-have / Nice-to-have Summary

This section separates the highest-priority features from the broader roadmap inventory so it is easy to see what should be targeted first versus what can be deferred for later polish.

### Must-have
- F1 — GraphQL body fix
- F2 — SSL verification default on
- F3 — Redirect following
- F4 — Response decompression
- F5 — Cookie jar and persistence
- F6 — Request cancellation
- F8 — Configurable timeout
- F9 — Core unit tests
- F10 — Pre-request scripts
- F31 — Collection runner ✅
- F33 — Test/assertion scripts ✅
- F41 — Secret variables ✅
- F51 — .http file support ✅
- F54 — Command palette actions ✅
- F60 — Code size and maintainability guardrails ✅

### Nice-to-have
- F61 — SOAP/WSDL import + WS-Security ✅
- F13 — cURL command import ✅
- F14 — Bulk editor for headers/params
- F15 — Clipboard paste into KV tables
- F16 — Dynamic variables
- F17 — Default dynamic headers
- F18 — Variable autocomplete
- F19 — Header presets / groups
- F22 — JSON schema validation ✅
- F23 — JSONPath / XPath query
- F24 — Response beautify options
- F25 — Save response to file ✅
- F30 — Notification on long request ✅
- F44 — Environment import/export ✅
- F46 — WebSocket client
- F52 — Multi-tab / multiple panels
- F53 — Additional codegen languages ✅
- F59 — Marketplace discoverability metadata

---

## Part 2 — Extension-Native Implementation Roadmap

Phases are ordered by (bug/security first) → (high user impact) → (ecosystem integration) → (experimental). Each phase ends green: build + lint + existing E2E pass.

> **UI polish status** (tracked in `UI_IMPRPVE.md`): initial slice shipped in `7f88c4e` — options row icons + grouped/aligned labels, request & response tab icons with active-state tint, sidebar hover actions revealed on `:focus-within` (covers P0#3, P0#4, P1#6, P1#7, partial P1#9). Remaining P0/P1/P2 items (responsive layout, empty/loading states, top-bar hierarchy, form ergonomics, modal consistency, response viewer emphasis, accessibility/contrast, micro-interactions, onboarding) are not yet implemented.

### Phase 0 — Foundation & Hygiene
> Short, cheap, high-confidence changes. Do first; everything builds on this.

- [x] F2 Flip `rejectUnauthorized` default to `true`; keep per-request checkbox; show a warning badge when disabled. *(done — default now `true`, badge shown when `!== true`)*
- [x] F9 Scaffold unit tests (Vitest/Jest, no heavy webpack) for: variable resolution, body serialization, URL/query merging, multipart builder, auth injection, import parsers. *(scaffolded — Vitest 4 + 261 tests covering body serialization incl. GraphQL, URL/query merging, multipart builder, redirects, decompression, cookies, scripts, collection runner)*
- [x] Extract the request engine (`_doRequest`, body serialization, header canonicalization) into `src/core/` so it's unit-testable and shared. *(done — `src/core/{constants,headers,body,decompress,redirects,url}.ts`)*

### Phase 1 — Core Networking (P0 fixes)
> Makes Restify correct on the wire; unblocks everything else.

- [x] F1 **GraphQL**: add `graphql` branch to body serialization (`{"query": …, "variables": …}`), `Content-Type: application/json`, codegen already correct.
- [x] F3 **Redirects**: follow 3xx up to N hops (default 10), preserve method for 307/308, convert 303→GET, strip `Authorization` cross-host; add "Follow Redirects" toggle (on/auto-off) to the request.
- [x] F4 **Decompression**: inflate `Content-Encoding: gzip/deflate/br` (`zlib`); fall back to raw bytes on decode failure; only set `Accept-Encoding` when handled.
- [x] F5 **Cookie jar**: persist cookies per domain in storage; send stored cookies for matching host/path; honor `Secure`, `Domain`, `Path`, `Expires`, `HttpOnly`; surface `Set-Cookie` in response headers (already preserved). *(done — `src/core/cookies.ts`, globalState persistence, engine injection + per-hop capture; 29 tests. Cookie Manager view deferred to a later polish pass.)*
- [x] F7 **Proxy size cap**: apply `MAX_RESPONSE_SIZE` + size counting to the proxy path.
- [x] F6 **Cancellation**: `AbortController`-style signal through the engine; Cancel button in the panel; history entry marked `cancelled`. *(done — `AbortController` wired through `src/core/http.ts`, cancel button + cancelled history state; covered by `feature1.spec.ts` F6 and unit tests)*
- [x] F8 **Timeouts**: `timeout` on RequestState (per-request) + default in Settings; wire both direct and proxy paths.

**Exit criteria:** unit tests for redirects, decompression, cookie matching, GraphQL body, proxy cap. Full E2E suite green. *(status: redirects ✅, decompression ✅, cookie matching ✅, GraphQL body ✅, proxy cap covered by engine tests; cancellation ✅; HTTP + Settings E2E suites green.)*

### Phase 2 — Scripting & Variables (P1)
> Turns Restify from "send and see" into "automate workflows".

- [x] F10 **Pre-request scripts**: extend `scriptExecutor.ts` to a generic pipeline (pre → request → post); API parity (`vars`, `request`, `log`). *(done — `preScript` on RequestState, run host-side via `src/core/script.ts` before the request; `src/core/http.ts` shared engine)*
- [x] F33 **Test/assertion scripts**: post-request `tests` object (`tests["status is 200"] = response.status === 200`); render pass/fail badges in response pane; store results in history. *(done — `tests` object in `src/core/script.ts` sandbox, wired through `_runScript` in RestifyPanel, `TestResults` component in ResponsePane with pass/fail badges + summary bar; unit-tested)*
- [x] F16 **Dynamic variables**: `{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}`, `{{$randomAlpha}}`, `{{$randomHex}}`, `{{$processEnv:NAME}}`, `{{$localDateTime}}` resolved host-side before request. *(done — `src/core/dynamicVars.ts`, wired into `StorageManager.resolveVariables`, unit-tested; codegen substitutes dynamic tokens with samples/placeholders — see F53 correctness pass below)*
- [x] F21 **Request chaining**: post-response scripts store values with `set('key', value)`; values are scoped to the current window session and resolve as `{{key}}` in every later request (unlimited chaining in one window, fresh scope on a new window). *(done — per-window session chain variables in `StorageManager.setSessionChainVars`, resolution in `resolveVariables`, chain vars merged into the webview display env for hover previews; unit-tested + E2E in `feature3.spec.ts`)*
- [x] F41 **Secret variables**: add `secret` flag to `KVItem`; store secret values in `context.secrets`/`SecretStorage`; mask in UI (dot display + reveal). *(done — `secret: true` on env KV items, values persisted to VS Code `SecretStorage`, masked `type="password"` inputs with reveal toggle, `{{secret_key}}` resolves to the decrypted value; unit-tested + E2E in `feature5.spec.ts`)*
- [x] F31 **Collection runner** (first slice): run a folder/collection sequentially, reusing the single-request engine; results grid with status/time/test badges; cancel support. *(done — `src/core/collectionRunner.ts` sequential runner + cancel, results grid in sidebar modal; unit-tested + E2E in `feature4.spec.ts`)*
- [x] F32 **Data-driven runs**: CSV/JSON rows as iteration variables for the runner. *(done — `parseIterationData` for CSV/JSON, `iterationData` options in `runCollectionRequests`, per-row passes with `entry.iteration`, `Run without data` / `Run with data file...` picker in the sidebar runner; unit-tested)*
- [x] F60 **Code size and maintainability guardrails**: file-size limits, component boundaries, shared-utility placement rules. *(done — `scripts/check-guardrails.mjs` + `npm run guardrails`; rules in `GUARDRAILS.md`)*

**Exit criteria:** script pipeline covered by unit tests (incl. test assertions ✅); runner E2E (2–3 request collection) passing. *(status: F21/F41/F31 E2E all passing.)*

### Phase 3 — Import/Export & Interop (P1/P2)
> Makes Restify a first-class citizen in existing API toolchains.

- [x] F13 **cURL import**: robust `curl` → RequestState parser (flags, quoted args, `--data-raw`, `-H 'Header: value'`, `-u`, `-F`). *(done — `src/core/curlParser.ts` tokenizer + parser; `restify.importCurl` command with input box + clipboard auto-detect; 17 unit tests + E2E in `feature2.spec.ts` and `palette-commands.spec.ts`)*
- [x] F34/F35 **Import HAR / Insomnia / Restify / Postman / OpenAPI / .http** — all formats parse via `src/core/converters.ts`; E2E covers Postman, OpenAPI file+URL, HAR, Insomnia, Restify, `.http` in `import-export.spec.ts` + `feature6.spec.ts`. Export to OpenAPI / HAR / `.http` / Postman implemented and unit-tested.
- [x] F61 **SOAP/WSDL import and SOAP body generation**: parse WSDL, list operations, generate SOAP envelopes, populate request bodies, and auto-add SOAP headers. *(done — `src/core/wsdl.ts` WSDL 1.1 parser (document/rpc, literal/encoded, inline+named types, imports, wsse:Security header parts, SOAP 1.1/1.2 bindings), `parseImportText(..., 'wsdl')` in `src/core/converters.ts`, sidebar **Import → WSDL / SOAP Service** flow in `SidebarProvider._importWsdlFile`, SOAP operation picker + WS-Security panel in `RequestPane.tsx`, host-side WS-Security (UsernameToken + AES-256-CBC/RSA-OAEP encryption + response decryption) in `src/core/wsse.ts`/`RestifyPanel._resolveWsSecurity`; 33 unit tests across `wsdl.test.ts` + `wsse.test.ts` + `default-headers.test.ts`)*
  - Implementation steps:
    1. ✅ Add a WSDL importer that reads local/remote WSDL files and extracts services, ports, bindings, operations, and message schemas. *(`parseWsdl` in `src/core/wsdl.ts` + `_importWsdlFile` in `SidebarProvider.ts`)*
    2. ✅ Normalize SOAP namespaces, operation names, input/output message definitions, and default bodies into `RequestState` metadata. *(per-operation `SoapRequestMeta` with `operations[]` picklist, namespace maps, qualified/unqualified element forms)*
    3. ✅ Populate the request UI with a SOAP operation picker when a WSDL import is active. *(`soap-operation-select` in `RequestPane.tsx`, swaps SOAPAction/Content-Type headers per operation)*
    4. ✅ Generate a SOAP envelope template per operation, including required XML elements and sample values for primitive types. *(`buildSoapEnvelope` in `src/core/wsdl.ts`)*
    5. ✅ Set appropriate headers: `Content-Type: text/xml; charset=utf-8` (SOAP 1.1) or `application/soap+xml` (SOAP 1.2) and `SOAPAction` when applicable. *(`soapContentType` in `src/core/wsdl.ts`)*
    6. ✅ Allow overriding generated XML body and keep the original template in the body editor for easy modification. *(generated envelope becomes the editable body; switching operations re-seeds it)*
     7. ✅ Add tests covering WSDL parsing, operation selection, envelope generation, and SOAP header injection. *(unit tests in `test/unit/wsdl.test.ts` + E2E spec `test/specs/soap.spec.ts`: sidebar WSDL file import, WSDL **URL** import (`_importWsdlUrl`), SOAP operation load, header/body capture against the mock server, WS-Security settings-driven response decryption against `server/certs/soap-key.pem` (encrypted mode without a matching settings entry), and live calls to the Beeceptor `CountryInfoService` (`ListOfContinentsByName`/`ListOfCountryNamesByName`))*
- [ ] F18 **Variable autocomplete** in URL/headers/body inputs (debounced suggestions from active env + globals).
- [ ] F15 **Clipboard paste** into KV tables; F14 **bulk editor** for Params/Headers.
- [x] F53 **Codegen correctness pass** *(done — GraphQL body serialization, `urlencoded` + text-only-form fields, disabled header/param filtering, API-key-in-query, dynamic-var substitution incl. `{{$processEnv:NAME}}`, Python/Go/Swift multipart fixes; 27 codegen unit tests)*
- [x] F53 **Codegen additions** (TypeScript fetch, Dart, Ruby, Rust, Kotlin, HTTPie) — done; all 17 languages present in `src/webview/utils/codegen.ts`, E2E in `codegen.spec.ts` + `feature6.spec.ts`.
- [x] F51 **.http files**: open + parse + send (`restify.openHttpFile`); export request → `.http` (`restify.exportRequestToHttp`); E2E in `feature6.spec.ts`.
- [x] F44 **Environment import/export** incl. Postman env JSON. *(done — `_importEnvironment`/`_exportEnvironment` in `RestifyPanel.ts`, Postman/Restify env converters in `src/core/converters.ts`)*

**Exit criteria:** round-trip tests (import → export → import) for curl/Postman/OpenAPI/HAR; `.http` E2E.

### Phase 4 — Productivity & UX (P2)
- [x] F11 **OAuth 2.0**: authorization-code flow with system browser + redirect listener; token cache; refresh; PKCE. *(done — `src/core/oauth2.ts`: authorization-code + client-credentials + password grants, token cache keyed by token-URL/client/scopes, refresh, PKCE challenge; unit-tested + E2E for client-credentials/password in `feature2.spec.ts`; authorization-code grant covered by unit tests, loopback redirect listener included)*
- [x] F22 **JSON schema validation** of responses (paste schema or pull from imported OpenAPI). *(done — Ajv draft-07 validation host-side in `src/core/schemaValidation.ts`, request Schema tab (editor + validate toggle + badge dot), response Schema tab (valid/error summary with instance paths), OpenAPI imports resolve & attach 2xx JSON response schemas; 12 unit tests + E2E in `schema-validation.spec.ts`)*
- [x] F23 **JSONPath/XPath query** in response viewer. *(done — JSONPath query mode in the response search bar: subset evaluator + filters in `src/core/jsonPath.ts`, matches highlighted in the CodeMirror viewer and listed as `path → value`; 15 unit tests + E2E in `jsonpath.spec.ts`)*
- [x] F25 **Save response to file**; F30 **completion notifications**.
- [x] F57 **History pins + fuzzy search**; [x] F54 **palette commands**. *(F54 done: `Restify: Send Request`, `Search in Collections`, `New from cURL`, New Request/Collection, Import Collection, Export All, Open Environments all registered and working in `src/extension.ts`; F57 done: fuzzy search on name/URL + pinned history entries (`pinned` flag on `HistoryEntry`, `StorageManager.toggleHistoryPin`, star toggle in `HistoryPanel` with pinned-first sorting); E2E in `feature6.spec.ts`)*
- [ ] F59 **Marketplace discoverability**: strengthen VS Code metadata, keywords, and extension search relevance.
- [ ] F46 **WebSocket client** (read-only connection viewer first).
- [ ] F52 **Multi-tab request panels** (biggest UX surface; defer to late phase).
- [x] F61 **SOAP/WSDL import and SOAP body generation**: expose WSDL operations in the request UI and prepopulate SOAP request bodies. *(done — see Phase 3; WS-Security UsernameToken/encryption/decryption included)*

### Phase 5 — Experimental / Long-term (P3)
- [ ] F28 SSE/streaming, F48 HTTP/2, F49 request compression, F50 interceptors.
- [ ] F26 response diff, F27 timeline breakdown, F24 response tree view.
- [ ] F36 OpenAPI explorer, F37 mock server, F38 docs generation.
- [ ] F39 workspace `.restify` files, F40 collection-level scripts.
- [ ] F47 gRPC, F29 response cache/offline replay, F55/F56 editor polish.

---

## Suggested Release Plan

### Release 1 — Core reliability and usability (target: 2–3 weeks)
Focus: fix correctness issues, make the extension feel stable, and improve everyday usage.

**Must-have**
- F2 — SSL verification default on ✅
- F3 — Redirect following ✅
- F4 — Response decompression ✅
- F5 — Cookie jar and persistence ✅
- F6 — Request cancellation ✅
- F8 — Configurable timeout ✅
- F9 — Core unit tests ✅

**Nice-to-have**
- F10 — Pre-request scripts ✅
- F13 — cURL import ✅
- F16 — Dynamic variables ✅
- F57 — History search and pins ✅
- F59 — VS Code discoverability metadata

### Release 2 — Workflow productivity (target: 3–4 weeks)
Focus: move from basic request sending to practical daily workflows while keeping the codebase maintainable.

**Must-have**
- F10 — Pre-request scripts ✅
- F31 — Collection runner ✅
- F33 — Test/assertion scripts ✅
- F41 — Secret variables ✅
- F51 — .http file support ✅
- F54 — Command palette actions ✅
- F60 — Code size and maintainability guardrails ✅

**Nice-to-have**
- F14 — Bulk editor for headers/params
- F15 — Clipboard paste into KV tables
- F17 — Default dynamic headers ✅
- F18 — Variable autocomplete
- F20 — Header presets/groups
- F44 — Environment import/export ✅

### Release 3 — Ecosystem and editor integration (target: 4+ weeks)
Focus: make Restify fit into broader developer workflows and existing API toolchains.

**Must-have**
- F13 — cURL import ✅
- F34/F35 — OpenAPI/HAR/Insomnia/.http import-export ✅
- F53 — Additional code generation languages ✅
- F52 — Multi-tab/multi-panel support

**Nice-to-have**
- F11 — OAuth 2.0 ✅
- F22 — JSON schema validation ✅
- F23 — JSONPath/XPath query ✅
- F24 — Response beautify options
- F46 — WebSocket client

### Release 4 — Advanced and experimental (target: later)
Focus: more advanced API workflows and long-term differentiation.

- F26 — Response diff
- F27 — Timeline breakdown
- F28 — Streaming/SSE
- F36 — OpenAPI explorer
- F37 — Mock server generation
- F39 — Workspace file format
- F47 — gRPC support
- F48 — HTTP/2 support
- F50 — Interceptors/middleware

---

## Suggested First Sprint (highest value, smallest risk)

> ✅ **Complete** — all six items shipped in one sprint (see commit history); build + lint + 261 unit tests + HTTP/Settings E2E suites green.

1. **F2** — SSL default on (one-line default + warning badge)
2. **F1** — send GraphQL bodies
3. **F3** — follow redirects (toggle)
4. **F4** — gzip/deflate/br decompression
5. **F9** — unit-test scaffold for `src/core/`
6. **F8** — configurable timeout

Together these fix every known "correctness on the wire" defect and de-risk the rest of the roadmap.
