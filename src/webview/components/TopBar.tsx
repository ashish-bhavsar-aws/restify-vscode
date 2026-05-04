import React from 'react';
import { Environment, METHODS, METHOD_COLORS } from '../types';

interface TopBarProps {
  name: string;
  isDirty?: boolean;
  environments: Environment[];
  activeEnvId: string | null;
  onNameChange: (name: string) => void;
  onEnvChange: (id: string | null) => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  name,
  isDirty = false,
  environments,
  activeEnvId,
  onNameChange,
  onEnvChange,
  onOpenSettings,
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

    <select
      className="env-selector"
      value={activeEnvId || ''}
      onChange={(e) => onEnvChange(e.target.value || null)}
    >
      <option value="">No Environment</option>
      {environments.map((env) => (
        <option key={env.id} value={env.id}>
          {env.name}
        </option>
      ))}
    </select>

    <button className="gear-btn" title="Open Settings" onClick={onOpenSettings}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z" />
      </svg>
    </button>
  </div>
);

