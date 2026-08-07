# Maintainability Guardrails

F60 — Code size and maintainability guardrails. Run the automated checks with:

```bash
npm run guardrails
```

These rules keep Restify maintainable as it grows: bounded files, clear component
boundaries, and a shared, testable core.

## 1. File-size limits

| Threshold | Limit |
|-----------|-------|
| Warn      | > 1200 lines per file |
| Error     | > 2000 lines per file (CI-blocking) |

When a file crosses the warn threshold, extract cohesive logic instead of piling
on more code. A file at the error limit **must** be split before new work lands.

## 2. Component boundaries

- `src/webview/**/*.tsx` is the React UI and runs in a **browser** context.
  It must never import the `vscode` API — such an import is a bug.
- `src/webview/*Html.ts` helpers are host-side and **may** use `vscode`
  (they build HTML strings with `vscode.Uri`). They are excluded from the check.

## 3. Shared-logic boundary

- `src/core/` is the request engine and related pure logic. It must stay free of
  `vscode` imports so it remains host-agnostic and unit-testable (Vitest runs it
  with zero VS Code mocks).

## 4. When to extract logic into `src/core/`

Extract into `src/core/` when the logic:

- **Is pure or framework-free** — no DOM, no React state, no `vscode` API, no
  `window`/`document` access. Examples: body serialization, header
  canonicalization, URL/query merging, cookie matching, dynamic-variable
  resolution, script execution and chain-variable merging, collection-runner
  aggregation, OAuth token caching, cURL parsing, codegen.
- **Is shared between the host (panel) and webview** or between multiple
  components/commands.
- **Is complex enough to unit test in isolation** (more than a couple of
  branches). If it needs tests that would otherwise require mocking the webview,
  it belongs in `src/core/`.

Heuristics for the reverse direction:

- UI state, rendering, event handling, and panel glue stay in components.
- Anything that reads `window`, `document`, `localStorage`, or `vscode.*` cannot
  live in `src/core/`.

## 5. Verification

```bash
npm run compile   # type-check + bundle
npm run lint      # eslint
npm run guardrails
npm run test:unit # vitest
```
