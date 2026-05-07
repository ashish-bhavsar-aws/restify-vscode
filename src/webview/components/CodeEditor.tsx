import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { formatJSON, minifyJSON, prettyPrintXml } from './PrettyBodyViewer';

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
  const [cursorCol, setCursorCol] = useState(1);
  const [editorValue, setEditorValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);
  const [visualLines, setVisualLines] = useState<number[]>(() => [1]);

  const editorRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const rulerRef = useRef<HTMLDivElement | null>(null);
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

  // Compute visual lines (for line number wrapping alignment)
  const computeVisualLines = useCallback(() => {
    const text = editorValue || '';
    const ruler = rulerRef.current;
    const editor = editorRef.current;
    if (!ruler || !editor) return;
    
    // Match ruler dimensions to editor
    const editorWidth = editor.clientWidth;
    ruler.style.width = `${editorWidth}px`;
    
    ruler.innerHTML = '';
    const style = window.getComputedStyle(ruler);
    const lineHeight = parseFloat(style.lineHeight) || 16;
    const results: number[] = [];
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || ' ';
      const lineDiv = document.createElement('div');
      lineDiv.textContent = line;
      lineDiv.style.whiteSpace = 'pre-wrap';
      lineDiv.style.wordBreak = 'break-word';
      lineDiv.style.margin = '0';
      lineDiv.style.padding = '0';
      ruler.appendChild(lineDiv);
      
      // Measure height to determine how many visual lines this logical line takes
      const height = lineDiv.offsetHeight;
      let visual = Math.round(height / lineHeight);
      if (visual < 1) visual = 1;
      results.push(visual);
    }
    setVisualLines(results.length ? results : [1]);
  }, [editorValue]);

  useEffect(() => {
    computeVisualLines();
    const ro = new ResizeObserver(() => computeVisualLines());
    if (editorRef.current) ro.observe(editorRef.current);
    window.addEventListener('resize', computeVisualLines);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeVisualLines);
    };
  }, [computeVisualLines]);

  /* ── Syntax highlight ─────────────────────────────── */
  const highlightedHtml = useMemo(() => {
    if (!editorValue) return '<span class="syntax-placeholder"> </span>';
    if (language === 'json') return highlightJson(editorValue);
    if (language === 'xml') return highlightXml(editorValue);
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

  // Get plain text from contenteditable div
  const getPlainText = useCallback((): string => {
    if (!editorRef.current) return '';
    const html = editorRef.current.innerHTML
      .replace(/<div><br><\/div>/g, '\n')
      .replace(/<div>/g, '\n')
      .replace(/<\/div>/g, '')
      .replace(/<br>/g, '\n');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }, []);

  // Save caret position and restore after updating innerHTML
  const saveCaret = (): number | null => {
    if (!editorRef.current || !window.getSelection) return null;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editorRef.current);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    return preCaretRange.toString().length;
  };

  const restoreCaret = (caretOffset: number) => {
    if (!editorRef.current || caretOffset == null) return;
    const selection = window.getSelection();
    if (!selection) return;
    let charCount = 0;
    let found = false;

    const traverse = (node: Node) => {
      if (found) return;
      if (node.nodeType === 3) {
        const textNode = node as Text;
        const nextCharCount = charCount + textNode.length;
        if (caretOffset <= nextCharCount) {
          const range = document.createRange();
          range.setStart(textNode, caretOffset - charCount);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
          found = true;
        }
        charCount = nextCharCount;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
          if (found) break;
        }
      }
    };
    traverse(editorRef.current);
  };

  // Update highlight (visual sync without moving caret)
  const updateHighlight = useCallback(() => {
    if (!editorRef.current) return;
    const caretOffset = saveCaret();
    editorRef.current.innerHTML = highlightedHtml;
    restoreCaret(caretOffset || 0);
  }, [highlightedHtml]);

  useEffect(() => {
    updateHighlight();
  }, [updateHighlight]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (readOnly) return;

      // Tab → 2 spaces
      if (e.key === 'Tab') {
        e.preventDefault();
        document.execCommand('insertText', false, '  ');
        const newText = getPlainText();
        setEditorValue(newText);
        onChange(newText);
        return;
      }

      // Format shortcut: Shift+Alt+F
      if (e.key === 'F' && e.shiftKey && e.altKey) {
        e.preventDefault();
        formatCode();
      }
    },
    [readOnly, getPlainText, onChange, formatCode]
  );

  const handlePaste = useCallback(() => {
    setTimeout(() => {
      const plainText = getPlainText();
      setEditorValue(plainText);
      onChange(plainText);
    }, 0);
  }, [getPlainText, onChange]);

  const handleBlur = useCallback(() => {
    const plainText = getPlainText();
    applyJsonFormat(plainText);
    setIsEditing(false);
  }, [getPlainText, applyJsonFormat]);

  const handleFocus = useCallback(() => {
    setIsEditing(true);
  }, []);

  const handleScroll = useCallback(() => {
    if (editorRef.current && gutterRef.current) {
      gutterRef.current.scrollTop = editorRef.current.scrollTop;
    }
  }, []);

  // Update cursor position and content on input
  const handleInput = useCallback(() => {
    if (readOnly) return;
    const plainText = getPlainText();
    setEditorValue(plainText);
    onChange(plainText);

    // Update cursor position
    const selection = window.getSelection();
    if (selection && editorRef.current && selection.anchorNode) {
      const range = selection.getRangeAt(0);
      const preCaretRange = range.cloneRange();
      preCaretRange.selectNodeContents(editorRef.current);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
      const offset = preCaretRange.toString().length;
      const lines = plainText.slice(0, offset).split('\n');
      setCursorLine(lines.length);
      setCursorCol(lines[lines.length - 1].length + 1);
    }
  }, [getPlainText, onChange, readOnly]);

  const canFormat = language === 'json' || language === 'xml';
  const langLabel = language === 'javascript' ? 'JS' : language.toUpperCase();
  const lineCount = (editorValue || '').split('\n').length;

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
        {/* Line number gutter (xml.html pattern) */}
        <div className="code-editor-gutter" ref={gutterRef} aria-hidden="true">
          {visualLines.map((vl, idx) => {
            const isCurrentLine = idx + 1 === cursorLine && !readOnly;
            const items: React.ReactNode[] = [];
            
            // Add line number
            items.push(
              <span key={`num-${idx}`} className={isCurrentLine ? 'active-gutter-line' : ''}>
                {idx + 1}
              </span>
            );
            
            // Add wrapped line spacing (&nbsp; on each visual line after the first)
            for (let j = 1; j < vl; j++) {
              items.push(
                <React.Fragment key={`wrap-${idx}-${j}`}>
                  <br />
                  <span>&nbsp;</span>
                </React.Fragment>
              );
            }
            
            // Add line break between logical lines (except after last line)
            if (idx < visualLines.length - 1) {
              items.push(<br key={`sep-${idx}`} />);
            }
            
            return <>{items}</>;
          })}
        </div>

        {/* Shell (contenteditable div) */}
        <div className="code-editor-shell">
          {!editorValue && !isEditing && <div className="code-editor-placeholder">{placeholder}</div>}
          <div
            ref={editorRef}
            contentEditable={!readOnly}
            suppressContentEditableWarning
            className={`code-editor-content code-editor-${language} ${readOnly ? 'readonly' : ''}`}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onBlur={handleBlur}
            onFocus={handleFocus}
            onScroll={handleScroll}
            spellCheck="false"
            role="textbox"
            aria-label={`${language} editor`}
          />
        </div>
      </div>

      {/* ── Status bar ── */}
      {!readOnly && (
        <div className="code-editor-statusbar">
          <span>Ln {cursorLine}, Col {cursorCol}</span>
          <span>{lineCount} lines</span>
          {(language === 'json' || language === 'xml') && <span className="statusbar-hint">Shift+Alt+F to format</span>}
          {language === 'javascript' && <span className="statusbar-hint">Tab = indent</span>}
        </div>
      )}

      {/* Hidden ruler to measure visual wrapping */}
      <div ref={rulerRef} className="code-editor-ruler" aria-hidden="true" />
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
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) cls = /:\s*$/.test(match) ? 'json-key' : 'json-string';
      else if (/true|false/.test(match)) cls = 'json-boolean';
      else if (/null/.test(match)) cls = 'json-null';
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function highlightXml(text: string): string {
  if (typeof text !== 'string') text = String(text);
  
  // Escape HTML entities first
  let xml = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Comments
  xml = xml.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="syntax-xml-comment">$1</span>');
  
  // Tags, attributes, values (xml.html approach)
  xml = xml.replace(/(&lt;\/?)([\w\-.:]+)([\s\S]*?)(&gt;)/g, (_, p1, p2, p3, p4) => {
    // Highlight attributes and values in the attributes section
    const attrs = p3.replace(/([\w\-.:]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
      '<span class="syntax-xml-attr">$1</span>$2<span class="syntax-xml-value">$3</span>');
    return `<span class="syntax-xml-punctuation">${p1}</span><span class="syntax-xml-tag">${p2}</span>${attrs}<span class="syntax-xml-punctuation">${p4}</span>`;
  });
  
  return xml;
}

function highlightJavascript(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];

  for (const raw of lines) {
    const line = escapeHtml(raw);
    const commentIdx = findCommentStart(raw);

    let codePart = commentIdx === -1 ? line : escapeHtml(raw.slice(0, commentIdx));
    const commentPart =
      commentIdx === -1 ? '' : `<span class="syntax-js-comment">${escapeHtml(raw.slice(commentIdx))}</span>`;

    codePart = codePart.replace(
      /(&quot;(?:[^&\\]|\\[\s\S])*?&quot;|&#39;(?:[^&\\]|\\[\s\S])*?&#39;|`[^`]*`)/g,
      '<span class="syntax-js-string">$1</span>'
    );

    codePart = codePart.replace(
      /\b(const|let|var|function|return|if|else|else\s+if|for|while|do|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|void|delete|in|of|switch|case|default|class|extends|super|import|export|from|async|await|null|undefined|true|false|NaN|Infinity)\b/g,
      '<span class="syntax-js-keyword">$1</span>'
    );

    codePart = codePart.replace(
      /(?<![a-zA-Z_$])(\d+\.?\d*(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+)\b/g,
      '<span class="syntax-js-number">$1</span>'
    );

    codePart = codePart.replace(
      /\b(console|Math|JSON|Object|Array|String|Number|Boolean|Promise|setTimeout|clearTimeout|setInterval|clearInterval|response|vars|set|log|headers|status|statusText)\b/g,
      '<span class="syntax-js-builtin">$1</span>'
    );

    result.push(codePart + commentPart);
  }

  return result.join('\n');
}

function findCommentStart(raw: string): number {
  let inStr: string | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inStr) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inStr) inStr = null;
    } else {
      if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
        continue;
      }
      if (ch === '/' && raw[i + 1] === '/') return i;
    }
  }
  return -1;
}
