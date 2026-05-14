import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatJSON, minifyJSON, prettyPrintXml } from './PrettyBodyViewer';

type Language = 'json' | 'xml' | 'text' | 'javascript';
type JsonFormatMode = 'formatted' | 'minified';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: Language;
  themeKind?: number;
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
  themeKind: _themeKind,
  jsonFormatMode = 'formatted',
  onJsonFormatModeChange,
  placeholder = 'Enter content...',
  readOnly = false,
  minHeight = '200px',
}) => {
  void _themeKind;

  const getLineCount = useCallback((text: string) => (text ? text.split('\n').length : 1), []);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const syntaxRef = useRef<HTMLPreElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const [editorValue, setEditorValue] = useState(value);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  const [lineCount, setLineCount] = useState(getLineCount(value));
  const [isFormatting, setIsFormatting] = useState(false);
  const [lineHeights, setLineHeights] = useState<number[]>([19]);
  const [baseLineHeight, setBaseLineHeight] = useState(19);

  useEffect(() => {
    setEditorValue(value);
    setLineCount(getLineCount(value));
  }, [getLineCount, value]);

  const updateCursorFromSelection = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const caret = textarea.selectionStart || 0;
    const before = textarea.value.slice(0, caret);
    const lines = before.split('\n');
    setCursorLine(lines.length);
    setCursorCol((lines[lines.length - 1] || '').length + 1);
  }, []);

  const updateValue = useCallback((nextValue: string) => {
    setEditorValue(nextValue);
    setLineCount(getLineCount(nextValue));
    onChange(nextValue);
  }, [getLineCount, onChange]);

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const syntax = syntaxRef.current;
    const gutter = gutterRef.current;
    if (!textarea || !syntax || !gutter) return;
    syntax.scrollTop = textarea.scrollTop;
    syntax.scrollLeft = textarea.scrollLeft;
    gutter.scrollTop = textarea.scrollTop;
  }, []);

  const measureWrappedLineHeights = useCallback(() => {
    const textarea = textareaRef.current;
    const ruler = rulerRef.current;
    if (!textarea || !ruler) return;

    const style = window.getComputedStyle(textarea);
    const resolvedLineHeight = Number.parseFloat(style.lineHeight) || 19;
    setBaseLineHeight(resolvedLineHeight);

    ruler.style.width = `${textarea.clientWidth}px`;
    ruler.innerHTML = '';

    const lines = (textarea.value || '').split('\n');
    if (lines.length === 0) {
      setLineHeights([resolvedLineHeight]);
      return;
    }

    const nextHeights: number[] = [];
    for (const line of lines) {
      const row = document.createElement('div');
      row.textContent = line.length ? line : ' ';
      ruler.appendChild(row);
      const measured = row.offsetHeight || resolvedLineHeight;
      nextHeights.push(Math.max(resolvedLineHeight, measured));
    }

    setLineHeights(nextHeights);
  }, []);

  const setValueAndRestoreCaret = useCallback((nextValue: string, caretPosition?: number) => {
    updateValue(nextValue);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const nextCaret = caretPosition ?? nextValue.length;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
      updateCursorFromSelection();
    });
  }, [updateCursorFromSelection, updateValue]);

  const formatCode = useCallback(() => {
    if (readOnly) return;
    if (!editorValue.trim()) return;

    setIsFormatting(true);
    try {
      if (language === 'json') {
        const formatted = formatJSON(editorValue);
        updateValue(formatted);
        onJsonFormatModeChange?.('formatted');
      } else if (language === 'xml') {
        const formatted = prettyPrintXml(editorValue);
        updateValue(formatted);
      }
    } catch {
      // Keep user content unchanged when formatting fails.
    } finally {
      setIsFormatting(false);
    }
  }, [editorValue, language, onJsonFormatModeChange, readOnly, updateValue]);

  const minifyCode = useCallback(() => {
    if (readOnly) return;
    if (!editorValue.trim()) return;

    try {
      if (language === 'json') {
        const minified = minifyJSON(editorValue);
        updateValue(minified);
        onJsonFormatModeChange?.('minified');
      } else if (language === 'xml') {
        const minified = editorValue.replace(/>\s+</g, '><').trim();
        updateValue(minified);
      }
    } catch {
      // Keep user content unchanged when minification fails.
    }
  }, [editorValue, language, onJsonFormatModeChange, readOnly, updateValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (readOnly) return;

    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatCode();
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const insert = '  ';
      const nextValue = `${editorValue.slice(0, start)}${insert}${editorValue.slice(end)}`;
      setValueAndRestoreCaret(nextValue, start + insert.length);
    }
  }, [editorValue, formatCode, readOnly, setValueAndRestoreCaret]);

  const canFormat = language === 'json' || language === 'xml';
  const langLabel = language === 'javascript' ? 'JS' : language.toUpperCase();
  const lineNumbers = useMemo(() => Array.from({ length: lineCount }, (_, i) => i + 1), [lineCount]);
  const wrapCounts = useMemo(
    () => lineNumbers.map((line) => Math.max(1, Math.round((lineHeights[line - 1] || baseLineHeight) / baseLineHeight))),
    [baseLineHeight, lineHeights, lineNumbers]
  );

  const escapeHtml = useCallback((text: string): string => (
    text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  ), []);

  const highlightJsonLine = useCallback((line: string): string => {
    return escapeHtml(line).replace(
      /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'syntax-json-number';
        if (/^"/.test(match)) cls = /:$/.test(match) ? 'syntax-json-key' : 'syntax-json-string';
        else if (/true|false/.test(match)) cls = 'syntax-json-boolean';
        else if (/null/.test(match)) cls = 'syntax-json-null';
        return `<span class="${cls}">${match}</span>`;
      }
    );
  }, [escapeHtml]);

  const highlightXmlLine = useCallback((line: string): string => {
    let xml = escapeHtml(line);
    xml = xml.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="syntax-xml-comment">$1</span>');
    xml = xml.replace(/(&lt;\/?)([\w\-.:]+)([\s\S]*?)(&gt;)/g, (_m, p1, p2, p3, p4) => {
      const attrs = p3.replace(
        /([\w\-.:]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
        '<span class="syntax-xml-attr">$1</span>$2<span class="syntax-xml-value">$3</span>'
      );
      return `<span class="syntax-xml-punctuation">${p1}</span><span class="syntax-xml-tag">${p2}</span>${attrs}<span class="syntax-xml-punctuation">${p4}</span>`;
    });
    return xml;
  }, [escapeHtml]);

  const highlightJsLine = useCallback((line: string): string => {
    const tokenRegex = /(\/\/.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b(?:const|let|var|if|else|for|while|do|switch|case|break|continue|return|function|async|await|class|extends|new|try|catch|finally|throw|import|export|from|default|typeof|instanceof|in|of|this|super)\b|\b(?:true|false|null|undefined|NaN|Infinity)\b|\b\d+(?:\.\d+)?\b)/g;
    let result = '';
    let last = 0;
    let match: RegExpExecArray | null = tokenRegex.exec(line);

    while (match) {
      const token = match[0];
      const index = match.index;
      result += escapeHtml(line.slice(last, index));

      let cls = 'syntax-js-builtin';
      if (/^\/\//.test(token)) cls = 'syntax-js-comment';
      else if (/^["'`]/.test(token)) cls = 'syntax-js-string';
      else if (/^\d/.test(token)) cls = 'syntax-js-number';
      else if (/^(true|false|null|undefined|NaN|Infinity)$/.test(token)) cls = 'syntax-js-builtin';
      else cls = 'syntax-js-keyword';

      result += `<span class="${cls}">${escapeHtml(token)}</span>`;
      last = index + token.length;
      match = tokenRegex.exec(line);
    }

    result += escapeHtml(line.slice(last));
    return result;
  }, [escapeHtml]);

  const syntaxHtml = useMemo(() => {
    const lines = editorValue.split('\n');
    const highlighted = lines.map((line) => {
      if (language === 'json') return highlightJsonLine(line);
      if (language === 'xml') return highlightXmlLine(line);
      if (language === 'javascript') return highlightJsLine(line);
      return escapeHtml(line);
    });
    return highlighted.join('\n');
  }, [editorValue, escapeHtml, highlightJsLine, highlightJsonLine, highlightXmlLine, language]);

  const statusHint = useMemo(() => {
    if (language === 'json' || language === 'xml') return 'Shift+Alt+F to format';
    if (language === 'javascript') return 'Tab = indent';
    return '';
  }, [language]);

  useEffect(() => {
    if (language !== 'json') return;
    if (jsonFormatMode !== 'formatted' && jsonFormatMode !== 'minified') return;
  }, [jsonFormatMode, language]);

  useEffect(() => {
    syncScroll();
  }, [editorValue, syncScroll]);

  useEffect(() => {
    measureWrappedLineHeights();

    const textarea = textareaRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(() => {
      measureWrappedLineHeights();
    });

    observer.observe(textarea);
    window.addEventListener('resize', measureWrappedLineHeights);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measureWrappedLineHeights);
    };
  }, [editorValue, measureWrappedLineHeights, minHeight]);

  return (
    <div className="code-editor-wrapper">
      <div className="code-editor-toolbar">
        <div className="toolbar-buttons">
          {canFormat && (
            <>
              <button
                className="editor-btn"
                onClick={formatCode}
                disabled={readOnly || isFormatting || !editorValue.trim()}
                title="Format (Shift+Alt+F)"
              >
                Format
              </button>
              <button
                className="editor-btn"
                onClick={minifyCode}
                disabled={readOnly || !editorValue.trim()}
                title="Minify"
              >
                Minify
              </button>
            </>
          )}
          <span className="language-badge">{langLabel}</span>
        </div>
      </div>

      <div className="code-editor-body" style={{ minHeight }}>
        <div ref={gutterRef} className="code-editor-gutter" aria-hidden="true">
          {lineNumbers.map((line, index) => (
            <div
              key={line}
              className={`gutter-line ${line === cursorLine ? 'active-gutter-line' : ''}`}
              style={{ height: `${lineHeights[line - 1] || baseLineHeight}px` }}
            >
              <span className="gutter-number">{line}</span>
              {Array.from({ length: Math.max(0, (wrapCounts[index] || 1) - 1) }).map((_, markerIndex) => (
                <span key={markerIndex} className="gutter-continuation">·</span>
              ))}
            </div>
          ))}
        </div>

        <div ref={shellRef} className="code-editor-shell">
          {!editorValue && <div className="code-editor-placeholder">{placeholder}</div>}
          <pre
            ref={syntaxRef}
            className={`code-editor-syntax ${readOnly ? 'readonly' : ''}`}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: syntaxHtml || ' ' }}
          />
          <textarea
            ref={textareaRef}
            className={`code-editor-overlay ${readOnly ? 'hidden-editor' : ''}`}
            value={editorValue}
            placeholder={placeholder}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            onChange={(e) => updateValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={updateCursorFromSelection}
            onKeyUp={updateCursorFromSelection}
            onSelect={updateCursorFromSelection}
            onScroll={syncScroll}
          />
          <div ref={rulerRef} className="code-editor-ruler" aria-hidden="true" />
        </div>
      </div>

      {!readOnly && (
        <div className="code-editor-statusbar">
          <span>Ln {cursorLine}, Col {cursorCol}</span>
          <span>{lineCount} lines</span>
          {statusHint && <span className="statusbar-hint">{statusHint}</span>}
        </div>
      )}
    </div>
  );
};
