import React, { useEffect, useMemo, useRef } from 'react';
import { EditorState, Extension, RangeSetBuilder } from '@codemirror/state';
import { foldGutter, foldKeymap, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { html } from '@codemirror/lang-html';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  drawSelection,
  highlightActiveLine,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import ReactDOM from 'react-dom/client';
import { Icon } from './FaIcon';
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import { defaultKeymap } from '@codemirror/commands';
import { tags } from '@lezer/highlight';

type PrettyLanguage = 'json' | 'xml' | 'html' | 'text';
type JsonDisplayMode = 'formatted' | 'minified';

interface PrettyBodyViewerProps {
  text: string;
  language: PrettyLanguage;
  search?: string;
  jsonMode?: JsonDisplayMode;
  placeholder?: string;
  className?: string;
  onActivate?: () => void;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function formatJSON(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2);
  } catch {
    return jsonString;
  }
}

export function minifyJSON(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString));
  } catch {
    return jsonString;
  }
}

export function prettyPrintXml(xmlString: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return xmlString;

    const indentUnit = '  ';
    const serialize = (node: Node, indentLevel = 0): string => {
      const indent = indentUnit.repeat(indentLevel);
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        return text.trim() ? indent + text.trim() + '\n' : '';
      }
      if (node.nodeType === Node.CDATA_SECTION_NODE) {
        return indent + `<![CDATA[${(node as CDATASection).data}]]>` + '\n';
      }
      if (node.nodeType === Node.COMMENT_NODE) {
        return indent + `<!--${(node as Comment).data}-->` + '\n';
      }
      if (node.nodeType === Node.DOCUMENT_NODE) {
        let out = '';
        node.childNodes.forEach((n) => { out += serialize(n, indentLevel); });
        return out;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const attrs: string[] = [];
        for (let i = 0; i < el.attributes.length; i += 1) {
          const a = el.attributes.item(i)!;
          attrs.push(`${a.name}="${a.value}"`);
        }
        const open = attrs.length ? `<${el.tagName} ${attrs.join(' ')}>` : `<${el.tagName}>`;
        if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
          const txt = (el.firstChild.nodeValue || '').trim();
          return indent + `${open.replace(/>$/, '')}>${txt}</${el.tagName}>` + '\n';
        }
        if (el.childNodes.length === 0) return indent + open.replace(/>$/, '/>') + '\n';

        let out = indent + open + '\n';
        el.childNodes.forEach((n) => { out += serialize(n, indentLevel + 1); });
        out += indent + `</${el.tagName}>` + '\n';
        return out;
      }
      return '';
    };

    return serialize(doc).trim() || xmlString;
  } catch {
    return xmlString;
  }
}

export function prettyPrintHtml(htmlString: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    const indentUnit = '  ';
    const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

    const serialize = (node: Node, indentLevel = 0): string => {
      const indent = indentUnit.repeat(indentLevel);
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        return text.trim() ? indent + text.trim() + '\n' : '';
      }
      if (node.nodeType === Node.COMMENT_NODE) {
        return indent + `<!--${(node as Comment).data}-->` + '\n';
      }
      if (node.nodeType === Node.DOCUMENT_TYPE_NODE) {
        const dt = node as DocumentType;
        return `<!DOCTYPE ${dt.name}>` + '\n';
      }
      if (node.nodeType === Node.DOCUMENT_NODE) {
        let out = '';
        node.childNodes.forEach((n) => { out += serialize(n, indentLevel); });
        return out;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        const attrs: string[] = [];
        for (let i = 0; i < el.attributes.length; i += 1) {
          const a = el.attributes.item(i)!;
          attrs.push(`${a.name}="${a.value}"`);
        }
        const open = attrs.length ? `<${tag} ${attrs.join(' ')}>` : `<${tag}>`;
        if (voidElements.has(tag)) return indent + open.replace(/>$/, '/>') + '\n';
        if (el.childNodes.length === 0) return indent + open.replace(/>$/, `></${tag}>`) + '\n';
        if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
          const txt = (el.firstChild.nodeValue || '').trim();
          return indent + `${open.replace(/>$/, '')}>${txt}</${tag}>` + '\n';
        }

        let out = indent + open + '\n';
        el.childNodes.forEach((n) => { out += serialize(n, indentLevel + 1); });
        out += indent + `</${tag}>` + '\n';
        return out;
      }
      return '';
    };

    return serialize(doc).trim() || htmlString;
  } catch {
    return htmlString;
  }
}

function languageExtension(language: PrettyLanguage): Extension {
  if (language === 'json') return json();
  if (language === 'xml') return xml();
  if (language === 'html') return html();
  return [];
}

