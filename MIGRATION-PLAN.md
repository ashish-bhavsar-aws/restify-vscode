# Migration Plan: restify-vscode → styled-components v6

**Date**: 2026-07-12
**Status**: COMPLETE

## Overview
- **Scope**: 3 CSS files (~3,464 lines), 15+ React components, 3 webview entry points
- **Approach**: Component-by-component, ThemeProvider with CSS vars
- **styled-components** v6.4.3 already in `package.json` but unused

## Key Technical Decisions

### Theme Architecture
- `ThemeProvider` wraps each webview root
- Theme object maps friendly names → `var(--vscode-*)` CSS custom properties
- CSS vars defined in `:root {}` via `createGlobalStyle`
- Dark/light theme switching via `body.vscode-dark` / `body.vscode-light` classes (unchanged)
- Method colors (GET green, POST orange) via `methodColor(method, kind)` utility function

### What stays global (createGlobalStyle)
- CSS reset (`*, *::before, *::after { box-sizing: border-box }`)
- `:root` CSS custom property definitions (`--bg`, `--fg`, `--border`, etc.)
- Body styles (background, font, overflow)
- `#root` height/flex layout
- Scrollbar styles (`::-webkit-scrollbar`)
- Syntax highlighting colors (`.syntax-json-key`, etc.) — target CodeMirror classes
- CodeMirror theme overrides (`.cm-response-viewer .cm-*`)
- `@keyframes` animations (loading, spin)
- Form element base styles (`input, textarea, select`)

### What becomes styled components
- All component-specific layouts and styles
- Dynamic class toggles → transient props (`$active`, `$open`, `$disabled`)
- Inline `style={}` → styled component props

### Files structure
```
src/webview/
├── theme/
│   ├── index.ts          # Theme type, theme object, ThemeProvider export
│   ├── GlobalStyles.ts   # createGlobalStyle for resets + CSS vars
│   └── methodColors.ts   # Method color maps (light/dark)
├── styles/
│   ├── modals.ts         # Shared modal styled components
│   ├── buttons.ts        # Shared button styled components
│   └── inputs.ts         # Shared input styled components
```

## Phase 1: Shared Theme Infrastructure ✅ IN PROGRESS

### 1.1 Create `src/webview/theme/index.ts`
```typescript
// Theme type definition
// Theme object mapping names → var(--vscode-*) references
// Re-export ThemeProvider from styled-components
```

### 1.2 Create `src/webview/theme/GlobalStyles.ts`
```typescript
// createGlobalStyle with:
// - CSS reset
// - :root CSS variable definitions
// - Body styles
// - Scrollbar styles
// - Syntax highlighting colors
// - Keyframe animations
// - Form element base styles
```

### 1.3 Create `src/webview/theme/methodColors.ts`
```typescript
// METHOD_COLORS_LIGHT and METHOD_COLORS_DARK maps
// getMethodColor(method: string, isDark: boolean): string
```

## Phase 2: Entry Points ✅ PENDING

### 2.1 Update `src/webview/main.tsx`
- Import ThemeProvider and theme
- Wrap MainPanel in ThemeProvider
- Apply theme class to body

### 2.2 Update `src/webview/sidebar-main.tsx`
- Same ThemeProvider wrapping

### 2.3 Update `src/webview/bottom-view/index.tsx`
- Same ThemeProvider wrapping

## Phase 3: Component Migration ✅ PENDING

### Migration Order (simplest → most complex)

| # | Component | CSS Lines | Complexity | Notes |
|---|-----------|-----------|------------|-------|
| 1 | BottomView | ~127 | Low | Validates approach |
| 2 | FaIcon | ~0 | Trivial | className pass-through |
| 3 | VariableDisplay | ~15 | Low | 2 styled variants |
| 4 | VariableTextInput | ~60 | Low | 3 styled elements |
| 5 | TopBar | ~200 | Medium | Env dropdown, brand |
| 6 | UrlBar | ~250 | Medium | Method dropdown, URL input |
| 7 | SaveModal | ~50 | Low | Shared modal pattern |
| 8 | SettingsModal | ~150 | Medium | Proxy, mTLS cert UI |
| 9 | EnvManagerModal | ~120 | Medium | Env list + variable table |
| 10 | CodeGenModal | ~80 | Medium | Language selector + code block |
| 11 | KeyValueTable | ~200 | Medium | Rows, autocomplete dropdown |
| 12 | CodeEditor | ~250 | High | Gutter, syntax overlay, statusbar |
| 13 | PrettyBodyViewer | ~100 | Medium | CodeMirror theme integration |
| 14 | PdfViewer | ~20 | Low | Spinner + error states |
| 15 | RequestPane | ~300 | High | Tabs, auth panel, body type bar |
| 16 | ResponsePane | ~250 | High | Status bar, tabs, response body |
| 17 | Sidebar | ~348 | High | History, collections, drag-drop |
| 18 | MainPanel | ~500 | High | Orchestration, split pane |

