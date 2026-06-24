import React, { useState, useEffect } from 'react';
import { RequestState } from '../types';
import { generateCode, SUPPORTED_LANGS } from '../utils/codegen';

interface CodeGenModalProps {
  open: boolean;
  request: RequestState;
  onClose: () => void;
}

export const CodeGenModal: React.FC<CodeGenModalProps> = ({ open, request, onClose }) => {
  const [lang, setLang] = useState<string>(SUPPORTED_LANGS[0].id);
  const [code, setCode] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    const out = generateCode(lang, request);
    setCode(out);
  }, [open, lang, request]);

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
            <pre className="code-block" tabIndex={0}>{code}</pre>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CodeGenModal;
