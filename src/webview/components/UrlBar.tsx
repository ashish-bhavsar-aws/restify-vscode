import React, { useMemo, useState, useRef, useEffect } from 'react';
import { METHODS, KVItem, Environment } from '../types';
import VariableTextInput from './VariableTextInput';
import { Icon } from './FaIcon';
import { faFloppyDisk } from '@fortawesome/free-solid-svg-icons';

interface UrlBarProps {
  method: string;
  url: string;
  loading: boolean;
  sendDisabled?: boolean;
  queryParams?: KVItem[];
  environment?: Environment | null;
  onMethodChange: (method: string) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  onSave: () => void;
}

// Compact label for methods that are long
const METHOD_SHORT: Record<string, string> = {
  DELETE: 'DEL',
  OPTIONS: 'OPT',
};

const MethodDropdown: React.FC<{ method: string; onChange: (m: string) => void }> = ({ method, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(METHODS.indexOf(method));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, METHODS.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(METHODS[activeIndex]);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="method-dropdown" ref={ref}>
      <button
        className="method-trigger"
        data-method={method}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="method-trigger-label">{METHOD_SHORT[method] ?? method}</span>
        <svg className={`method-chevron${open ? ' open' : ''}`} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <ul className="method-menu" role="listbox">
          {METHODS.map((m, idx) => (
            <li
              key={m}
              role="option"
              aria-selected={m === method}
              className={`method-option${m === method ? ' selected' : ''}${idx === activeIndex ? ' highlighted' : ''}`}
              data-method={m}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(m);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="method-option-dot" />
              <span className="method-option-label">{m}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const UrlBar: React.FC<UrlBarProps> = ({
  method,
  url,
  loading,
  sendDisabled = false,
  queryParams = [],
  environment,
  onMethodChange,
  onUrlChange,
  onSend,
  onSave,
}) => {
  // Build full URL with query params
  const displayUrl = useMemo(() => {
    const enabledParams = queryParams.filter((p) => p.key && p.enabled !== false);
    if (enabledParams.length === 0) return url;

    const baseUrl = url.split('?')[0]; // Remove existing query string
    const queryString = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${baseUrl}${queryString ? '?' + queryString : ''}`;
  }, [url, queryParams]);

  return (
    <div className="url-bar">
      <MethodDropdown method={method} onChange={onMethodChange} />

      <div className="url-input-wrapper">
        <VariableTextInput
          value={displayUrl}
          placeholder="https://api.example.com/endpoint"
          onChange={(v) => onUrlChange(v)}
          variables={environment?.variables}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !sendDisabled) onSend();
          }}
          className="url-input"
        />
      </div>

      <button className="save-btn" onClick={onSave} title="Save to Collection">
        <Icon icon={faFloppyDisk} size={13} style={{ marginRight: 5 }} />
        Save
      </button>

      <button className="send-btn" disabled={loading || sendDisabled} onClick={onSend}>
        {loading ? 'Sending…' : sendDisabled ? 'Waiting…' : 'Send →'}
      </button>
    </div>
  );
};

