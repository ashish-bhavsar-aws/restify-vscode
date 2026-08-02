# Restify — Missing Features & Implementation Roadmap

**Status**: Living document · **Last reviewed**: 2026-08-02 · **Extension version**: 1.0.26

This document inventories the gaps between Restify's current feature set and what a mature REST API client (Postman, Thunder Client, Bruno, HTTPie, REST Client) offers, then sequences them into an implementation roadmap.

Legend: 🔴 **P0** critical (bug/security/core networking) · 🟠 **P1** high-value (most user impact) · 🟡 **P2** productivity/niche · ⚪ **P3** long-term/experimental

---

## Part 1 — Missing Features Inventory

### 1.1 Bugs & Core Networking (verified by code inspection)

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F1 | **GraphQL body never sent** | 🔴 P0 | `RequestState.bodyType='graphql'` + `gqlQuery`/`gqlVars` exist in the model, UI, and codegen — but `buildRequestData` in `RestifyPanel.ts` has no `graphql` branch, so no body is produced. Only affects generated code. |
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
| F11 | **OAuth 2.0 flow** | 🟠 P1 | Authorization code + client credentials + password grant with token refresh. Manual OAuth only via bearer today. |
| F12 | **More auth types** | 🟡 P2 | AWS SigV4, Digest Auth, Hawk, NTLM, JWT-bearer, per-request "inherit from collection". |
| F13 | **cURL command import** | 🟠 P1 | Paste a `curl ...` command to build a full request (flags: `-X`, `-H`, `-d`, `-F`, `-u`, `--data-binary`, `--url`). Reverse of existing codegen. |
| F14 | **Bulk editor for headers/params** | 🟡 P2 | Postman-style raw key-value text editor with parse-on-change. |
| F15 | **Clipboard paste into KV tables** | 🟡 P2 | Paste tab/newline-delimited rows from Excel/CSV into Params/Headers/Form tables. |
| F16 | **Dynamic variables** | 🟠 P1 | `{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}`, `{{$randomAlpha}}`, `{{$processEnv}}`, `{{$localDateTime}}` like Postman. |
| F17 | **Variable autocomplete** | 🟡 P2 | Suggest `{{envVar}}` names in URL/headers/body inputs (currently only highlight + unresolved coloring). |
| F18 | **Basic Auth via URL** | 🟡 P2 | Support `https://user:pass@host/` URL form and carry it into Authorization header. |
| F19 | **Header presets / groups** | 🟡 P2 | Save reusable header sets and apply them to requests. |
| F20 | **Request templates** | ⚪ P3 | Starter templates (REST, GraphQL, Health-check) on "New Request". |
| F21 | **Request chaining** | 🟠 P1 | Reference previous response values in the next request (`{{previousResponse.$.token}}`) with a selector UI. |

### 1.3 Response Viewer

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F22 | **JSON schema validation** | 🟡 P2 | Validate response body against a JSON Schema (from OpenAPI or pasted). |
| F23 | **JSONPath / XPath / filter** | 🟡 P2 | Query the response body and highlight results; build on existing search. |
| F24 | **Response beautify options** | 🟡 P2 | Word wrap, font size, line numbers, collapse/expand tree view of JSON. |
| F25 | **Save response to file** | 🟡 P2 | Download raw body (not just binary file responses) to disk. |
| F26 | **Response diff** | ⚪ P3 | Compare two responses/requests side-by-side. |
| F27 | **Timeline / time breakdown** | 🟡 P2 | TTFB, transfer, DNS, TLS stages (needs refactor of `_doRequest` timing). |
| F28 | **Streaming / SSE support** | ⚪ P3 | Incremental body rendering for chunked/`text/event-stream` responses. |
| F29 | **Response cache / offline replay** | ⚪ P3 | Replay cached responses without a network round-trip. |
| F30 | **Notification on long request** | 🟡 P2 | Toast/status-bar notify when a request completes in background. |

### 1.4 Collections & Workflow

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| F31 | **Collection runner** | 🟠 P1 | Run all requests in a collection/folder sequentially; show per-request pass/fail + timing results grid. |
| F32 | **Data-driven runs** | 🟡 P2 | Iterate a collection against CSV/JSON data files (each row injects variables). |
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
| F41 | **Secret variables + encrypted storage** | 🟠 P1 | Masked `{{secret}}` values; store in keychain/`SecretStorage` instead of plaintext (globalState is currently plaintext). |
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

---

## Part 2 — Implementation Roadmap

Phases are ordered by (bug/security first) → (high user impact) → (ecosystem integration) → (experimental). Each phase ends green: build + lint + existing E2E pass.

### Phase 0 — Foundation & Hygiene
> Short, cheap, high-confidence changes. Do first; everything builds on this.

- [x] F2 Flip `rejectUnauthorized` default to `true`; keep per-request checkbox; show a warning badge when disabled. *(done — default now `true`, badge shown when `!== true`)*
- [x] F9 Scaffold unit tests (Vitest/Jest, no heavy webpack) for: variable resolution, body serialization, URL/query merging, multipart builder, auth injection, import parsers. *(scaffolded — Vitest + 58 tests covering body serialization incl. GraphQL, URL/query merging, multipart builder, redirects, decompression)*
- [x] Extract the request engine (`_doRequest`, body serialization, header canonicalization) into `src/core/` so it's unit-testable and shared. *(done — `src/core/{constants,headers,body,decompress,redirects,url}.ts`)*

### Phase 1 — Core Networking (P0 fixes)
> Makes Restify correct on the wire; unblocks everything else.

