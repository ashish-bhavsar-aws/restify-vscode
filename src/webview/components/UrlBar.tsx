import React, { useMemo, useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { METHODS, KVItem, Environment } from '../types';
import VariableTextInput from './VariableTextInput';
import { Icon } from './FaIcon';
import { faFloppyDisk, faStop } from '@fortawesome/free-solid-svg-icons';
import { getMethodColor } from '../theme/methodColors';
import { getVariableSuggestions, applyVariableSuggestion } from '../../core/variableSuggestions';

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
  onCancel?: () => void;
  onSave: () => void;
}

const METHOD_SHORT: Record<string, string> = {
  DELETE: 'DEL',
  OPTIONS: 'OPT',
};

const UrlBarContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const MethodDropdownWrapper = styled.div`
  position: relative;
  flex-shrink: 0;
`;

const MethodTrigger = styled.button<{ $methodColor: string }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  height: 34px;
  min-width: 82px;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-left: 3px solid ${({ $methodColor }) => $methodColor};
  border-radius: ${({ theme }) => theme.radius};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: ${({ $methodColor }) => $methodColor};
  transition: border-color 0.15s, background 0.15s;
  outline: none;

  &:hover {
    background: ${({ theme }) => theme.hover};
    border-color: ${({ $methodColor }) => $methodColor};
  }
`;

const MethodTriggerLabel = styled.span`
  flex: 1;
  text-align: left;
`;

const MethodChevron = styled.svg<{ $open: boolean }>`
  fill: ${({ theme }) => theme.muted};
  transition: transform 0.18s;
  flex-shrink: 0;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'none')};
`;

const MethodMenu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  min-width: 130px;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  list-style: none;
  padding: 4px;
  z-index: 9999;
  box-shadow: 0 8px 24px ${({ theme }) => theme.shadowSm};
  margin: 0;
`;

const MethodOption = styled.li<{
  $selected: boolean;
  $highlighted: boolean;
  $methodColor: string;
}>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: ${({ $selected, $methodColor, theme }) =>
    $selected ? $methodColor : theme.fg};
  background: ${({ $selected, $highlighted, $methodColor, theme }) => {
    if ($selected) return `color-mix(in srgb, ${$methodColor} 12%, transparent)`;
    if ($highlighted) return theme.hover;
    return 'transparent';
  }};
  transition: background 0.1s;
  user-select: none;
`;

const MethodOptionDot = styled.span<{ $methodColor: string }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $methodColor }) => $methodColor};
  flex-shrink: 0;
`;

const MethodOptionLabel = styled.span`
  flex: 1;
`;

const UrlInputWrapper = styled.div`
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
`;

const UrlSuggestionDropdown = styled.div`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  z-index: 1000;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  box-shadow: 0 4px 16px ${({ theme }) => theme.shadowSm};
  max-height: 200px;
  overflow-y: auto;
  margin-top: 4px;
  min-width: 160px;
`;

const UrlSuggestionItem = styled.div<{ $active?: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.info};
  background: ${({ $active, theme }) => ($active ? theme.hover : 'transparent')};
`;

const SaveBtn = styled.button`
  background: ${({ theme }) => theme.surface2};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  height: 34px;
  padding: 0 12px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: all 0.15s;

  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const SendBtn = styled.button<{ $disabled: boolean }>`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  height: 34px;
  padding: 0 18px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  flex-shrink: 0;
  transition: transform 0.15s, background 0.15s, box-shadow 0.15s;
  box-shadow: 0 1px 0 ${({ theme }) => theme.innerHighlight} inset,
    0 8px 20px color-mix(in srgb, ${({ theme }) => theme.accent} 18%, transparent);
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  cursor: ${({ $disabled }) => ($disabled ? 'not-allowed' : 'pointer')};

  &:hover:not(:disabled) {
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 92%, white);
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: translateY(0);
  }
`;

const CancelBtn = styled.button`
  background: color-mix(in srgb, ${({ theme }) => theme.error} 14%, transparent);
  color: ${({ theme }) => theme.error};
  border: 1px solid color-mix(in srgb, ${({ theme }) => theme.error} 45%, transparent);
  height: 34px;
  padding: 0 18px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  font-family: inherit;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  transition: background 0.15s, border-color 0.15s, transform 0.15s;

  &:hover {
    background: color-mix(in srgb, ${({ theme }) => theme.error} 22%, transparent);
    border-color: ${({ theme }) => theme.error};
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }
`;