### Per-Component Migration Steps
1. Read component's current CSS class usage
2. Create `styled.xxx` for each CSS class
3. Replace `className="foo"` with `<Foo>` styled component
4. Replace dynamic classes with transient props
5. Move inline styles to styled components
6. Remove CSS import

## Phase 4: Cleanup ✅ PENDING

### 4.1 Remove CSS imports
- Remove `import './MainPanel.css'` from `mainPanel.tsx`
- Remove `import './Sidebar.css'` from `sidebar.tsx`
- Remove `import './BottomView.css'` from `BottomView.tsx`

### 4.2 Delete CSS files
- Delete `src/webview/MainPanel.css`
- Delete `src/webview/Sidebar.css`
- Delete `src/webview/bottom-view/BottomView.css`

### 4.3 Update HTML templates
- Remove `<link rel="stylesheet" href="...">` from:
  - `mainPanelHtml.ts`
  - `sidebarHtml.ts`
  - `bottomViewHtml.ts`

### 4.4 Update webpack config
- Keep `css-loader` for third-party CSS (CodeMirror)
- Remove `MiniCssExtractPlugin` entries for webview CSS
- Remove CSS rule from webview configs

## Phase 5: Verification ✅ PENDING

### 5.1 Build
```bash
npm run compile
```

### 5.2 Lint
```bash
npm run lint
```

### 5.3 Manual Testing
- Open main panel → verify all UI renders correctly
- Toggle light/dark theme → verify colors update
- Test method dropdown colors
- Test modal dialogs
- Test sidebar history/collections
- Test bottom activity panel
- Test drag-and-drop in collections
- Test code editor with syntax highlighting

## CSS Class → Styled Component Mapping