function searchHighlightExtension(search: string): Extension {
  const term = search.trim();
  if (!term) return [];

  const matcher = new RegExp(escapeRegex(term), 'gi');
  const mark = Decoration.mark({ class: 'cm-response-search-match' });

  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = this.buildDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view: EditorView) {
      const builder = new RangeSetBuilder<Decoration>();
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        matcher.lastIndex = 0;
        let match: RegExpExecArray | null = matcher.exec(text);
        while (match) {
          builder.add(from + match.index, from + match.index + match[0].length, mark);
          match = matcher.exec(text);
        }
      }
      return builder.finish();
    }
  }, {
    decorations: (plugin) => plugin.decorations,
  });
}

const responseHighlightStyle = HighlightStyle.define([
  { tag: tags.propertyName, class: 'cm-response-json-key' },
  { tag: tags.string, class: 'cm-response-json-string' },
  { tag: tags.number, class: 'cm-response-json-number' },
  { tag: tags.bool, class: 'cm-response-json-boolean' },
  { tag: tags.null, class: 'cm-response-json-null' },
  { tag: tags.tagName, class: 'cm-response-xml-tag' },
  { tag: tags.attributeName, class: 'cm-response-xml-attr-name' },
  { tag: tags.attributeValue, class: 'cm-response-xml-attr-value' },
  { tag: tags.comment, class: 'cm-response-xml-comment' },
]);

export const PrettyBodyViewer: React.FC<PrettyBodyViewerProps> = ({
  text,
  language,
  search = '',
  jsonMode = 'formatted',
  placeholder,
  className = '',
  onActivate,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  const displayText = useMemo(() => {
    if (!text) return '';
    if (language === 'json') return jsonMode === 'minified' ? minifyJSON(text) : formatJSON(text);
    if (language === 'xml') return prettyPrintXml(text);
    if (language === 'html') return prettyPrintHtml(text);
    return text;
  }, [jsonMode, language, text]);

  const extensions = useMemo(() => [
    lineNumbers(),
    foldGutter({
      markerDOM(open) {
        const marker = document.createElement('span');
        marker.className = 'cm-response-fold-marker';
        try {
          const root = ReactDOM.createRoot(marker);
          root.render(<Icon icon={open ? faChevronDown : faChevronRight} size={13} />);
        } catch {
          // Fallback to plain text if rendering fails
          marker.textContent = open ? '⌄' : '›';
        }
        return marker;
      },
    }),
    highlightSpecialChars(),
    drawSelection(),
    highlightActiveLine(),
    syntaxHighlighting(responseHighlightStyle),
    languageExtension(language),
    searchHighlightExtension(search),
    keymap.of([...foldKeymap, ...defaultKeymap]),
    EditorState.readOnly.of(true),
    EditorView.editable.of(false),
    EditorView.lineWrapping,
    EditorView.theme({
      '&': {
        backgroundColor: 'var(--input-bg)',
        color: 'var(--input-fg)',
        fontSize: '12px',
        height: '100%',
      },
      '.cm-scroller': {
        fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
        lineHeight: '1.6',
      },
      '.cm-content': {
        padding: '8px 0',
      },
      '.cm-line': {
        padding: '0 12px',
      },
      '.cm-gutters': {
        backgroundColor: 'var(--line-number-bg)',
        color: 'var(--line-number-fg)',
        borderRight: '1px solid var(--border)',
      },
      '.cm-foldGutter': {
        minWidth: '18px',
      },
      '.cm-foldGutter .cm-gutterElement': {
        alignItems: 'center',
        cursor: 'pointer',
        display: 'flex',
        justifyContent: 'center',
        padding: '0 4px',
      },
      '.cm-response-fold-marker': {
        color: 'var(--line-number-fg)',
        fontSize: '13px',
        lineHeight: '1',
        opacity: '0.8',
      },
      '.cm-foldPlaceholder': {
        backgroundColor: 'var(--button-bg)',
        border: '1px solid var(--border)',
        borderRadius: '3px',
        color: 'var(--button-fg)',
        cursor: 'pointer',
        margin: '0 2px',
        padding: '0 4px',
      },
      '.cm-activeLine': {
        backgroundColor: 'transparent',
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'transparent',
      },
    }),
  ], [language, search]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    viewRef.current?.destroy();
    viewRef.current = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: displayText,
        extensions,
      }),
    });

    return () => {
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [displayText, extensions]);

  if (!text && placeholder) {
    return (
      <div className={`pretty-body-viewer ${className}`} onMouseDown={onActivate}>
        <div className="code-editor-placeholder static">{placeholder}</div>
      </div>
    );
  }

  return (
    <div
      ref={hostRef}
      className={`pretty-body-viewer cm-response-viewer ${className}`}
      onMouseDown={onActivate}
    />
  );
};