const MethodDropdown: React.FC<{ method: string; onChange: (m: string) => void }> = ({ method, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const methodColor = getMethodColor(method);

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
    <MethodDropdownWrapper ref={ref}>
      <MethodTrigger
        data-testid="method-trigger"
        $methodColor={methodColor}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <MethodTriggerLabel data-testid="method-trigger-label">{METHOD_SHORT[method] ?? method}</MethodTriggerLabel>
        <MethodChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </MethodChevron>
      </MethodTrigger>

      {open && (
        <MethodMenu role="listbox">
          {METHODS.map((m, idx) => {
            const mc = getMethodColor(m);
            return (
              <MethodOption
                key={m}
                role="option"
                aria-selected={m === method}
                $selected={m === method}
                $highlighted={idx === activeIndex}
                $methodColor={mc}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(m);
                  setOpen(false);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
              >
                <MethodOptionDot $methodColor={mc} />
                <MethodOptionLabel>{m}</MethodOptionLabel>
              </MethodOption>
            );
          })}
        </MethodMenu>
      )}
    </MethodDropdownWrapper>
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
  onCancel,
  onSave,
}) => {
  const [urlFocused, setUrlFocused] = useState(false);
  const [urlActiveIndex, setUrlActiveIndex] = useState(-1);
  const urlDropdownRef = useRef<HTMLDivElement>(null);

  const displayUrl = useMemo(() => {
    const enabledParams = queryParams.filter((p) => p.key && p.enabled !== false);
    if (enabledParams.length === 0) return url;

    const baseUrl = url.split('?')[0];
    const queryString = enabledParams.map((p) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`).join('&');
    return `${baseUrl}${queryString ? '?' + queryString : ''}`;
  }, [url, queryParams]);

  // Query-string values are stored percent-encoded in displayUrl (handleUrlChange
  // parses them into queryParams), so decode before matching trailing `{{$` tokens.
  const urlForSuggestions = useMemo(() => {
    try {
      return decodeURIComponent(displayUrl);
    } catch {
      return displayUrl;
    }
  }, [displayUrl]);

  const urlSuggestions = urlFocused
    ? getVariableSuggestions(
        urlForSuggestions,
        (environment?.variables || []).map((v) => v.key),
      )
    : [];

  const handleUrlKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!urlSuggestions.length) {
      if (e.key === 'Enter' && !sendDisabled) onSend();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setUrlActiveIndex((i) => Math.min(i + 1, urlSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setUrlActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const idx = urlActiveIndex >= 0 ? urlActiveIndex : 0;
      onUrlChange(applyVariableSuggestion(urlForSuggestions, urlSuggestions[idx]));
      setUrlActiveIndex(-1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setUrlActiveIndex(-1);
    }
  };

  return (
    <UrlBarContainer>
      <MethodDropdown method={method} onChange={onMethodChange} />

      <UrlInputWrapper>
        <VariableTextInput
          value={displayUrl}
          placeholder="https://api.example.com/endpoint"
          onChange={(v) => onUrlChange(v)}
          variables={environment?.variables}
          onFocus={() => { setUrlFocused(true); setUrlActiveIndex(-1); }}
          onBlur={() => {
            setTimeout(() => { setUrlFocused(false); setUrlActiveIndex(-1); }, 200);
          }}
          onKeyDown={handleUrlKeyDown}
          className="url-input"
        />

        {urlSuggestions.length > 0 && (
          <UrlSuggestionDropdown ref={urlDropdownRef}>
            {urlSuggestions.map((s, idx) => (
              <UrlSuggestionItem
                key={s.token}
                data-testid="url-suggestion-item"
                $active={idx === urlActiveIndex}
                onMouseDown={() => {
                  onUrlChange(applyVariableSuggestion(urlForSuggestions, s));
                  setUrlActiveIndex(-1);
                }}
                onMouseEnter={() => setUrlActiveIndex(idx)}
                onMouseLeave={() => setUrlActiveIndex(-1)}
                title={s.dynamic ? 'Dynamic variable' : 'Environment variable'}
              >
                {s.dynamic ? s.token : `{{${s.name}}}`}
              </UrlSuggestionItem>
            ))}
          </UrlSuggestionDropdown>
        )}
      </UrlInputWrapper>

      <SaveBtn data-testid="save-btn" onClick={onSave} title="Save to Collection">
        <Icon icon={faFloppyDisk} size={13} />
        Save
      </SaveBtn>

      {loading ? (
        <CancelBtn
          data-testid="cancel-btn"
          onClick={onCancel}
          title="Cancel request"
          type="button"
        >
          <Icon icon={faStop} size={12} />
          Cancel
        </CancelBtn>
      ) : (
        <SendBtn data-testid="send-btn" $disabled={sendDisabled} disabled={sendDisabled} onClick={onSend}>
          {sendDisabled ? 'Waiting…' : 'Send →'}
        </SendBtn>
      )}
    </UrlBarContainer>
  );
};
