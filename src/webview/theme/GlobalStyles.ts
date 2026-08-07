import { createGlobalStyle } from 'styled-components';

const GlobalStyles = createGlobalStyle`
  /* ─── CSS Custom Properties ──────────────────────────────── */
  :root {
    /* Core */
    --bg:        var(--vscode-editor-background);
    --fg:        var(--vscode-editor-foreground);
    --border:    var(--vscode-panel-border, var(--vscode-editorGroup-border, rgba(128,128,128,0.3)));
    --input-bg:  var(--vscode-input-background);
    --input-fg:  var(--vscode-input-foreground);
    --accent:    var(--vscode-button-background, #0078d4);
    --accent-fg: var(--vscode-button-foreground, #ffffff);
    --accent-2:  var(--vscode-textLink-foreground, #388bfd);
    --surface:   var(--vscode-sideBar-background, var(--vscode-editor-background));
    --surface-2: var(--vscode-dropdown-background, var(--vscode-input-background));
    --hover:     var(--vscode-list-hoverBackground, rgba(128,128,128,0.1));
    --muted:     color-mix(in srgb, var(--vscode-descriptionForeground, rgba(128,128,128,0.8)) 60%, #000000);

    /* Semantic — light-safe defaults using VS Code tokens */
    --error:   var(--vscode-errorForeground, #cf222e);
    --warning: var(--vscode-warningForeground, #9a6700);
    --success: var(--vscode-charts-green, #2da44e);
    --info:    var(--vscode-textLink-foreground, #3794ff);

    /* Gutter / line numbers */
    --line-number-bg:        var(--vscode-editorGutter-background, var(--vscode-editor-background));
    --line-number-fg:        var(--vscode-editorLineNumber-foreground, rgba(128,128,128,0.5));
    --line-number-active-fg: var(--vscode-editorLineNumber-activeForeground, var(--vscode-editor-foreground));

    /* Radius */
    --radius: var(--vscode-widgets-border-radius, 8px);

    /* Method badge colors — light defaults */
    --tag-get:    #1a7f37;
    --tag-post:   #0550ae;
    --tag-put:    #9a6700;
    --tag-delete: #cf222e;
    --tag-patch:  #8250df;
    --tag-head:   #4d5970;
    --tag-options: #bf3989;

    /* Bottom view / widget tokens */
    --card:        var(--vscode-sideBar-background, #252526);
    --card-strong: color-mix(in srgb, var(--card) 86%, transparent);

    /* Focus ring */
    --focus-border: var(--vscode-focusBorder, #007fd4);

    /* Shadows & overlays */
    --shadow-sm: var(--vscode-widget-shadow, 0 1px 3px rgba(0,0,0,0.12));
    --shadow-md: var(--vscode-widget-shadow, 0 4px 12px rgba(0,0,0,0.15));
    --shadow-lg: var(--vscode-widget-shadow, 0 8px 24px rgba(0,0,0,0.2));
    --overlay-bg: var(--vscode-overlay-background, rgba(0,0,0,0.5));
    --inner-highlight: color-mix(in srgb, var(--fg) 3%, transparent);
  }

  /* Dark-theme overrides for semantic colors */
  body.vscode-dark {
    --success:  var(--vscode-charts-green, #7ee787);
    --warning:  var(--vscode-charts-yellow, #e3b341);
    --error:    var(--vscode-errorForeground, #ffa198);
    --info:     var(--vscode-textLink-foreground, #d2a8ff);
    --accent-2: var(--vscode-textLink-foreground, #d2a8ff);

    --tag-get:    #7ee787;
    --tag-post:   #79c0ff;
    --tag-put:    #e3b341;
    --tag-delete: #ffa198;
    --tag-patch:  #d2a8ff;
    --tag-head:   #90a4ae;
    --tag-options: #f778ba;
  }

  /* High-contrast overrides */
  body.vscode-high-contrast {
    --success:  var(--vscode-charts-green, #7ee787);
    --warning:  var(--vscode-charts-yellow, #e3b341);
    --error:    var(--vscode-errorForeground, #ffa198);
    --border:   var(--vscode-panel-border, rgba(255,255,255,0.3));

    --tag-get:    #7ee787;
    --tag-post:   #79c0ff;
    --tag-put:    #e3b341;
    --tag-delete: #ffa198;
    --tag-patch:  #d2a8ff;
    --tag-head:   #90a4ae;
    --tag-options: #f778ba;
  }

  /* ─── Reset ───────────────────────────────────────────────── */
  *, *::before, *::after {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ─── Form Elements ───────────────────────────────────────── */
  input, textarea, select {
    background-color: var(--input-bg);
    color: var(--input-fg);
    outline: none;
  }
  input:focus, textarea:focus, select:focus {
    background-color: var(--input-bg);
    color: var(--input-fg);
    outline: none;
  }

  /* ─── Body ────────────────────────────────────────────────── */
  body {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--surface) 82%, transparent), transparent 26%),
      linear-gradient(135deg, color-mix(in srgb, var(--accent) 4%, transparent), transparent 34%),
      var(--bg);
    color: var(--fg);
    font-family: var(--vscode-font-family, 'Segoe UI', system-ui, sans-serif);
    font-size: 13px;
    height: 100vh;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  #root {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  /* ─── Scrollbar ───────────────────────────────────────────── */
  ::-webkit-scrollbar {
    width: 5px;
    height: 5px;
  }
  ::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background, rgba(128,128,128,0.4));
    border-radius: 3px;
  }
  ::-webkit-scrollbar-track {
    background: transparent;
  }

  /* ─── Keyframes ───────────────────────────────────────────── */
  @keyframes loading {
    0%   { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ─── Syntax Colors (Dark defaults) ──────────────────────── */
  .syntax-json-key      { color: #89b4fa; }
  .syntax-json-string   { color: #a6e3a1; }
  .syntax-json-number   { color: #fab387; }
  .syntax-json-boolean  { color: #cba6f7; }
  .syntax-json-null     { color: #f38ba8; }
  .syntax-json-punctuation { color: var(--muted); }

  .syntax-xml-tag       { color: #89b4fa; }
  .syntax-xml-attr      { color: #f9e2af; }
  .syntax-xml-value     { color: #a6e3a1; }
  .syntax-xml-comment   { color: #6c7086; font-style: italic; }
  .syntax-xml-punctuation { color: var(--muted); }

  .syntax-js-keyword { color: #cba6f7; font-weight: 600; }
  .syntax-js-string  { color: #a6e3a1; }
  .syntax-js-number  { color: #fab387; }
  .syntax-js-comment { color: #6c7086; font-style: italic; }
  .syntax-js-builtin { color: #89dceb; }

  /* ─── Syntax Colors (Light overrides) ────────────────────── */
  body.vscode-light .syntax-json-key     { color: #0550ae; }
  body.vscode-light .syntax-json-string  { color: #116329; }
  body.vscode-light .syntax-json-number  { color: #953800; }
  body.vscode-light .syntax-json-boolean { color: #8250df; }
  body.vscode-light .syntax-json-null    { color: #cf222e; }

  body.vscode-light .syntax-xml-tag      { color: #0550ae; }
  body.vscode-light .syntax-xml-attr     { color: #953800; }
  body.vscode-light .syntax-xml-value    { color: #116329; }
  body.vscode-light .syntax-xml-comment  { color: #6e7781; }

  body.vscode-light .syntax-js-keyword { color: #cf222e; }
  body.vscode-light .syntax-js-string  { color: #0a3069; }
  body.vscode-light .syntax-js-number  { color: #953800; }
  body.vscode-light .syntax-js-comment { color: #6e7781; }
  body.vscode-light .syntax-js-builtin { color: #8250df; }

  /* ─── High-contrast syntax overrides ─────────────────────── */
  body.vscode-high-contrast .syntax-json-key,
  body.vscode-high-contrast .syntax-xml-tag { color: #1e90ff; }
  body.vscode-high-contrast .syntax-json-string,
  body.vscode-high-contrast .syntax-xml-value { color: #ce9178; }
  body.vscode-high-contrast .syntax-json-number { color: #b5cea8; }
  body.vscode-high-contrast .syntax-json-boolean,
  body.vscode-high-contrast .syntax-js-keyword { color: #569cd6; }
  body.vscode-high-contrast .syntax-json-null { color: #d16969; }

  /* ─── CodeMirror Response Viewer ─────────────────────────── */
  .cm-response-viewer .cm-response-search-match {
    background: color-mix(in srgb, var(--accent, #89b4fa) 50%, transparent);
    color: var(--fg);
    border-radius: 2px;
    outline: 1px solid color-mix(in srgb, var(--accent, #89b4fa) 60%, transparent);
  }

  .cm-response-viewer .cm-response-json-key,
  .cm-response-viewer .cm-response-xml-tag {
    color: #89b4fa;
    font-weight: 600;
  }
  .cm-response-viewer .cm-response-json-string,
  .cm-response-viewer .cm-response-xml-attr-value { color: #a6e3a1; }
  .cm-response-viewer .cm-response-json-number { color: #fab387; }
  .cm-response-viewer .cm-response-json-boolean { color: #cba6f7; }
  .cm-response-viewer .cm-response-json-null,
  .cm-response-viewer .cm-response-xml-comment { color: #6c7086; }
  .cm-response-viewer .cm-response-xml-attr-name { color: #f9e2af; }

  body.vscode-light .cm-response-viewer .cm-response-json-key,
  body.vscode-light .cm-response-viewer .cm-response-xml-tag { color: #0550ae; }
  body.vscode-light .cm-response-viewer .cm-response-json-string,
  body.vscode-light .cm-response-viewer .cm-response-xml-attr-value { color: #116329; }
  body.vscode-light .cm-response-viewer .cm-response-json-number { color: #953800; }
  body.vscode-light .cm-response-viewer .cm-response-json-boolean { color: #8250df; }
  body.vscode-light .cm-response-viewer .cm-response-json-null,
  body.vscode-light .cm-response-viewer .cm-response-xml-comment { color: #6e7781; }
  body.vscode-light .cm-response-viewer .cm-response-xml-attr-name { color: #7d4e00; }

  body.vscode-high-contrast .cm-response-viewer .cm-response-json-key,
  body.vscode-high-contrast .cm-response-viewer .cm-response-xml-tag { color: #1e90ff; }
  body.vscode-high-contrast .cm-response-viewer .cm-response-json-string,
  body.vscode-high-contrast .cm-response-viewer .cm-response-xml-attr-value { color: #ce9178; }

  /* ─── JSON Viewer Token Colors ───────────────────────────── */
  .json-key     { color: #89b4fa; font-weight: 600; }
  .json-string  { color: #a6e3a1; }
  .json-number  { color: #fab387; }
  .json-boolean { color: #cba6f7; }
  .json-null    { color: #f38ba8; }
  .json-bracket { color: var(--muted); }
  .json-colon   { color: var(--muted); }

  body.vscode-light .json-key     { color: #0550ae; }
  body.vscode-light .json-string  { color: #116329; }
  body.vscode-light .json-number  { color: #953800; }
  body.vscode-light .json-boolean { color: #8250df; }
  body.vscode-light .json-null    { color: #cf222e; }

  /* ─── XML Viewer Token Colors ────────────────────────────── */
  .xml-tag   { color: #89b4fa; font-weight: 600; }
  .xml-attr  { color: #f9e2af; font-weight: 500; }
  .xml-value { color: #a6e3a1; }
  .xml-bracket { color: var(--muted); }
  .xml-attr-name  { color: #f9e2af; font-weight: 500; }
  .xml-attr-value { color: #a6e3a1; }

  body.vscode-light .xml-tag   { color: #0550ae; }
  body.vscode-light .xml-attr  { color: #953800; }
  body.vscode-light .xml-value { color: #116329; }
  body.vscode-light .xml-attr-name  { color: #953800; }
  body.vscode-light .xml-attr-value { color: #116329; }
`;

export default GlobalStyles;