### MainPanel.css Classes (2989 lines)
```
:root → createGlobalStyle
body → createGlobalStyle
body.vscode-dark → createGlobalStyle
#root → createGlobalStyle
.restify-container → StyledContainer
.top-bar → StyledTopBar
.brand-icon → StyledBrandIcon
.brand → StyledBrand
.request-name-input → StyledRequestNameInput
.request-name-wrapper → StyledRequestNameWrapper
.dirty-dot → StyledDirtyDot
.env-dropdown → StyledEnvDropdown
.env-trigger → StyledEnvTrigger
.env-trigger-label → StyledEnvTriggerLabel
.env-chevron → StyledEnvChevron
.env-menu → StyledEnvMenu
.env-option → StyledEnvOption
.gear-btn → StyledGearBtn
.manage-env-btn → StyledManageEnvBtn
.codegen-btn → StyledCodegenBtn
.loading-bar → StyledLoadingBar
.spinner → StyledSpinner
.ssl-lock-btn → StyledSslLockBtn
.url-bar → StyledUrlBar
.method-dropdown → StyledMethodDropdown
.method-trigger → StyledMethodTrigger
.method-trigger-label → StyledMethodTriggerLabel
.method-chevron → StyledMethodChevron
.method-menu → StyledMethodMenu
.method-option → StyledMethodOption
.method-option-dot → StyledMethodOptionDot
.method-option-label → StyledMethodOptionLabel
[data-method="*"] → methodColor utility
.url-input → StyledUrlInput
.url-input-wrapper → StyledUrlInputWrapper
.send-btn → StyledSendBtn
.save-btn → StyledSaveBtn
.ssl-row → StyledSslRow
.main-area → StyledMainArea
.split-pane → StyledSplitPane
.resizer → StyledResizer
.tab-bar → StyledTabBar
.tab → StyledTab
.tab-badge → StyledTabBadge
.tab-badge-dot → StyledTabBadgeDot
.used-vars-strip → StyledUsedVarsStrip
.used-var-chip → StyledUsedVarChip
.tab-content → StyledTabContent
.scroll-area → StyledScrollArea
.request-pane → StyledRequestPane
.kv-wrap → StyledKvWrap
.kv-row → StyledKvRow
.kv-check → StyledKvCheck
.kv-input → StyledKvInput
.kv-value-wrapper → StyledKvValueWrapper
.kv-value-preview → StyledKvValuePreview
.kv-del → StyledKvDel
.add-row-btn → StyledAddRowBtn
.variable-tag → StyledVariableTag
.form-key-wrapper → StyledFormKeyWrapper
.form-type-select → StyledFormTypeSelect
.form-file-wrapper → StyledFormFileWrapper
.form-file-input → StyledFormFileInput
.form-file-name → StyledFormFileName
.body-type-bar → StyledBodyTypeBar
.body-type-btn → StyledBodyTypeBtn
.code-editor → StyledCodeEditor
.code-editor-wrapper → StyledCodeEditorWrapper
.code-editor-toolbar → StyledCodeEditorToolbar
.toolbar-buttons → StyledToolbarButtons
.editor-btn → StyledEditorBtn
.language-badge → StyledLanguageBadge
.code-editor-shell → StyledCodeEditorShell
.code-editor-content → StyledCodeEditorContent
.code-editor-syntax → StyledCodeEditorSyntax
.code-editor-overlay → StyledCodeEditorOverlay
.code-editor-ruler → StyledCodeEditorRuler
.code-editor-body → StyledCodeEditorBody
.code-editor-gutter → StyledCodeEditorGutter
.code-editor-statusbar → StyledCodeEditorStatusbar
.statusbar-hint → StyledStatusbarHint
.code-editor-placeholder → StyledCodeEditorPlaceholder
.variable-text-input-wrapper → StyledVariableTextInputWrapper
.variable-text-display → StyledVariableTextDisplay
.variable-text-input → StyledVariableTextInput
.auth-fields → StyledAuthFields
.auth-input → StyledAuthInput
.field-label → StyledFieldLabel
.auth-select → StyledAuthSelect
.auth-type-dropdown → StyledAuthTypeDropdown
.auth-type-trigger → StyledAuthTypeTrigger
.auth-type-menu → StyledAuthTypeMenu
.auth-type-option → StyledAuthTypeOption
.add-to-dropdown → StyledAddToDropdown
.add-to-trigger → StyledAddToTrigger
.add-to-menu → StyledAddToMenu
.add-to-option → StyledAddToOption
.response-pane → StyledResponsePane
.response-empty → StyledResponseEmpty
.response-status-bar → StyledResponseStatusBar
.status-code → StyledStatusCode
.status-text → StyledStatusText
.meta-chip → StyledMetaChip
.copy-btn → StyledCopyBtn
.response-actions → StyledResponseActions
.response-body → StyledResponseBody
.request-log → StyledRequestLog
.log-section → StyledLogSection
.log-title → StyledLogTitle
.modal-overlay → StyledModalOverlay
.modal → StyledModal
.modal-label → StyledModalLabel
.modal-input → StyledModalInput
.modal-actions → StyledModalActions
.btn → StyledBtn
.btn-ghost → StyledBtnGhost
.btn-secondary → StyledBtnSecondary
.btn-remove → StyledBtnRemove
.settings-modal → StyledSettingsModal
.settings-section → StyledSettingsSection
.proxy-row → StyledProxyRow
.proxy-field → StyledProxyField
.checkbox-label → StyledCheckboxLabel
.proxy-auth-section → StyledProxyAuthSection
.tags-container → StyledTagsContainer
.tag → StyledTag
.tag-remove → StyledTagRemove
.cert-list → StyledCertList
.cert-entry → StyledCertEntry
.cert-header → StyledCertHeader
.cert-toggle → StyledCertToggle
.cert-content → StyledCertContent
.cert-form → StyledCertForm
.helper-text → StyledHelperText
.env-manager-modal → StyledEnvManagerModal
.modal-header → StyledModalHeader
.modal-close-btn → StyledModalCloseBtn
.env-manager-list → StyledEnvManagerList
.env-manager-item → StyledEnvManagerItem
.env-radio-btn → StyledEnvRadioBtn
.env-item-info → StyledEnvItemInfo
.env-item-name → StyledEnvItemName
.env-item-count → StyledEnvItemCount
.env-empty → StyledEnvEmpty
.btn-icon-sm → StyledBtnIconSm
.env-vars-label → StyledEnvVarsLabel
.env-vars-scroll → StyledEnvVarsScroll
.env-vars-table → StyledEnvVarsTable
.env-var-input → StyledEnvVarInput
.add-var-btn → StyledAddVarBtn
.codegen-modal → StyledCodegenModal
.codegen-header → StyledCodegenHeader
.codegen-container → StyledCodegenContainer
.codegen-left → StyledCodegenLeft
.codegen-lang → StyledCodegenLang
.codegen-right → StyledCodegenRight
.code-meta → StyledCodeMeta
.code-block → StyledCodeBlock
```

