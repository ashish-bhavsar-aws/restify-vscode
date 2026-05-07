import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { PrettyBodyViewer, formatJSON, minifyJSON, prettyPrintXml } from './PrettyBodyViewer';

type Language = 'json' | 'xml' | 'text' | 'javascript';
type JsonFormatMode = 'formatted' | 'minified';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  jsonFormatMode?: JsonFormatMode;
  onJsonFormatModeChange?: (mode: JsonFormatMode) => void;
  placeholder?: string;
  readOnly?: boolean;
  minHeight?: string;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  jsonFormatMode = 'formatted',
  onJsonFormatModeChange,
  placeholder = 'Enter content...',
  readOnly = false,
  minHeight = '200px',
}) => {
  const [isFormatting, setIsFormatting] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol]   = useState(1);
  const [editorValue, setEditorValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  const syntaxRef  = useRef<HTMLPreElement | null>(null);
  const gutterRef  = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const jsonFormatModeRef = useRef<JsonFormatMode>(jsonFormatMode);

  useEffect(() => {
    if (isEditing) return;
    setEditorValue(value);
  }, [value, isEditing]);

  useEffect(() => {
    jsonFormatModeRef.current = jsonFormatMode;
  }, [jsonFormatMode]);

  const applyJsonFormat = useCallback((rawValue: string) => {
    if (language !== 'json' || readOnly || !rawValue.trim()) return;
    const nextValue = jsonFormatModeRef.current === 'minified' ? minifyJSON(rawValue) : formatJSON(rawValue);
    if (nextValue !== rawValue) {
      setEditorValue(nextValue);
      onChange(nextValue);
    }
  }, [language, readOnly, onChange]);

  useEffect(() => {
    if (isEditing) return;
    applyJsonFormat(editorValue);
  }, [editorValue, isEditing, applyJsonFormat]);

  /* ── Line numbers ─────────────────────────────────── */
  const lineCount = useMemo(() => Math.max(1, (editorValue || '').split('\n').length), [editorValue]);

  /* ── Syntax highlight ─────────────────────────────── */
  const highlightedHtml = useMemo(() => {
    if (!editorValue) return '';
    if (language === 'json')       return highlightJson(editorValue);
    if (language === 'xml')        return highlightXml(editorValue);
    if (language === 'javascript') return highlightJavascript(editorValue);
    return escapeHtml(editorValue);
  }, [editorValue, language]);

  /* ── Format / Minify ──────────────────────────────── */
  const formatCode = useCallback(() => {
    if (!editorValue.trim()) return;
    setIsFormatting(true);
    try {
      if (language === 'json') {
        const formatted = formatJSON(editorValue);
        jsonFormatModeRef.current = 'formatted';
        onJsonFormatModeChange?.('formatted');
        setEditorValue(formatted);
        onChange(formatted);
      } else if (language === 'xml') {
        const formatted = prettyPrintXml(editorValue);
        setEditorValue(formatted);
        onChange(formatted);
      }
    } catch { /* keep as-is */ }
    finally { setIsFormatting(false); }
  }, [editorValue, language, onChange, onJsonFormatModeChange]);

  const minifyCode = useCallback(() => {
    if (!editorValue.trim()) return;
    try {
      if (language === 'json') {
        const minified = minifyJSON(editorValue);
        jsonFormatModeRef.current = 'minified';
        onJsonFormatModeChange?.('minified');
        setEditorValue(minified);
        onChange(minified);
      } else if (language === 'xml') {
        const minified = editorValue.replace(/>\s+</g, '><').trim();
        setEditorValue(minified);
        onChange(minified);
      }
    } catch { /* keep as-is */ }
  }, [editorValue, language, onChange, onJsonFormatModeChange]);

  /* ── Scroll sync ──────────────────────────────────── */
  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (syntaxRef.current) {
      syntaxRef.current.scrollTop = ta.scrollTop;
      syntaxRef.current.scrollLeft = ta.scrollLeft;
    }
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
  }, []);

  /* ── Cursor tracking ──────────────────────────────── */
  const updateCursor = useCallback((ta: HTMLTextAreaElement) => {
    const before = ta.value.slice(0, ta.selectionStart);
    const lines  = before.split('\n');
    setCursorLine(lines.length);
    setCursorCol(lines[lines.length - 1].length + 1);
  }, []);

  /* ── Keyboard shortcuts ───────────────────────────── */
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta  = e.currentTarget;
    const start = ta.selectionStart;
    const end   = ta.selectionEnd;

    // Tab → 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const newVal = editorValue.slice(0, start) + '  ' + editorValue.slice(end);
      setEditorValue(newVal);
      onChange(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
      return;
    }

    // Enter → preserve indentation of current line
    if (e.key === 'Enter') {
      e.preventDefault();
      const before      = editorValue.slice(0, start);
      const lineStart   = before.lastIndexOf('\n') + 1;
      const currentLine = before.slice(lineStart);
      const indent      = currentLine.match(/^(\s*)/)?.[1] ?? '';
      const newVal = editorValue.slice(0, start) + '\n' + indent + editorValue.slice(end);
      setEditorValue(newVal);
      onChange(newVal);
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1 + indent.length; });
      return;
    }

    // Auto-close pairs (only when no selection)
    if (start === end) {
      const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
      if (pairs[e.key]) {
        e.preventDefault();
        const newVal = editorValue.slice(0, start) + e.key + pairs[e.key] + editorValue.slice(end);
        setEditorValue(newVal);
        onChange(newVal);
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
        return;
      }
      // Auto-close quotes — only when next char is not same quote
      if (e.key === '"' || e.key === "'") {
        const nextChar = editorValue[start];
        if (nextChar !== e.key) {
          e.preventDefault();
          const newVal = editorValue.slice(0, start) + e.key + e.key + editorValue.slice(end);
          setEditorValue(newVal);
          onChange(newVal);
          requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
          return;
        }
      }
      // Skip over closing bracket / quote if already there
      const skipOver = new Set(['}', ']', ')', '"', "'"]);
      if (skipOver.has(e.key) && editorValue[start] === e.key) {
        e.preventDefault();
        requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 1; });
        return;
      }
    }

    // Format shortcut: Shift+Alt+F
    if (e.key === 'F' && e.shiftKey && e.altKey) {
      e.preventDefault();
      formatCode();
    }
  }, [editorValue, onChange, formatCode]);

  const canFormat = language === 'json' || language === 'xml';
  const langLabel = language === 'javascript' ? 'JS' : language.toUpperCase();
  const showPrettyViewer = (language === 'json' || language === 'xml') && !readOnly && !isEditing;

  const focusEditor = useCallback(() => {
    setIsEditing(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  return (
    <div className="code-editor-wrapper">
      {/* ── Toolbar ── */}
      <div className="code-editor-toolbar">
        <div className="toolbar-buttons">
          {canFormat && (
            <>
              <button className="editor-btn" onClick={formatCode} disabled={isFormatting || !editorValue.trim() || readOnly} title="Format (Shift+Alt+F)">
                {isFormatting ? '⏳' : '✨'} Format
              </button>
              <button className="editor-btn" onClick={minifyCode} disabled={!editorValue.trim() || readOnly} title="Minify">
                📦 Minify
              </button>
            </>
          )}
          <span className="language-badge">{langLabel}</span>
        </div>
      </div>

      {/* ── Editor body: gutter + shell ── */}
      <div className="code-editor-body" style={{ minHeight }}>
        {/* Line number gutter */}
        {!showPrettyViewer && (
          <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
            {Array.from({ length: lineCount }, (_, i) => (
              <div key={i + 1} className={i + 1 === cursorLine && !readOnly ? 'gutter-line active-gutter-line' : 'gutter-line'}>
                {i + 1}
              </div>
            ))}
          </div>
        )}

        {/* Shell (syntax pre + textarea overlay) */}
        <div className="code-editor-shell">
          {showPrettyViewer ? (
            <PrettyBodyViewer
              text={editorValue}
              language={language}
              jsonMode={jsonFormatModeRef.current}
              placeholder={placeholder}
              className="code-editor-pretty-viewer"
              onActivate={focusEditor}
            />
          ) : (
            <pre
              ref={syntaxRef}
              aria-hidden="true"
              className={`code-editor-syntax code-editor-${language} ${readOnly ? 'readonly' : ''}`}
              dangerouslySetInnerHTML={{ __html: highlightedHtml || '<span class="syntax-placeholder"> </span>' }}
            />
          )}
          {!readOnly && (
            <>
              {!editorValue && !showPrettyViewer && <div className="code-editor-placeholder">{placeholder}</div>}
              <textarea
                ref={textareaRef}
                className={`code-editor code-editor-overlay code-editor-${language}${showPrettyViewer ? ' hidden-editor' : ''}`}
                value={editorValue}
                onChange={(e) => { setEditorValue(e.target.value); onChange(e.target.value); updateCursor(e.target); }}
                onFocus={(e) => { setIsEditing(true); updateCursor(e.currentTarget); }}
                onBlur={(e) => {
                  applyJsonFormat(e.currentTarget.value);
                  setIsEditing(false);
                }}
                onClick={(e)  => updateCursor(e.currentTarget)}
                onKeyUp={(e)  => updateCursor(e.currentTarget)}
                onKeyDown={handleKeyDown}
                onScroll={handleScroll}
                placeholder=""
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </>
          )}
        </div>
      </div>

      {/* ── Status bar ── */}
      {!readOnly && (
        <div className="code-editor-statusbar">
          <span>Ln {cursorLine}, Col {cursorCol}</span>
          <span>{lineCount} lines</span>
          {(language === 'json' || language === 'xml') && (
            <span className="statusbar-hint">Shift+Alt+F to format</span>
          )}
          {language === 'javascript' && (
            <span className="statusbar-hint">Tab = indent · {'{ [ ('} auto-close</span>
          )}
        </div>
      )}
    </div>
  );
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function highlightJson(text: string): string {
  const escaped = escapeHtml(text);
  // eslint-disable-next-line no-useless-escape
  return escaped.replace(
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*")\s*(:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g,
    (match, stringPart, isKeyColon, literal) => {
      if (stringPart) {
        return isKeyColon
          ? `<span class="syntax-json-key">${stringPart}</span><span class="syntax-json-punctuation">:</span>`
          : `<span class="syntax-json-string">${stringPart}</span>`;
      }
      if (literal === 'true' || literal === 'false') {
        return `<span class="syntax-json-boolean">${match}</span>`;
      }
      if (literal === 'null') {
        return `<span class="syntax-json-null">${match}</span>`;
      }
      return `<span class="syntax-json-number">${match}</span>`;
    }
  );
}

function highlightXml(text: string): string {
  const escaped = escapeHtml(text);

  return escaped
    .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="syntax-xml-comment">$1</span>')
    .replace(
      /(&lt;\/?)([a-zA-Z_][\w:.-]*)([^&]*?)(\/?&gt;)/g,
      (_, open, tagName, attrs, close) => {
        const highlightedAttrs = attrs.replace(
          /\s+([a-zA-Z_:][\w:.-]*)(=)(&quot;[^&]*?&quot;|&#39;[^&]*?&#39;)/g,
          ' <span class="syntax-xml-attr">$1</span><span class="syntax-xml-punctuation">$2</span><span class="syntax-xml-value">$3</span>'
        );
        return `<span class="syntax-xml-punctuation">${open}</span><span class="syntax-xml-tag">${tagName}</span>${highlightedAttrs}<span class="syntax-xml-punctuation">${close}</span>`;
      }
    );
}

function highlightJavascript(text: string): string {
  // Process line-by-line to handle comments reliably
  const lines = text.split('\n');
  const result: string[] = [];

  for (const raw of lines) {
    const line = escapeHtml(raw);

    // single-line comment (must run before string replacement)
    const commentIdx = findCommentStart(raw);

    let codePart  = commentIdx === -1 ? line : escapeHtml(raw.slice(0, commentIdx));
    const commentPart = commentIdx === -1 ? '' : `<span class="syntax-js-comment">${escapeHtml(raw.slice(commentIdx))}</span>`;

    // strings: "...", '...', `...`
    codePart = codePart.replace(
      /(&quot;(?:[^&\\]|\\[\s\S])*?&quot;|&#39;(?:[^&\\]|\\[\s\S])*?&#39;|`[^`]*`)/g,
      '<span class="syntax-js-string">$1</span>'
    );

    // keywords
    codePart = codePart.replace(
      /\b(const|let|var|function|return|if|else|else\s+if|for|while|do|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|void|delete|in|of|switch|case|default|class|extends|super|import|export|from|async|await|null|undefined|true|false|NaN|Infinity)\b/g,
      '<span class="syntax-js-keyword">$1</span>'
    );

    // numbers
    codePart = codePart.replace(
      /(?<![a-zA-Z_$])(\d+\.?\d*(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+)\b/g,
      '<span class="syntax-js-number">$1</span>'
    );

    // built-ins / globals
    codePart = codePart.replace(
      /\b(console|Math|JSON|Object|Array|String|Number|Boolean|Promise|setTimeout|clearTimeout|setInterval|clearInterval|response|vars|set|log|headers|status|statusText)\b/g,
      '<span class="syntax-js-builtin">$1</span>'
    );

    result.push(codePart + commentPart);
  }

  return result.join('\n');
}

/** Find position of `//` comment that isn't inside a string */
function findCommentStart(raw: string): number {
  let inStr: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
      if (ch === '/' && raw[i + 1] === '/') return i;
    }
  }
  return -1;
}
