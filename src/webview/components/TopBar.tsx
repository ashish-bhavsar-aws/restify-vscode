import React, { useState, useRef, useEffect } from 'react';
import { Environment } from '../types';

interface TopBarProps {
  name: string;
  isDirty?: boolean;
  environments: Environment[];
  activeEnvId: string | null;
  onNameChange: (name: string) => void;
  onEnvChange: (id: string | null) => void;
  onOpenSettings: () => void;
  onManageEnvs: () => void;
}

const EnvDropdown: React.FC<{ environments: Environment[]; activeEnvId: string | null; onChange: (id: string | null) => void }> = ({ environments, activeEnvId, onChange }) => {
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

  const allOptions = [{ id: null as any, name: 'No Environment' }, ...environments];

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault();
        setOpen(true);
        setActiveIndex(allOptions.findIndex((o) => o.id === activeEnvId));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, allOptions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(allOptions[activeIndex].id);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const activeEnv = activeEnvId ? environments.find((e) => e.id === activeEnvId) : null;

  return (
    <div className="env-dropdown" ref={ref}>
      <button
        className="env-trigger"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="env-trigger-label">{activeEnv?.name || 'No Environment'}</span>
        <svg className={`env-chevron${open ? ' open' : ''}`} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </svg>
      </button>

      {open && (
        <ul className="env-menu" role="listbox">
          {allOptions.map((opt, idx) => (
            <li
              key={opt.id || '__none__'}
              role="option"
              aria-selected={opt.id === activeEnvId}
              className={`env-option${opt.id === activeEnvId ? ' selected' : ''}${idx === activeIndex ? ' highlighted' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.id);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <span className="env-option-label">{opt.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const TopBar: React.FC<TopBarProps> = ({
  name,
  isDirty = false,
  environments,
  activeEnvId,
  onNameChange,
  onEnvChange,
  onOpenSettings,
  onManageEnvs,
}) => (
  <div className="top-bar">
    <div className="brand">
      <img className="brand-icon" src={(window as any).restifyMedia?.sidebarIcon || ''} alt="Restify" />
      <span className="brand-text">Restify</span>
    </div>

    <div className="request-name-wrapper">
      <input
        type="text"
        className="request-name-input"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Untitled Request"
      />
      {isDirty && <span className="dirty-dot" title="Unsaved changes" />}
    </div>

    <EnvDropdown environments={environments} activeEnvId={activeEnvId} onChange={onEnvChange} />

    <button className="manage-env-btn" title="Manage Environments" onClick={onManageEnvs}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
      </svg>
    </button>

    <button className="gear-btn" title="Open Settings" onClick={onOpenSettings}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z" />
      </svg>
    </button>
  </div>
);

