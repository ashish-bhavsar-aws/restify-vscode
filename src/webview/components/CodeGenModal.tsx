import React, { useEffect, useState } from 'react';
import { Environment, RequestState } from '../types';
import { generateCode, SUPPORTED_LANGS } from '../utils/codegen';
import { PrettyBodyViewer } from './PrettyBodyViewer';

interface CodeGenModalProps {
  open: boolean;
  request: RequestState;
  environment?: Environment | null;
  onClose: () => void;
}

export const CodeGenModal: React.FC<CodeGenModalProps> = ({ open, request, environment, onClose }) => {
  const [lang, setLang] = useState<string>(SUPPORTED_LANGS[0].id);
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const out = generateCode(lang, request, environment);
    setCode(out);
  }, [open, lang, request, environment]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      alert('Code copied to clipboard');
    } catch {
      alert('Failed to copy');
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal large codegen-modal" onClick={(e) => e.stopPropagation()}>
        <div className="codegen-header">
          <h3>Generate Code</h3>
          <div className="modal-actions">
            <button className="btn-ghost" onClick={onClose}>Close</button>
            <button className="btn" onClick={handleCopy}>Copy</button>
          </div>
        </div>

        <div className="codegen-container">
          <div className="codegen-left">
            {SUPPORTED_LANGS.map((s) => (
              <button
                key={s.id}
                className={`codegen-lang ${lang === s.id ? 'selected' : ''}`}
                onClick={() => setLang(s.id)}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="codegen-right">
            <div className="code-meta">{SUPPORTED_LANGS.find((x) => x.id === lang)?.label}</div>
            <div className="code-block" tabIndex={0} role="region" aria-label="Generated code">
              <PrettyBodyViewer text={code} language="text" className="codegen-pretty-viewer" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeGenModal;