### Sidebar.css Classes (348 lines)
```
.sidebar-container → StyledSidebarContainer
.toolbar → StyledToolbar
.toolbar-label → StyledToolbarLabel
.search-wrapper → StyledSearchWrapper
.search-icon → StyledSearchIcon
.search-input → StyledSearchInput
.btn → (shared)
.btn-ghost → (shared)
.btn-icon → StyledBtnIcon
.list → StyledList
.empty → StyledEmpty
.empty-icon → StyledEmptyIcon
.empty-sub → StyledEmptySub
.item → StyledItem
.item-content → StyledItemContent
.item-name → StyledItemName
.item-meta → StyledItemMeta
.item-right → StyledItemRight
.status-row → StyledStatusRow
.status-text → StyledStatusText
.time → StyledTime
.method-badge → StyledMethodBadge
.status-dot → StyledStatusDot
.collection-group → StyledCollectionGroup
.collection-header → StyledCollectionHeader
.caret → StyledCaret
.collection-name → StyledCollectionName
.collection-count → StyledCollectionCount
.collection-requests → StyledCollectionRequests
.sub-item → StyledSubItem
.sub-name → StyledSubName
.sub-empty → StyledSubEmpty
.drag-handle → StyledDragHandle
.drop-indicator → StyledDropIndicator
.group-tree → StyledGroupTree
.group-header → StyledGroupHeader
.group-folder-icon → StyledGroupFolderIcon
.group-name → StyledGroupName
.group-body → StyledGroupBody
.new-group-inline → StyledNewGroupInline
.btn-add-group → StyledBtnAddGroup
.btn-copy → StyledBtnCopy
.btn-rename-col → StyledBtnRenameCol
.btn-rename-req → StyledBtnRenameReq
.toolbar-icons → StyledToolbarIcons
.toolbar-expand → StyledToolbarExpand
.toolbar-new → StyledToolbarNew
.active-env-chip → StyledActiveEnvChip
.inline-rename → StyledInlineRename
.item-actions → StyledItemActions
.btn-save-history → StyledBtnSaveHistory
```

### BottomView.css Classes (127 lines)
```
.bottom-view → StyledBottomView
.bottom-view__toolbar → StyledToolbar
.bottom-view__title → StyledTitle
.bottom-view__clear → StyledClearBtn
.empty-state → StyledEmptyState
.entry-list → StyledEntryList
.entry → StyledEntry
.entry--warning → (transient prop $level)
.entry--error → (transient prop $level)
.entry--info → (transient prop $level)
.entry__header → StyledEntryHeader
.entry__title → StyledEntryTitle
.entry__time → StyledEntryTime
.entry__detail → StyledEntryDetail
```

## Shared Styled Components

### modals.ts
```typescript
export const ModalOverlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => $open ? 'flex' : 'none'};
  position: fixed; inset: 0;
  background: rgba(0, 0, 0, .6);
  z-index: 200;
  align-items: center; justify-content: center;
`;

export const Modal = styled.div<{ $large?: boolean }>`
  background: var(--vscode-editor-background, #1e1e2e);
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 18px;
  width: ${({ $large }) => $large ? 'min(820px, calc(100vw - 40px))' : '340px'};
  box-shadow: 0 20px 60px rgba(0, 0, 0, .6);
`;

// etc.
```

### buttons.ts
```typescript
export const Btn = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: inherit;
  transition: opacity .15s;
  &:hover { opacity: .85; }
`;

// etc.
```

## Progress Log

- [x] Phase 1: Shared theme infrastructure
- [x] Phase 2: Entry points
- [x] Phase 3: Component migration
- [x] Phase 4: Cleanup
- [x] Phase 5: Verification (build + lint pass)

## Completion Summary

- All 18 components migrated to styled-components
- All 3 CSS files deleted (`MainPanel.css`, `Sidebar.css`, `BottomView.css`)
- All 3 HTML templates cleaned of `<link rel="stylesheet">` tags
- `MiniCssExtractPlugin` removed from all 3 webview webpack configs
- CSS loader rules removed from all webview configs
- `GlobalStyles.ts` creates global CSS via `createGlobalStyle` (reset, vars, scrollbar, syntax colors)
- `FaIcon` refactored to use `styled.span` wrapper to avoid styled-components v6 type conflicts
- `DefaultTheme` augmented via module declaration for theme type safety
- Build (`npm run compile`) and lint (`npm run lint`) pass cleanly
