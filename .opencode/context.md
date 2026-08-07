# Context

## Project: Restify — VS Code API Client Extension

Extension ID: `restify-client` (v1.0.23), publisher "AshishBhavsar".
Root: `/Users/ashishbhasvar/Workspace/restify-vscode`

## Architecture

- **Extension entry**: `src/extension.ts` — registers providers, auto-opens main panel via `restify.openMain`
- **Main panel**: `src/panels/RestifyPanel.ts` — React webview (`src/webview/mainPanel.tsx`), HTTP execution, save/export
- **Sidebar**: `src/panels/SidebarProvider.ts` — import logic (Postman/Swagger/Restify via quick picks), renders `src/webview/sidebar.tsx`
- **Activity log**: `src/panels/ActivityProvider.ts` — bottom panel via `src/webview/bottomViewHtml.ts`
- **UI components**: `src/webview/components/` — UrlBar, TopBar, RequestPane, ResponsePane, SettingsModal, EnvManagerModal, CodeGenModal
- **Code generation**: `src/webview/utils/codegen.ts` — 11 language code generators

## Request Loading Flow (critical for test 06)

1. Sidebar click → `post({ command: 'loadRequest', data: req, collectionName })`
2. `SidebarProvider.onDidReceiveMessage` → `vscode.commands.executeCommand('restify.openFromSidebar', data)`
3. `extension.ts:81` → `vscode.commands.executeCommand('restify.openMain', data)`
4. `extension.ts:45` — `restify.openMain` **always creates a NEW RestifyPanel** and calls `panel.loadRequest(requestData)` if data provided
5. `RestifyPanel.loadRequest` → stores `this.pendingRequest = requestData`
6. If webview is ready (`this.webviewReady`), calls `_sendPendingRequest()` → `panel.webview.postMessage({ command: "loadRequest", data: ... })`
7. `mainPanel.tsx:56-178` — message handler sets request state via `setRequest(prev => ({ ...prev, ...reqData }))`

**KEY ISSUE**: `restify.openMain` creates a **new** panel each time. The URL bar was empty (`""`) in test 06 because the `loadRequest` message went to a NEW panel, not the one `findMainPanelFrame` found. The mainFrame we interact with has an empty URL bar.

## Test Automation (Playwright + @vscode/test-electron)

Located in `test/`. Uses `@vscode/test-electron` to download VS Code, then Playwright `_electron.launch` to drive it.

### Key files
- `test/utils/vscode.ts` — launch/close, frame discovery, click helpers, quick pick helpers, debug logging
- `test/specs/feature1-6.spec.ts` — consolidated E2E suites (serial, fail-fast), plus `auth.spec.ts`, `codegen.spec.ts`, `import-export.spec.ts`, `palette-commands.spec.ts`, `save-modal-dropdown.spec.ts`, `settings.spec.ts`
- `test/playwright.config.ts` — 180s timeout, workers=1

### VS Code launch args
```
--no-sandbox
--disable-gpu
--user-data-dir=<test dir>   (cleaned each run)
--extensionDevelopmentPath=<ext root>
```

Dark theme and maximize are set via settings.json written into the test user-data dir before launch.

### Critical findings

1. **Webview frame discovery is timing-dependent.** After launch, `page.frames()` may show 0 webview frames for 5-10s. The main panel webview (`RestifyPanel`) is created by `activate()` but renders lazily. Solution: retry `findMainPanelFrame` in a loop with 15s+ timeout.

2. **Sidebar icon selector**: The Restify activity bar icon does NOT have `title="Restify"` — it uses `aria-label` containing "Restify". Selector: `.part.activitybar .action-label[aria-label*="Restify"]`.

3. **Import button**: Found via `.codicon-cloud-download` in the sidebar actions area, NOT `button[title*="Import"]`.

4. **Quick pick flow**: Import triggers a VS Code quick pick widget (`.quick-input-widget`), not a webview element. Options include "Postman Collection", "OpenAPI / Swagger File", "OpenAPI / Swagger URL", "Restify Collection". After selecting, a second quick input asks for the URL. Must use `waitFor({ state: 'visible' })` not `waitForSelector` (widget can be in DOM but hidden).

5. **Main panel frame must be identified by Send button specifically**, not by `.method-trigger` or `input[placeholder*="URL"]` — sidebar webview items match those selectors too. Use `button:has-text("Send")` as the sole discriminator.

