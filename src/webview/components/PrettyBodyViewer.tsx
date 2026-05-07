import React, { useMemo, useRef, useState, useEffect } from 'react';

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
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
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
  if (typeof line !== 'string') line = String(line);
  
  // Escape HTML entities first
  let xml = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Comments
  xml = xml.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="xml-comment">$1</span>');
  
  // Tags, attributes, values (xml.html approach)
  xml = xml.replace(/(&lt;\/?)([\w\-.:]+)([\s\S]*?)(&gt;)/g, (_, p1, p2, p3, p4) => {
    // Highlight attributes and values in the attributes section
    const attrs = p3.replace(/([\w\-.:]+)(\s*=\s*)("[^"]*"|'[^']*')/g,
      '<span class="xml-attr-name">$1</span>$2<span class="xml-attr-value">$3</span>');
    return `<span class="xml-bracket">${p1}</span><span class="xml-tag">${p2}</span>${attrs}<span class="xml-bracket">${p4}</span>`;
  });
  
  return xml;
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
  const rulerRef = useRef<HTMLDivElement | null>(null);
  const [visualLines, setVisualLines] = useState<number[]>([]);

  const displayText = useMemo(() => {
    if (!text) return '';
    if (language === 'json') return jsonMode === 'minified' ? minifyJSON(text) : formatJSON(text);
    return prettyPrintXml(text);
  }, [text, language, jsonMode]);

  const lines = useMemo(() => (displayText || '').split('\n'), [displayText]);
  const highlighter = language === 'json' ? syntaxHighlightJSON : syntaxHighlightXml;

  // Compute visual lines for wrapped text
  const computeVisualLines = useMemo(() => () => {
    const ruler = rulerRef.current;
    if (!ruler) return;

    // Measure actual container width (find first pretty-body-code to measure against)
    const codeCell = document.querySelector('.pretty-body-code') as HTMLElement;
    if (!codeCell) return;

    // Get the actual content width (offsetWidth is total including padding)
    const codeCellStyle = window.getComputedStyle(codeCell);
    const paddingLeft = parseFloat(codeCellStyle.paddingLeft) || 0;
    const paddingRight = parseFloat(codeCellStyle.paddingRight) || 0;
    const contentWidth = codeCell.offsetWidth - paddingLeft - paddingRight;
    if (!contentWidth) return;

    // Set ruler width to match content width (not including padding)
    ruler.style.width = contentWidth + 'px';
    ruler.innerHTML = '';
    
    const rulerStyle = window.getComputedStyle(ruler);
    const lineHeight = parseFloat(rulerStyle.lineHeight) || 16;
    const results: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || ' ';
      const span = document.createElement('span');
      span.textContent = line;
      ruler.appendChild(span);
      ruler.appendChild(document.createElement('br'));
      const spanHeight = span.offsetHeight || lineHeight;
      let visual = Math.round(spanHeight / lineHeight);
      if (visual < 1) visual = 1;
      results.push(visual);
    }
    setVisualLines(results.length ? results : [1]);
  }, [lines]);

  useEffect(() => {
    computeVisualLines();
    const ro = new ResizeObserver(() => computeVisualLines());
    if (rulerRef.current) ro.observe(rulerRef.current);
    window.addEventListener('resize', computeVisualLines);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', computeVisualLines);
    };
  }, [computeVisualLines]);

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
        {lines.map((line, idx) => {
          const vl = visualLines[idx] || 1;
          return (
            <div key={idx} className="pretty-body-row">
              <div className="pretty-body-gutter">
                {idx + 1}
                {Array.from({ length: Math.max(0, vl - 1) }).map((_, k) => (
                  <React.Fragment key={k}>
                    <br />
                    &nbsp;
                  </React.Fragment>
                ))}
              </div>
              <div
                className="pretty-body-code"
                dangerouslySetInnerHTML={{ __html: highlightInHtml(highlighter(line), search) }}
              />
            </div>
          );
        })}
      </div>
      {/* Hidden ruler to measure visual wrapping */}
      <div ref={rulerRef} className="pretty-body-ruler" aria-hidden="true" />
    </div>
  );
};

