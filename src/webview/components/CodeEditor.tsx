import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
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
  dataTestId?: string;
}

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  background: ${({ theme }) => theme.inputBg};
  height: 100%;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

const ToolbarButtons = styled.div`
  display: flex;
  gap: 8px;
  align-items: center;
`;

const EditorBtn = styled.button`
  background: ${({ theme }) => theme.surface2};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.2s;
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.hover};
    border-color: ${({ theme }) => theme.accent};
    color: ${({ theme }) => theme.accent};
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const LanguageBadge = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  padding: 2px 6px;
  background: color-mix(in srgb, ${({ theme }) => theme.accent} 10%, transparent);
  border-radius: 3px;
  font-weight: 600;
  margin-left: 8px;
`;

const EditorBody = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.inputBg};
`;

const Gutter = styled.div`
  width: 44px;
  min-width: 44px;
  overflow: hidden;
  background: ${({ theme }) => theme.lineNumberBg};
  border-right: 1px solid ${({ theme }) => theme.border};
  padding: 10px 5px 10px 10px;
  text-align: right;
  user-select: none;
  flex-shrink: 0;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.6;
  color: ${({ theme }) => theme.lineNumberFg};
`;

const GutterLine = styled.div<{ $active: boolean }>`
  padding: 0 8px 0 0;
  transition: color 0.1s;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: flex-start;
  color: ${({ $active, theme }) => ($active ? theme.lineNumberActiveFg : 'inherit')};
  font-weight: ${({ $active }) => ($active ? 600 : 'normal')};
`;

const GutterNumber = styled.span`
  display: block;
`;

const GutterContinuation = styled.span`
  display: block;
  opacity: 0.45;
`;

const EditorShell = styled.div`
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: ${({ theme }) => theme.inputBg};
`;

const SyntaxPre = styled.pre<{ $readonly: boolean }>`
  color: ${({ theme }) => theme.inputFg};
  pointer-events: ${({ $readonly }) => ($readonly ? 'auto' : 'none')};
  overflow: hidden;
  margin: 0;
  padding: 10px 14px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.6;
  tab-size: 2;
  background: ${({ theme }) => theme.inputBg};
  position: absolute;
  inset: 0;
`;

const OverlayTextarea = styled.textarea<{ $hidden: boolean }>`
  color: transparent;
  overflow: auto;
  margin: 0;
  padding: 10px 14px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.6;
  tab-size: 2;
  background: transparent;
  position: absolute;
  inset: 0;
  outline: none;
  border: none;
  resize: none;
  caret-color: ${({ theme }) => theme.inputFg};

  &::selection {
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 35%, transparent);
  }

  ${({ $hidden }) =>
    $hidden &&
    `
    pointer-events: none;
  `}
`;

const Ruler = styled.div`
  position: fixed;
  top: -9999px;
  left: -9999px;
  visibility: hidden;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.6;
  padding: 10px 14px;
  tab-size: 2;
  overflow: hidden;
  margin: 0;
  border: none;
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 3px 10px;
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 80%, ${({ theme }) => theme.inputBg});
  border-top: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
  font-family: ${({ theme }) => theme.monoFamily};
`;

const StatusHint = styled.span`
  margin-left: auto;
  opacity: 0.6;
  font-style: italic;
`;

const Placeholder = styled.div<{ $static: boolean }>`
  position: ${({ $static }) => ($static ? 'static' : 'absolute')};
  ${({ $static }) => ($static ? 'padding: 10px 14px;' : 'top: 10px; left: 14px; right: 14px;')}
  color: ${({ theme }) => theme.muted};
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.6;
  pointer-events: none;
`;

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
  dataTestId,
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
    <Wrapper data-testid={dataTestId}>
      <Toolbar>
        <ToolbarButtons>
          {canFormat && (
            <>
              <EditorBtn
                onClick={formatCode}
                disabled={readOnly || isFormatting || !editorValue.trim()}
                title="Format (Shift+Alt+F)"
              >
                Format
              </EditorBtn>
              <EditorBtn
                onClick={minifyCode}
                disabled={readOnly || !editorValue.trim()}
                title="Minify"
              >
                Minify
              </EditorBtn>
            </>
          )}
          <LanguageBadge>{langLabel}</LanguageBadge>
        </ToolbarButtons>
      </Toolbar>

      <EditorBody style={{ minHeight }}>
        <Gutter ref={gutterRef} aria-hidden="true">
          {lineNumbers.map((line, index) => (
            <GutterLine
              key={line}
              $active={line === cursorLine}
              style={{ height: `${lineHeights[line - 1] || baseLineHeight}px` }}
            >
              <GutterNumber>{line}</GutterNumber>
              {Array.from({ length: Math.max(0, (wrapCounts[index] || 1) - 1) }).map((_, markerIndex) => (
                <GutterContinuation key={markerIndex}>·</GutterContinuation>
              ))}
            </GutterLine>
          ))}
        </Gutter>

        <EditorShell ref={shellRef}>
          {!editorValue && <Placeholder $static={false}>{placeholder}</Placeholder>}
          <SyntaxPre
            ref={syntaxRef}
            $readonly={readOnly}
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: syntaxHtml || ' ' }}
          />
          <OverlayTextarea
            ref={textareaRef}
            $hidden={readOnly}
            value={editorValue}
            placeholder={placeholder}
            readOnly={readOnly}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            data-testid={dataTestId ? `${dataTestId}-textarea` : undefined}
            onChange={(e) => updateValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={updateCursorFromSelection}
            onKeyUp={updateCursorFromSelection}
            onSelect={updateCursorFromSelection}
            onScroll={syncScroll}
          />
          <Ruler ref={rulerRef} aria-hidden="true" />
        </EditorShell>
      </EditorBody>

      {!readOnly && (
        <StatusBar>
          <span>Ln {cursorLine}, Col {cursorCol}</span>
          <span>{lineCount} lines</span>
          {statusHint && <StatusHint>{statusHint}</StatusHint>}
        </StatusBar>
      )}
    </Wrapper>
  );
};