6. **Serial mode is required**: Without `test.describe.configure({ mode: 'serial' })`, each test re-runs `beforeAll`/`afterAll` independently. Serial mode ensures one launch, fail-fast on first error.

7. **Webview click problem**: `force: true` on locators inside webview iframes dispatches native click but React's event system doesn't receive it. **Solution: focus + Space** — `clickInFrame` helper tries `focus()` then `press('Space')` which works reliably. For VariableTextInput, use `evaluate()` to dispatch `mouseup` event.

8. **Sidebar CSS classes**: `.collection-group`, `.collection-header`, `.collection-requests.open`, `.group-tree`, `.group-header`, `.group-body`, `.sub-item`, `.item`

9. **Petstore import result**: 20 endpoints in 3 groups — pet (8), store (4), user (8)

10. **Each sidebar request click opens a NEW panel** — `restify.openMain` always creates a new `RestifyPanel`. Use `snapshotWebviewFrameUrls` + `waitForNewMainPanelFrame` to detect the new panel.

11. **VariableTextInput**: The URL input uses a custom component where `.url-input` is a wrapper `<div>`. When unfocused, shows `<div class="variable-text-display">` with value or `<span class="placeholder">`. When focused, shows `<input class="variable-text-input">`. Use `evaluate()` to dispatch `mouseup` event to focus.

12. **VS Code onboarding dialog**: First launch shows a "Welcome" dialog that blocks clicks. Must dismiss via `dismissOnboarding` before clicking activity bar icons.

13. **Bottom panel toggle**: The `.part.panel` element exists in DOM but may be collapsed/invisible. Use `Control+`` keyboard shortcut to toggle it open.

14. **Export collection flow**: Uses `showInputBox` (VS Code input dialog) for filename, NOT a native save dialog. Writes to workspace root via `vscode.workspace.fs.writeFile`. Selector: `button[title="Export collection"]` (per-collection) or `button[title="Export all collections"]` (toolbar). After clicking, a `.quick-input-widget` input appears for the filename.

### Test status (latest run)
- **Tests 01-17 ALL PASS** (1.2m total)
- **Test 01**: Extension opens with main panel
- **Test 02**: Open sidebar via icon click (dismisses onboarding dialog first)
- **Test 03**: Import Swagger Petstore collection (20 endpoints, 3 groups)
- **Test 04**: Verify imported collection appears in sidebar
- **Test 05**: Load a request from collection — detects NEW panel via `waitForNewMainPanelFrame`, confirms URL populated from `loadRequest`
- **Test 06**: Execute request and view response — fills URL if needed, sends via Enter, gets 200 OK response
- **Test 07**: View response logs tab — clicks Logs tab, verifies log sections
- **Test 08**: View request logs with details — checks log section content
- **Test 09**: History shows executed requests — checks sidebar for GET/petstore entries
- **Test 10**: Show code generation modal — clicks codegen button (focus+Space), verifies modal
- **Test 11**: Show environment manager — opens modal, creates environment, fills variables
- **Test 12**: Show settings modal (proxy and mTLS) — verifies proxy/cert sections
- **Test 13**: Export collection — finds export button (title="Export collection") in collections frame, handles showInputBox filename dialog
- **Test 14**: Show bottom panel (Activity) — toggles panel open via Ctrl+`
- **Test 15**: Request pane tabs overview — clicks Headers/Body/Script/Auth/Params tabs
- **Test 16**: Execute POST request with JSON body — switches method, fills URL/body
- **Test 17**: Full view: main panel with response — verifies all key elements present

### Screenshots captured so far
- `01-main-panel-empty.png`
- `02-sidebar-open.png`
- `03a-sidebar-before-import.png` through `03f-import-complete.png`
- `04-collection-in-sidebar.png`
- `05-request-loaded.png`
- `06-response-received.png` — **now shows real 200 OK response**
- `07-response-logs.png`
- `08-request-response-logs.png`
- `09-history-entries.png`
- `10-code-generation.png`
- `11-environment-manager.png`
- `12-settings-proxy-mtls.png`
- `13-export-triggered.png`
- `14-bottom-panel-activity.png`
- `15-request-headers-tab.png`, `15-request-body-tab.png`, `15-request-script-tab.png`, `15-request-auth-tab.png`
- `16-post-request-body.png`
- `17-final-overview.png`