- [x] F1 **GraphQL**: add `graphql` branch to body serialization (`{"query": …, "variables": …}`), `Content-Type: application/json`, codegen already correct.
- [x] F3 **Redirects**: follow 3xx up to N hops (default 10), preserve method for 307/308, convert 303→GET, strip `Authorization` cross-host; add "Follow Redirects" toggle (on/auto-off) to the request.
- [x] F4 **Decompression**: inflate `Content-Encoding: gzip/deflate/br` (`zlib`); fall back to raw bytes on decode failure; only set `Accept-Encoding` when handled.
- [ ] F5 **Cookie jar**: persist cookies per domain in storage; send stored cookies for matching host/path; honor `Secure`, `Domain`, `Path`, `Expires`, `HttpOnly`; surface `Set-Cookie` in response headers (already preserved).
- [x] F7 **Proxy size cap**: apply `MAX_RESPONSE_SIZE` + size counting to the proxy path.
- [ ] F6 **Cancellation**: `AbortController`-style signal through the engine; Cancel button in the panel; history entry marked `cancelled`.
- [x] F8 **Timeouts**: `timeout` on RequestState (per-request) + default in Settings; wire both direct and proxy paths.

**Exit criteria:** unit tests for redirects, decompression, cookie matching, GraphQL body, proxy cap. Full E2E suite green. *(status: redirects ✅, decompression ✅, GraphQL body ✅, cookie matching + proxy cap pending F5/F6; HTTP + Settings E2E suites green)*

### Phase 2 — Scripting & Variables (P1)
> Turns Restify from "send and see" into "automate workflows".

- [ ] F10 **Pre-request scripts**: extend `scriptExecutor.ts` to a generic pipeline (pre → request → post); API parity (`vars`, `request`, `log`).
- [ ] F33 **Test/assertion scripts**: post-request `tests` object (`tests["status is 200"] = response.status === 200`); render pass/fail badges in response pane; store results in history.
- [ ] F16 **Dynamic variables**: `{{$guid}}`, `{{$timestamp}}`, `{{$randomInt}}`, `{{$randomAlpha}}`, `{{$randomHex}}`, `{{$envVar}}` resolved host-side before request.
- [ ] F21 **Request chaining**: after each run, expose response as `{{response.<method>.<jsonpath>}}` style or via script `set()`; picker UI in Save/history flow.
- [ ] F41 **Secret variables**: add `secret` flag to `KVItem`; store secret values in `context.secrets`/`SecretStorage`; mask in UI (dot display + reveal).
- [ ] F31 **Collection runner** (first slice): run a folder/collection sequentially, reusing the single-request engine; results grid with status/time/test badges; cancel support.
- [ ] F32 **Data-driven runs**: CSV/JSON rows as iteration variables for the runner.

**Exit criteria:** script pipeline covered by unit tests; runner E2E (2–3 request collection) passing.

### Phase 3 — Import/Export & Interop (P1/P2)
> Makes Restify a first-class citizen in existing API toolchains.

- [ ] F13 **cURL import**: robust `curl` → RequestState parser (flags, quoted args, `--data-raw`, `-H 'Header: value'`, `-u`, `-F`).
- [ ] F34 **Export to OpenAPI / HAR / .http**; F35 **Import HAR / Insomnia / .http** — mirror existing Postman/OpenAPI importers.
- [ ] F17 **Variable autocomplete** in URL/headers/body inputs (debounced suggestions from active env + globals).
- [ ] F15 **Clipboard paste** into KV tables; F14 **bulk editor** for Params/Headers.
- [ ] F53 **Codegen additions** (TypeScript fetch, Dart, Ruby, Rust, Kotlin) — low risk, mostly templates.
- [ ] F51 **.http files**: open + parse + send; export request → `.http`.
- [ ] F44 **Environment import/export** incl. Postman env JSON.

**Exit criteria:** round-trip tests (import → export → import) for curl/Postman/OpenAPI/HAR; `.http` E2E.

### Phase 4 — Productivity & UX (P2)
- [ ] F11 **OAuth 2.0**: authorization-code flow with system browser + redirect listener; token cache; refresh; PKCE.
- [ ] F22 **JSON schema validation** of responses (paste schema or pull from imported OpenAPI).
- [ ] F23 **JSONPath/XPath query** in response viewer.
- [ ] F25 **Save response to file**; F30 **completion notifications**.
- [ ] F57 **History pins + fuzzy search**; F54 **palette commands**.
- [ ] F46 **WebSocket client** (read-only connection viewer first).
- [ ] F52 **Multi-tab request panels** (biggest UX surface; defer to late phase).

### Phase 5 — Experimental / Long-term (P3)
- [ ] F28 SSE/streaming, F48 HTTP/2, F49 request compression, F50 interceptors.
- [ ] F26 response diff, F27 timeline breakdown, F24 response tree view.
- [ ] F36 OpenAPI explorer, F37 mock server, F38 docs generation.
- [ ] F39 workspace `.restify` files, F40 collection-level scripts.
- [ ] F47 gRPC, F29 response cache/offline replay, F55/F56 editor polish.

---

## Suggested First Sprint (highest value, smallest risk)

> ✅ **Complete** — all six items shipped in one sprint (see commit history); build + lint + 58 unit tests + HTTP/Settings E2E suites green.

1. **F2** — SSL default on (one-line default + warning badge)
2. **F1** — send GraphQL bodies
3. **F3** — follow redirects (toggle)
4. **F4** — gzip/deflate/br decompression
5. **F9** — unit-test scaffold for `src/core/`
6. **F8** — configurable timeout

Together these fix every known "correctness on the wire" defect and de-risk the rest of the roadmap.
