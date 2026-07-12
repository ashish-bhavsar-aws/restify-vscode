import React, { useState, useRef, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { Environment } from '../types';
import { Icon, faCode } from './FaIcon';

interface TopBarProps {
  name: string;
  isDirty?: boolean;
  environments: Environment[];
  activeEnvId: string | null;
  onNameChange: (name: string) => void;
  onEnvChange: (id: string | null) => void;
  onOpenSettings: () => void;
  onManageEnvs: () => void;
  onGenerateCode: () => void;
  codegenEnabled?: boolean;
}

const TopBarContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: -0.5px;
  background: linear-gradient(135deg, ${({ theme }) => theme.accent}, ${({ theme }) => theme.accent2});
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  flex-shrink: 0;
  white-space: nowrap;
`;

const BrandIcon = styled.img`
  width: 20px;
  height: 20px;
  object-fit: contain;
  display: block;
  flex-shrink: 0;
`;

const RequestNameWrapper = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
  position: relative;
`;

const RequestNameInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  font-size: 12px;
  outline: none;
  padding: 3px 6px;
  font-family: inherit;
  min-width: 0;

  &:focus {
    color: ${({ theme }) => theme.fg};
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }
`;

const DirtyDot = styled.span`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${({ theme }) => theme.warning};
  flex-shrink: 0;
  margin-left: 2px;
  opacity: 0.85;
`;

const EnvDropdownContainer = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const EnvTrigger = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 28px;
  min-width: 140px;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  cursor: pointer;
  font-family: inherit;
  font-size: 11px;
  color: ${({ theme }) => theme.fg};
  transition: border-color 0.15s, background 0.15s;
  outline: none;

  &:hover {
    background: ${({ theme }) => theme.hover};
    border-color: ${({ theme }) => theme.accent};
  }
`;

const EnvTriggerLabel = styled.span`
  flex: 1;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const EnvChevron = styled.svg<{ $open: boolean }>`
  fill: ${({ theme }) => theme.muted};
  transition: transform 0.18s;
  flex-shrink: 0;
  ${({ $open }) => $open && css`
    transform: rotate(180deg);
  `}
`;

const EnvMenu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 160px;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  list-style: none;
  padding: 4px;
  z-index: 9999;
  box-shadow: 0 12px 32px ${({ theme }) => theme.shadowSm};
  margin: 0;
`;

const EnvOption = styled.li<{ $selected: boolean; $highlighted: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  color: ${({ theme }) => theme.fg};
  transition: background 0.1s;
  user-select: none;

  ${({ $highlighted, theme }) => $highlighted && css`
    background: ${theme.hover};
  `}

  ${({ $selected, theme }) => $selected && css`
    background: color-mix(in srgb, ${theme.accent} 12%, transparent);
    color: ${theme.accent};
    font-weight: 600;
  `}
`;

const EnvOptionLabel = styled.span`
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ManageEnvBtn = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: ${({ theme }) => theme.radius};
  opacity: 0.7;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    background: ${({ theme }) => theme.surface2};
    opacity: 1;
    color: ${({ theme }) => theme.accent};
  }
`;

const GearBtn = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: ${({ theme }) => theme.radius};
  opacity: 0.8;
  flex-shrink: 0;
  transition: all 0.15s;

  &:hover {
    background: ${({ theme }) => theme.surface2};
    opacity: 1;
    color: ${({ theme }) => theme.accent};
  }
`;

const CodegenBtn = styled.button<{ $enabled: boolean }>`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  opacity: 0.85;
  flex-shrink: 0;
  transition: background 0.12s, color 0.12s;

  ${({ $enabled }) => !$enabled && css`
    opacity: 0.4;
    cursor: not-allowed;
  `}

  &:hover {
    background: ${({ theme }) => theme.surface2};
    color: ${({ theme }) => theme.accent};
  }

  svg {
    fill: currentColor;
  }
`;

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
    <EnvDropdownContainer ref={ref}>
      <EnvTrigger
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <EnvTriggerLabel data-testid="env-trigger-label">{activeEnv?.name || 'No Environment'}</EnvTriggerLabel>
        <EnvChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </EnvChevron>
      </EnvTrigger>

      {open && (
        <EnvMenu role="listbox">
          {allOptions.map((opt, idx) => (
            <EnvOption
              key={opt.id || '__none__'}
              role="option"
              aria-selected={opt.id === activeEnvId}
              $selected={opt.id === activeEnvId}
              $highlighted={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.id);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <EnvOptionLabel>{opt.name}</EnvOptionLabel>
            </EnvOption>
          ))}
        </EnvMenu>
      )}
    </EnvDropdownContainer>
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
  onGenerateCode,
  codegenEnabled = false,
}) => (
  <TopBarContainer>
    <Brand>
      <BrandIcon src={(window as any).restifyMedia?.sidebarIcon || ''} alt="Restify" />
      <span>Restify</span>
    </Brand>

    <RequestNameWrapper>
      <RequestNameInput
        type="text"
        value={name}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Untitled Request"
      />
      {isDirty && <DirtyDot title="Unsaved changes" />}
    </RequestNameWrapper>

    <EnvDropdown environments={environments} activeEnvId={activeEnvId} onChange={onEnvChange} />

    <ManageEnvBtn data-testid="manage-env-btn" title="Manage Environments" onClick={onManageEnvs}>
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
      </svg>
    </ManageEnvBtn>

    <GearBtn data-testid="gear-btn" title="Open Settings" onClick={onOpenSettings}>
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 13.616v-3.232c-1.651-.587-2.694-.752-3.219-2.019v-.001c-.527-1.271.1-2.134.847-3.707l-2.285-2.285c-1.561.742-2.433 1.375-3.707.847h-.001c-1.269-.526-1.435-1.576-2.019-3.219h-3.232c-.582 1.635-.749 2.692-2.019 3.219h-.001c-1.271.528-2.132-.098-3.707-.847l-2.285 2.285c.745 1.568 1.375 2.434.847 3.707-.527 1.271-1.584 1.438-3.219 2.02v3.232c1.632.58 2.692.749 3.219 2.019.53 1.282-.114 2.166-.847 3.707l2.285 2.286c1.562-.743 2.434-1.375 3.707-.847h.001c1.27.526 1.436 1.579 2.019 3.219h3.232c.582-1.636.75-2.69 2.027-3.222h.001c1.262-.524 2.12.101 3.698.851l2.285-2.286c-.744-1.563-1.375-2.433-.848-3.706.527-1.271 1.588-1.44 3.221-2.021zm-12 2.384c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z" />
      </svg>
    </GearBtn>
    <CodegenBtn data-testid="codegen-btn" $enabled={codegenEnabled} title="Generate Code" onClick={onGenerateCode} disabled={!codegenEnabled}>
      <Icon icon={faCode} size={14} />
    </CodegenBtn>
  </TopBarContainer>
);
