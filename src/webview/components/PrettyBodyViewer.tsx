import React, { useMemo } from 'react';

type PrettyLanguage = 'json' | 'xml';
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

function highlightInHtml(html: string, term: string): string {
  if (!term) return html;
  try {
    const escaped = escapeRegex(term);
    return html.replace(
      new RegExp(`(${escaped})(?![^<]*>)`, 'gi'),
      '<mark style="background:color-mix(in srgb,var(--accent,#89b4fa) 50%,transparent);color:var(--fg);border-radius:2px;outline:1px solid color-mix(in srgb,var(--accent,#89b4fa) 60%,transparent)">$1</mark>'
    );
  } catch {
    return html;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatJSON(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export function minifyJSON(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json));
  } catch {
    return json;
  }
}

export function prettyPrintXml(xml: string): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) return xml;

    const esc = escapeHtml;
    const indentUnit = '  ';
    const serialize = (node: Node, indentLevel = 0): string => {
      const indent = indentUnit.repeat(indentLevel);
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.nodeValue || '';
        return text.trim() ? indent + esc(text.trim()) + '\n' : '';
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
          attrs.push(`${a.name}="${esc(a.value)}"`);
        }
        const open = attrs.length ? `<${el.tagName} ${attrs.join(' ')}>` : `<${el.tagName}>`;
        if (el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE) {
          const txt = (el.firstChild.nodeValue || '').trim();
          return indent + `${open.replace(/>$/, '')}>${esc(txt)}</${el.tagName}>` + '\n';
        }
        if (el.childNodes.length === 0) return indent + open.replace(/>$/, '/>') + '\n';

        let out = indent + open + '\n';
        el.childNodes.forEach((n) => { out += serialize(n, indentLevel + 1); });
        out += indent + `</${el.tagName}>` + '\n';
        return out;
      }
      return '';
    };

    return serialize(doc).trim() || xml;
  } catch {
    return xml;
  }
}

function syntaxHighlightJSON(line: string): string {
  return escapeHtml(line).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) cls = /:$/.test(match) ? 'json-key' : 'json-string';
      else if (/true|false/.test(match)) cls = 'json-boolean';
      else if (/null/.test(match)) cls = 'json-null';
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function syntaxHighlightXml(line: string): string {
  return line
    .replace(/&/g, '&amp;').replace(/</g, '__LT__').replace(/>/g, '__GT__')
    .replace(
      /(__LT__\/?)([ A-Za-z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)(\s*\/?(__GT__))/g,
      (_, open, tag, attrs, close) => {
        const coloredAttrs = attrs.replace(
          /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
          '<span class="xml-attr-name">$1</span>$2<span class="xml-attr-value">$3</span>'
        );
        return `<span class="xml-bracket">&lt;${open.includes('__LT__/') ? '/' : ''}</span><span class="xml-tag">${tag}</span>${coloredAttrs}<span class="xml-bracket">${close.replace('__GT__', '&gt;')}</span>`;
      }
    )
    .replace(/__LT__\?([\w]+)/g, '<span class="xml-bracket">&lt;?</span><span class="xml-tag">$1</span>')
    .replace(/__GT__/g, '&gt;').replace(/__LT__/g, '&lt;');
}

export const PrettyBodyViewer: React.FC<PrettyBodyViewerProps> = ({
  text,
  language,
  search = '',
  jsonMode = 'formatted',
  placeholder,
  className = '',
  onActivate,
}) => {
  const displayText = useMemo(() => {
    if (!text) return '';
    if (language === 'json') return jsonMode === 'minified' ? minifyJSON(text) : formatJSON(text);
    return prettyPrintXml(text);
  }, [text, language, jsonMode]);

  const lines = useMemo(() => (displayText || '').split('\n'), [displayText]);
  const highlighter = language === 'json' ? syntaxHighlightJSON : syntaxHighlightXml;

  if (!text && placeholder) {
    return (
      <div className={`pretty-body-viewer ${className}`} onMouseDown={onActivate}>
        <div className="code-editor-placeholder static">{placeholder}</div>
      </div>
    );
  }

  return (
    <div className={`pretty-body-viewer ${className}`} onMouseDown={onActivate}>
      <div className="pretty-body-table">
        {lines.map((line, idx) => (
          <div key={idx} className="pretty-body-row">
            <div className="pretty-body-gutter">{idx + 1}</div>
            <div
              className="pretty-body-code"
              dangerouslySetInnerHTML={{ __html: highlightInHtml(highlighter(line), search) }}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

