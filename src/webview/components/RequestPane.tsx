import React, { useState, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { KVItem, FormDataItem, RequestState, Environment, OAuth2ConfigPayload } from '../types';
import { KeyValueTable } from './KeyValueTable';
import { CodeEditor } from './CodeEditor';
import { getScriptTemplate } from './scriptExecutor';
import { Icon, faEye, faEyeSlash, faTrash, faList, faLink, faFileLines, faTerminal, faKey } from './FaIcon';
import { faListCheck } from '@fortawesome/free-solid-svg-icons';
import { getSuggestedContentType } from '../utils/formDataTypeDetector';
import {
  FieldLabel,
  AuthFieldsContainer,
  AuthInput,
  RelativeWrap,
  PasswordToggleBtn,
  OAuthHint,
  AuthTypeWrap,
  AuthTypeTriggerBtn,
  AuthTypeTriggerLabel,
  AuthTypeChevron,
  AuthTypeMenu,
  AuthTypeOption,
  AuthTypeOptLabel,
} from './authStyles';
import {
  InheritAuthFields,
  DigestAuthFields,
  SigV4AuthFields,
  JwtAuthFields,
  HawkAuthFields,
  JwtAlgorithmDropdown,
  HawkAlgorithmDropdown,
} from './AuthSchemeFields';

interface RequestPaneProps {
  request: RequestState;
  onUpdate: (updates: Partial<RequestState>) => void;
  themeKind?: number;
  environment?: Environment | null;
  oauthFetching?: boolean;
  oauthStatus?: { state: 'success' | 'error' | 'none'; text?: string };
  onGetOAuthToken?: (config: OAuth2ConfigPayload) => void;
}

type ReqTab = 'params' | 'headers' | 'body' | 'script' | 'auth' | 'schema';
type BodyType = RequestState['bodyType'];
type AuthType = RequestState['authType'];

/* ─── Styled Components ──────────────────────────── */

const PaneWrapper = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({ theme }) => theme.border};
  min-width: 0;
  background: color-mix(in srgb, ${({ theme }) => theme.bg} 96%, ${({ theme }) => theme.surface} 4%);
`;

const TabBarContainer = styled.div`
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0 14px;
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
  gap: 2px;
`;

const TabItem = styled.div<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: all .15s;
  color: ${({ $active, theme }) => ($active ? theme.accent : theme.muted)};
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.accent : 'transparent')};
  background: ${({ $active, theme }) =>
    $active ? `color-mix(in srgb, ${theme.accent} 8%, transparent)` : 'transparent'};

  &:hover {
    color: ${({ $active, theme }) => ($active ? theme.accent : theme.fg)};
  }
`;

const TabIcon = styled(Icon)<{ $active?: boolean }>`
  color: ${({ $active, theme }) => ($active ? theme.accent : theme.muted)};
  flex-shrink: 0;
`;

const TabBadgeCount = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  font-size: 9px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  margin-left: 4px;
  font-weight: 700;
  vertical-align: middle;
  line-height: 1;
`;

const TabBadgeDot = styled(TabBadgeCount)`
  width: 6px;
  height: 6px;
  min-width: 6px;
  border-radius: 50%;
  padding: 0;
`;

const TabPanel = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  flex-direction: column;
`;

const ScrollContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.border};
    border-radius: 3px;
  }
`;

const BodyTypeBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
  flex-wrap: wrap;
`;

const BodyTypeBtn = styled.button<{ $active?: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.surface2 : 'none')};
  border: 1px solid ${({ $active, theme }) => ($active ? theme.border : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.fg : theme.muted)};
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-family: inherit;
  transition: all .15s;

  &:hover {
    color: ${({ theme }) => theme.fg};
    border-color: ${({ theme }) => theme.border};
  }
`;

const EmptyBodyText = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
`;

const BodyEditorWrap = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
`;

/* ─── Form Data Section ──────────────────────────── */

const FormWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

const FormRow = styled.div`
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  min-height: 36px;

  &:last-of-type {
    border-bottom: none;
  }
`;

const FormCheck = styled.div`
  padding: 0 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;

  input[type='checkbox'] {
    cursor: pointer;
    accent-color: ${({ theme }) => theme.accent};
  }
`;

const FormInput = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  padding: 8px 10px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  outline: none;
  min-width: 0;
  border-right: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  transition: background-color 0.2s, color 0.2s;

  &:last-of-type {
    border-right: none;
  }

  &:focus {
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 8%, ${({ theme }) => theme.inputBg});
    color: ${({ theme }) => theme.fg};
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }
`;

const FormKeyWrap = styled.div`
  display: flex;
  align-items: stretch;
  flex: 1;
  border-right: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  gap: 0;

  & ${FormInput} {
    flex: 1;
    border-right: none;
  }
`;

const FormTypeSelect = styled.select`
  flex: 0 0 40px;
  background: ${({ theme }) => theme.surface2};
  border: none;
  color: ${({ theme }) => theme.fg};
  padding: 0 4px;
  font-size: 10px;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  text-align: center;
  font-weight: 600;
  border-left: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);

  &:hover {
    background: ${({ theme }) => theme.surface};
  }

  &:focus {
    outline: none;
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 15%, ${({ theme }) => theme.surface2});
    color: ${({ theme }) => theme.accent};
  }
`;

const FormFileWrap = styled.div`
  flex: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  background: ${({ theme }) => theme.surface2};
  border-radius: 3px;
  min-height: 28px;
  min-width: 0;
`;

const FormFileInput = styled.input`
  flex: 1 1 0;
  font-size: 10px;
  color: ${({ theme }) => theme.inputFg};
  cursor: pointer;
  min-width: 0;
  width: 100%;

  &::file-selector-button {
    background: ${({ theme }) => theme.surface};
    color: ${({ theme }) => theme.fg};
    border: 1px solid ${({ theme }) => theme.border};
    padding: 3px 8px;
    border-radius: 2px;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
    margin-right: 4px;

    &:hover {
      background: ${({ theme }) => theme.hover};
    }
  }
`;

const FormFileName = styled.span<{ $hasFile?: boolean }>`
  max-width: 160px;
  font-size: 10px;
  color: ${({ $hasFile, theme }) => ($hasFile ? theme.success : theme.muted)};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 0;
  padding: 0 4px;
`;

const FormDelBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.muted};
  padding: 4px 8px;
  font-size: 15px;
  flex-shrink: 0;
  transition: color .1s;
  display: flex;
  align-items: center;

  &:hover {
    color: ${({ theme }) => theme.error};
  }
`;

const FormAddBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  cursor: pointer;
  font-size: 11px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  transition: opacity .15s;

  &:hover {
    opacity: .8;
  }
`;

/* ─── Content-Type Sub-Row ───────────────────────── */

const CtypeRow = styled.div`
  display: flex;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding-left: 24px;
  align-items: center;
`;

const CtypeLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

const CtypeBadge = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.accent};
  font-family: monospace;
  padding: 2px 6px;
  border-radius: 4px;
  background: color-mix(in srgb, ${({ theme }) => theme.accent} 10%, transparent);
`;

const CtypeUseBtn = styled.button`
  padding: 2px 8px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  background-color: ${({ theme }) => theme.accent};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.accentFg};
`;

const CtypeClearBtn = styled.button`
  padding: 2px 8px;
  font-size: 11px;
  white-space: nowrap;
  cursor: pointer;
  background-color: transparent;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 3px;
  color: ${({ theme }) => theme.muted};
`;

const CtypeFileRow = styled.div`
  display: flex;
  gap: 4px;
  width: 100%;
  margin-top: 4px;
  padding-left: 24px;
`;

/* ─── GraphQL Section ────────────────────────────── */

const GqlLabel = styled.div<{ $hasBorderTop?: boolean }>`
  padding: 6px 10px;
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  ${({ $hasBorderTop, theme }) =>
    $hasBorderTop && `border-top: 1px solid ${theme.border};`}
`;

const CodeTextarea = styled.textarea`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  border: none;
  color: ${({ theme }) => theme.inputFg};
  padding: 10px 14px;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  resize: none;
  outline: none;
  line-height: 1.6;
  tab-size: 2;
`;

/* ─── SOAP / WSDL Section ─────────────────────────── */

const SoapMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

const SoapMetaLabel = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

const SoapMetaSelect = styled.select`
  flex: 1;
  min-width: 0;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.inputFg};
  padding: 3px 8px;
  border-radius: 3px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
  cursor: pointer;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

/* ─── Script Tab ─────────────────────────────────── */

const ScriptTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
`;

const ScriptDesc = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 6px;
`;

const Mono = styled.span`
  font-family: monospace;
`;

const SchemaTitle = styled.div`
  font-size: 12px;
  font-weight: 600;
`;

const SchemaDesc = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 6px;
`;

const SchemaToggleRow = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  cursor: pointer;
  user-select: none;

  input[type="checkbox"] {
    accent-color: ${({ theme }) => theme.accent};
  }
`;

/* ─── Auth Panel ─────────────────────────────────── */

const AuthPanelWrapper = styled.div`
  padding: 12px;
`;

/* ─── OAuth 2.0 ─────────────────────────────────── */

const OAuthStatus = styled.div<{ $state?: 'success' | 'error' }>`
  margin-top: 10px;
  padding: 6px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  line-height: 1.4;
  color: ${({ theme, $state }) =>
    $state === 'success' ? '#2ea043' : $state === 'error' ? '#f85149' : theme.muted};
  background: ${({ theme, $state }) =>
    $state
      ? `color-mix(in srgb, ${$state === 'success' ? '#2ea043' : '#f85149'} 10%, transparent)`
      : theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  word-break: break-word;
`;

const OAuthGetTokenBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 12px;
  width: 100%;
  padding: 7px 12px;
  background: ${({ theme }) => theme.accent};
  color: #fff;
  border: none;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;

  &:hover:not(:disabled) {
    opacity: 0.9;
  }

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const OAuthSpin = styled.span`
  width: 10px;
  height: 10px;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const OAuthTokenRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

const OAuthResetBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  font-size: 11px;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
`;

/* ─── Auth Type Dropdown ─────────────────────────── */

/* ─── Add-To Dropdown ────────────────────────────── */

const AddToWrap = styled.div`
  position: relative;
  width: 100%;
`;

const AddToTriggerBtn = styled.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 10px;
  height: auto;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: ${({ theme }) => theme.fg};
  transition: border-color .15s, background .15s;
  outline: none;
  text-align: left;

  &:hover {
    background: ${({ theme }) => theme.hover};
    border-color: ${({ theme }) => theme.accent};
  }
`;

const AddToTriggerLabel = styled.span`
  flex: 1;
`;

const AddToChevron = styled.svg<{ $open?: boolean }>`
  fill: ${({ theme }) => theme.muted};
  transition: transform .18s;
  flex-shrink: 0;
  margin-left: 6px;
  transform: ${({ $open }) => ($open ? 'rotate(180deg)' : 'rotate(0)')};
`;

const AddToMenu = styled.ul`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  list-style: none;
  padding: 4px;
  z-index: 9999;
  box-shadow: 0 8px 24px ${({ theme }) => theme.shadowSm};
  margin: 0;
`;

const AddToOption = styled.li<{ $selected?: boolean; $highlighted?: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
  transition: background .1s;
  color: ${({ $selected, theme }) => ($selected ? theme.accent : theme.fg)};
  font-weight: ${({ $selected }) => ($selected ? 600 : 400)};
  background: ${({ $selected, $highlighted, theme }) =>
    $selected
      ? `color-mix(in srgb, ${theme.accent} 12%, transparent)`
      : $highlighted
        ? theme.hover
        : 'transparent'};

  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const AddToOptLabel = styled.span`
  flex: 1;
`;

/* ─── Constants ──────────────────────────────────── */

const AUTH_TYPES: Array<{ value: AuthType; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'inherit', label: 'Inherit from Collection' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'apikey', label: 'API Key' },
  { value: 'digest', label: 'Digest Auth' },
  { value: 'awssigv4', label: 'AWS Signature v4' },
  { value: 'jwt', label: 'JWT Bearer' },
  { value: 'hawk', label: 'Hawk Auth' },
  { value: 'oauth2', label: 'OAuth 2.0' },
];

const BODY_TYPES: BodyType[] = ['none', 'json', 'form', 'urlencoded', 'text', 'xml', 'graphql'];

/* ─── AddToDropdown ──────────────────────────────── */

const AddToDropdown: React.FC<{ value: 'header' | 'query'; onChange: (v: 'header' | 'query') => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const options = [
    { val: 'header' as const, label: 'Header' },
    { val: 'query' as const, label: 'Query Param' },
  ];

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
        setActiveIndex(options.findIndex((o) => o.val === value));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(options[activeIndex].val);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const label = value === 'header' ? 'Header' : 'Query Param';

  return (
    <AddToWrap ref={ref}>
      <AddToTriggerBtn
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <AddToTriggerLabel>{label}</AddToTriggerLabel>
        <AddToChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </AddToChevron>
      </AddToTriggerBtn>

      {open && (
        <AddToMenu role="listbox">
          {options.map((opt, idx) => (
            <AddToOption
              key={opt.val}
              role="option"
              aria-selected={opt.val === value}
              $selected={opt.val === value}
              $highlighted={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(opt.val);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <AddToOptLabel>{opt.label}</AddToOptLabel>
            </AddToOption>
          ))}
        </AddToMenu>
      )}
    </AddToWrap>
  );
};

/* ─── AuthTypeDropdown ───────────────────────────── */

const AuthTypeDropdown: React.FC<{ authType: AuthType; onChange: (type: AuthType) => void }> = ({ authType, onChange }) => {
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
        setActiveIndex(AUTH_TYPES.findIndex((t) => t.value === authType));
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, AUTH_TYPES.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onChange(AUTH_TYPES[activeIndex].value);
      setOpen(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  const label = AUTH_TYPES.find((t) => t.value === authType)?.label || 'None';

  return (
    <AuthTypeWrap ref={ref}>
      <AuthTypeTriggerBtn
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <AuthTypeTriggerLabel>{label}</AuthTypeTriggerLabel>
        <AuthTypeChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M0 0l5 6 5-6z" />
        </AuthTypeChevron>
      </AuthTypeTriggerBtn>

      {open && (
        <AuthTypeMenu role="listbox">
          {AUTH_TYPES.map((t, idx) => (
            <AuthTypeOption
              key={t.value}
              role="option"
              aria-selected={t.value === authType}
              $selected={t.value === authType}
              $highlighted={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t.value);
                setOpen(false);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <AuthTypeOptLabel>{t.label}</AuthTypeOptLabel>
            </AuthTypeOption>
          ))}
        </AuthTypeMenu>
      )}
    </AuthTypeWrap>
  );
};

/* ─── RequestPane ────────────────────────────────── */

export const RequestPane: React.FC<RequestPaneProps> = ({ request, onUpdate, themeKind, environment, oauthFetching, oauthStatus, onGetOAuthToken }) => {
  const [activeTab, setActiveTab] = useState<ReqTab>('params');

  const activeParamCount = request.queryParams.filter((p) => p.key && p.enabled !== false).length;
  const activeHeaderCount = request.headers.filter((h) => h.key && h.enabled !== false).length;
  const hasBody = request.bodyType !== 'none' && (
    (request.bodyType === 'form' && (request.formData||[]).some(f => f.key)) ||
    (request.bodyType === 'urlencoded' && (request.urlencoded||[]).some(u => u.key)) ||
    (['json','text','xml','graphql'].includes(request.bodyType) && (request.body||'').trim().length > 0)
  );
  const hasAuth = request.authType && request.authType !== 'none';
  const hasScript = (request.script || '').trim().length > 0;
  const hasSchema = (request.schema || '').trim().length > 0;

  const updateKvList = (field: 'queryParams' | 'headers' | 'formData', index: number, key: keyof KVItem, value: any) => {
    const items = [...request[field]] as KVItem[];
    items[index] = { ...items[index], [key]: value };
    onUpdate({ [field]: items });
  };

  const addKvRow = (field: 'queryParams' | 'headers' | 'formData') => {
    if (field === 'formData') {
      onUpdate({
        formData: [
          ...(request.formData || []),
          { key: '', value: '', enabled: true, formType: 'text' },
        ],
      });
      return;
    }
    onUpdate({ [field]: [...(request[field] as KVItem[]), { key: '', value: '', enabled: true }] });
  };

  const removeKvRow = (field: 'queryParams' | 'headers' | 'formData', index: number) => {
    onUpdate({ [field]: (request[field] as KVItem[]).filter((_, i) => i !== index) });
  };

  const bulkInsertKvRows = (field: 'queryParams' | 'headers' | 'urlencoded', index: number, rows: KVItem[]) => {
    const current =
      field === 'urlencoded'
        ? (request.urlencoded || []) as KVItem[]
        : (request[field] as KVItem[]);
    const next = [...current];
    const target = next[index];
    // Reuse the empty target row as the first pasted row when present.
    if (target && target.key === '' && target.value === '') {
      next.splice(index, 1, ...rows);
    } else {
      next.splice(index, 0, ...rows);
    }
    onUpdate({ [field]: next });
  };

  const replaceAllKvRows = (field: 'queryParams' | 'headers' | 'urlencoded', rows: KVItem[]) => {
    onUpdate({ [field]: rows });
  };

  const updateFormDataRow = (index: number, updates: Partial<FormDataItem>) => {
    const next = [...(request.formData || [])];
    next[index] = { ...next[index], ...updates };
    onUpdate({ formData: next });
  };

  const handleSelectFormFile = (index: number, file?: File | null) => {
    if (!file) {
      updateFormDataRow(index, {
        fileName: '',
        fileContentBase64: '',
        contentType: '',
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (!(result instanceof ArrayBuffer)) return;

      const bytes = new Uint8Array(result);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }

      updateFormDataRow(index, {
        formType: 'file',
        value: '',
        fileName: file.name,
        fileContentBase64: btoa(binary),
        contentType: file.type || 'application/octet-stream',
      });
    };
    reader.readAsArrayBuffer(file);
  };

  const soapMeta = request.soapMeta;
  const soapOperations = soapMeta?.operations || [];
  const currentSoapOperation = soapOperations.find((op) => op.name === soapMeta?.operation) || soapOperations[0];

  const soapCtype = (isSoap12: boolean) =>
    isSoap12 ? 'application/soap+xml; charset=utf-8' : 'text/xml; charset=utf-8';

  const upsertHeader = (base: KVItem[], key: string, value: string) => {
    const headers = [...base];
    const index = headers.findIndex((h) => (h.key || '').toLowerCase() === key.toLowerCase());
    if (index >= 0) {
      headers[index] = { ...headers[index], value, enabled: true };
    } else {
      headers.push({ key, value, enabled: true });
    }
    return headers;
  };

  const handleSoapOperationChange = (operationName: string) => {
    const op = soapOperations.find((o) => o.name === operationName);
    if (!op || !soapMeta) return;
    let headers = upsertHeader(request.headers || [], 'SOAPAction', op.soapAction || '');
    headers = upsertHeader(headers, 'Content-Type', soapCtype(op.isSoap12));
    onUpdate({
      soapMeta: { ...soapMeta, operation: op.name, isSoap12: op.isSoap12, operations: soapOperations },
      body: op.body,
      headers,
    });
  };

  const handleBodyTypeChange = (bt: BodyType) => {
    const mapping: Record<BodyType, string | undefined> = {
      json: 'application/json',
      xml: 'application/xml',
      text: 'text/plain',
      urlencoded: 'application/x-www-form-urlencoded',
      form: 'multipart/form-data',
      graphql: 'application/json',
      none: undefined,
    };

    const desired = mapping[bt];

    const existingIndex = (request.headers || []).findIndex((h) => (h.key || '').toLowerCase() === 'content-type');

    if (desired && existingIndex === -1) {
      onUpdate({ bodyType: bt, headers: [...(request.headers || []), { key: 'Content-Type', value: desired, enabled: true }] });
      return;
    }

    onUpdate({ bodyType: bt });
  };

  return (
    <PaneWrapper id="req-pane">
      {/* Tab Bar */}
      <TabBarContainer id="req-tabs">
        {(['params', 'headers', 'body', 'script', 'auth', 'schema'] as ReqTab[]).map((tab) => (
          <TabItem
            key={tab}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            data-testid={`req-tab-${tab}`}
          >
            <TabIcon
              icon={
                tab === 'params' ? faList
                : tab === 'headers' ? faLink
                : tab === 'body' ? faFileLines
                : tab === 'script' ? faTerminal
                : tab === 'auth' ? faKey
                : faListCheck
              }
              size={12}
              $active={activeTab === tab}
            />
            {tab === 'schema' ? 'Schema' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'params' && activeParamCount > 0 && (
              <TabBadgeCount>{activeParamCount}</TabBadgeCount>
            )}
            {tab === 'headers' && activeHeaderCount > 0 && (
              <TabBadgeCount>{activeHeaderCount}</TabBadgeCount>
            )}
            {tab === 'body' && hasBody && (
              <TabBadgeDot />
            )}
            {tab === 'auth' && hasAuth && (
              <TabBadgeDot />
            )}
            {tab === 'script' && hasScript && (
              <TabBadgeDot />
            )}
            {tab === 'schema' && hasSchema && (
              <TabBadgeDot />
            )}
          </TabItem>
        ))}
      </TabBarContainer>

      {/* Params Tab */}
      {activeTab === 'params' && (
        <TabPanel>
          <ScrollContainer>
            <KeyValueTable
              items={request.queryParams}
              addLabel="+ Add Parameter"
              onAdd={() => addKvRow('queryParams')}
              onUpdate={(i, f, v) => updateKvList('queryParams', i, f, v)}
              onRemove={(i) => removeKvRow('queryParams', i)}
              environment={environment}
              onBulkInsert={(rows, idx) => bulkInsertKvRows('queryParams', idx, rows)}
              onReplaceAll={(rows) => replaceAllKvRows('queryParams', rows)}
            />
          </ScrollContainer>
        </TabPanel>
      )}

      {/* Headers Tab */}
      {activeTab === 'headers' && (
        <TabPanel>
          <ScrollContainer>
            <KeyValueTable
              items={request.headers}
              addLabel="+ Add Header"
              onAdd={() => addKvRow('headers')}
              onUpdate={(i, f, v) => updateKvList('headers', i, f, v)}
              onRemove={(i) => removeKvRow('headers', i)}
              environment={environment}
              isHeaderTable={true}
              onBulkInsert={(rows, idx) => bulkInsertKvRows('headers', idx, rows)}
              onReplaceAll={(rows) => replaceAllKvRows('headers', rows)}
            />
          </ScrollContainer>
        </TabPanel>
      )}

      {/* Body Tab */}
      {activeTab === 'body' && (
        <BodyEditorWrap>
          {/* Body type selector */}
          <BodyTypeBar>
            {BODY_TYPES.map((bt) => (
              <BodyTypeBtn
                key={bt}
                data-testid={`body-type-${bt}`}
                $active={request.bodyType === bt}
                onClick={() => handleBodyTypeChange(bt)}
              >
                {bt}
              </BodyTypeBtn>
            ))}
          </BodyTypeBar>

          {request.bodyType === 'none' && (
            <EmptyBodyText>This request has no body</EmptyBodyText>
          )}

          {(request.bodyType === 'json' || request.bodyType === 'text' || request.bodyType === 'xml') && (
            <BodyEditorWrap>
              <CodeEditor
                value={request.body}
                onChange={(body) => onUpdate({ body })}
                language={request.bodyType as 'json' | 'xml' | 'text'}
                themeKind={themeKind}
                jsonFormatMode={request.bodyFormat || 'formatted'}
                onJsonFormatModeChange={(bodyFormat) => onUpdate({ bodyFormat })}
                placeholder={request.bodyType === 'json' ? '{\n}' : 'Enter request body…'}
                variableNames={(environment?.variables || []).map((v) => v.key)}
              />
            </BodyEditorWrap>
          )}

          {request.bodyType === 'form' && (
            <BodyEditorWrap>
              <ScrollContainer style={{ flex: 1 }}>
                <FormWrap>
                  {(request.formData || []).map((item, i) => {
                    const rowType = item.formType || 'text';
                    const suggestedContentType = rowType === 'text' ? getSuggestedContentType(item.value || '', item.contentType) : undefined;
                    const shouldShowTextContentType = rowType === 'text' && ((item.contentType || '').trim().length > 0 || !!suggestedContentType);
                    return (
                      <FormRow key={i}>
                        <div style={{ display: 'flex', gap: '4px', width: '100%' }}>
                          <FormCheck>
                            <input
                              type="checkbox"
                              checked={item.enabled !== false}
                              onChange={(e) => updateFormDataRow(i, { enabled: e.target.checked })}
                            />
                          </FormCheck>
                          <FormKeyWrap>
                            <FormInput
                              type="text"
                              placeholder="Key"
                              value={item.key}
                              onChange={(e) => updateFormDataRow(i, { key: e.target.value })}
                            />
                            <FormTypeSelect
                              value={rowType}
                              onChange={(e) => {
                                const nextType = e.target.value as 'text' | 'file';
                                updateFormDataRow(i, {
                                  formType: nextType,
                                  value: nextType === 'text' ? item.value || '' : '',
                                  fileName: nextType === 'file' ? item.fileName || '' : '',
                                  fileContentBase64: nextType === 'file' ? item.fileContentBase64 || '' : '',
                                  contentType: nextType === 'file' ? item.contentType || '' : '',
                                });
                              }}
                              title={rowType === 'text' ? 'Text value' : 'File upload'}
                            >
                              <option value="text">T</option>
                              <option value="file">F</option>
                            </FormTypeSelect>
                          </FormKeyWrap>

                          {rowType === 'file' ? (
                            <FormFileWrap>
                              <FormFileInput
                                type="file"
                                onChange={(e) => handleSelectFormFile(i, e.target.files?.[0])}
                              />
                              <FormFileName
                                $hasFile={!!item.fileName}
                                title={item.fileName || 'No file selected'}
                              >
                                {item.fileName || 'No file selected'}
                              </FormFileName>
                            </FormFileWrap>
                          ) : (
                            <FormInput
                              type="text"
                              placeholder="Value"
                              value={item.value || ''}
                              onChange={(e) => updateFormDataRow(i, { value: e.target.value })}
                            />
                          )}

                          <FormDelBtn onClick={() => removeKvRow('formData', i)}>
                            <Icon icon={faTrash} size={12} />
                          </FormDelBtn>
                        </div>

                        {shouldShowTextContentType && (
                          <CtypeRow>
                            <CtypeLabel>Runtime Content-Type:</CtypeLabel>
                            <CtypeBadge title={item.contentType || suggestedContentType || 'text/plain'}>
                              {item.contentType || suggestedContentType || 'text/plain'}
                            </CtypeBadge>
                            {!item.contentType && suggestedContentType && (
                              <CtypeUseBtn
                                onClick={() => updateFormDataRow(i, { contentType: suggestedContentType })}
                                title={`Use ${suggestedContentType}`}
                              >
                                Use
                              </CtypeUseBtn>
                            )}
                            {item.contentType && (
                              <CtypeClearBtn
                                onClick={() => updateFormDataRow(i, { contentType: '' })}
                                title="Clear custom content type"
                              >
                                Clear
                              </CtypeClearBtn>
                            )}
                          </CtypeRow>
                        )}

                        {rowType === 'file' && (
                          <CtypeFileRow>
                            <FormInput
                              type="text"
                              placeholder="Content-Type (e.g., application/pdf, image/png)"
                              value={item.contentType || ''}
                              onChange={(e) => updateFormDataRow(i, { contentType: e.target.value })}
                              title="MIME type for the uploaded file"
                              style={{ flex: 1 }}
                            />
                          </CtypeFileRow>
                        )}
                      </FormRow>
                    );
                  })}
                  <FormAddBtn onClick={() => addKvRow('formData')}>
                    + Add Field
                  </FormAddBtn>
                </FormWrap>
              </ScrollContainer>
            </BodyEditorWrap>
          )}

          {request.bodyType === 'urlencoded' && (
            <ScrollContainer style={{ flex: 1 }}>
              <KeyValueTable
                items={request.urlencoded || []}
                addLabel="+ Add Parameter"
                onAdd={() => {
                  onUpdate({
                    urlencoded: [...(request.urlencoded || []), { key: '', value: '', enabled: true }],
                  });
                }}
                onUpdate={(i, f, v) => {
                  const items = [...(request.urlencoded || [])];
                  items[i] = { ...items[i], [f]: v };
                  onUpdate({ urlencoded: items });
                }}
                onRemove={(i) => {
                  onUpdate({
                    urlencoded: (request.urlencoded || []).filter((_, idx) => idx !== i),
                  });
                }}
                environment={environment}
                onBulkInsert={(rows, idx) => bulkInsertKvRows('urlencoded', idx, rows)}
                onReplaceAll={(rows) => replaceAllKvRows('urlencoded', rows)}
              />
            </ScrollContainer>
          )}

          {request.bodyType === 'graphql' && (
            <BodyEditorWrap>
              <GqlLabel>QUERY</GqlLabel>
              <CodeTextarea
                value={request.gqlQuery}
                placeholder="{ users { id name } }"
                style={{ minHeight: 0 }}
                onChange={(e) => onUpdate({ gqlQuery: e.target.value })}
              />
              <GqlLabel $hasBorderTop>VARIABLES (JSON)</GqlLabel>
              <CodeTextarea
                value={request.gqlVars}
                placeholder='{"id": 1}'
                style={{ height: 100, flexShrink: 0 }}
                onChange={(e) => onUpdate({ gqlVars: e.target.value })}
              />
            </BodyEditorWrap>
          )}

          {soapOperations.length > 0 && (
            <SoapMetaRow>
              <SoapMetaLabel>SOAP Operation</SoapMetaLabel>
              <SoapMetaSelect
                data-testid="soap-operation-select"
                value={currentSoapOperation?.name || ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSoapOperationChange(e.target.value)}
              >
                {soapOperations.map((op) => (
                  <option key={op.name} value={op.name}>
                    {op.name}
                  </option>
                ))}
              </SoapMetaSelect>
            </SoapMetaRow>
          )}
        </BodyEditorWrap>
      )}

      {/* Script Tab */}
      {activeTab === 'script' && (
        <TabPanel style={{ padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <ScriptTitle>Pre-request Script (optional)</ScriptTitle>
            <div>
              <FormAddBtn
                onClick={() => onUpdate({ preScript: "// Example: vars['authToken'] = 'abc123';" })}
              >
                Insert Example
              </FormAddBtn>
            </div>
          </div>

          <ScriptDesc>
            Write JavaScript that runs before the request is sent. Use{' '}
            <Mono>set(key, value)</Mono> to store environment variables and{' '}
            <Mono>log()</Mono> to add debug logs.
          </ScriptDesc>

          <div style={{ flex: 1, overflow: 'hidden', marginBottom: 16 }}>
            <CodeEditor
              value={request.preScript || ''}
              onChange={(preScript) => onUpdate({ preScript })}
              language={'javascript'}
              themeKind={themeKind}
              placeholder={'// Example: vars[\'authToken\'] = \'abc123\';'}
              dataTestId="code-editor-pre-script"
              variableNames={(environment?.variables || []).map((v) => v.key)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <ScriptTitle>Post-response Script (optional)</ScriptTitle>
            <div>
              <FormAddBtn
                onClick={() => onUpdate({ script: getScriptTemplate() })}
              >
                Insert Example
              </FormAddBtn>
            </div>
          </div>

          <ScriptDesc>
            Write JavaScript that runs after a response arrives. Use{' '}
            <Mono>set(key, value)</Mono> to store environment variables, and{' '}
            <Mono>log()</Mono> to add script logs.
          </ScriptDesc>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CodeEditor
              value={request.script || ''}
              onChange={(script) => onUpdate({ script })}
              language={'javascript'}
              themeKind={themeKind}
              placeholder={'// Example: vars[\'token\'] = response.body.access_token;'}
              dataTestId="code-editor-post-script"
              variableNames={(environment?.variables || []).map((v) => v.key)}
            />
          </div>
        </TabPanel>
      )}

      {/* Auth Tab */}
      {activeTab === 'auth' && (
        <TabPanel>
          <ScrollContainer>
            <AuthPanel
              authType={request.authType}
              authData={request.authData}
              environment={environment}
              oauthFetching={oauthFetching}
              oauthStatus={oauthStatus}
              onGetOAuthToken={onGetOAuthToken}
              onAuthTypeChange={(authType) => onUpdate({ authType })}
              onAuthDataChange={(authData) => onUpdate({ authData: { ...request.authData, ...authData } })}
            />
          </ScrollContainer>
        </TabPanel>
      )}

      {/* Schema Tab (F22) */}
      {activeTab === 'schema' && (
        <TabPanel style={{ padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <SchemaTitle>JSON Schema (draft-07, optional)</SchemaTitle>
            <div>
              <FormAddBtn
                onClick={() => onUpdate({ schema: '{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "properties": {\n    "ok": { "type": "boolean" }\n  },\n  "required": ["ok"]\n}' })}
              >
                Insert Example
              </FormAddBtn>
            </div>
          </div>

          <SchemaDesc>
            Validate JSON responses against this schema after each request. The
            result appears in the response&apos;s <Mono>Schema</Mono> tab.
          </SchemaDesc>

          <div style={{ flex: 1, overflow: 'hidden', marginBottom: 16 }}>
            <CodeEditor
              value={request.schema || ''}
              onChange={(schema) => onUpdate({ schema })}
              language={'json'}
              themeKind={themeKind}
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
              dataTestId="schema-editor"
            />
          </div>

          <SchemaToggleRow data-testid="validate-schema-toggle">
            <input
              type="checkbox"
              checked={request.validateSchema === true}
              onChange={(e) => onUpdate({ validateSchema: e.target.checked })}
            />
            <span>Validate JSON responses against this schema</span>
          </SchemaToggleRow>
        </TabPanel>
      )}
    </PaneWrapper>
  );
};

/* ─── Auth Panel ─────────────────────────────────── */

interface AuthPanelProps {
  authType: AuthType;
  authData: RequestState['authData'];
  environment?: Environment | null;
  oauthFetching?: boolean;
  oauthStatus?: { state: 'success' | 'error' | 'none'; text?: string };
  onGetOAuthToken?: (config: OAuth2ConfigPayload) => void;
  onAuthTypeChange: (type: AuthType) => void;
  onAuthDataChange: (data: Partial<RequestState['authData']>) => void;
}

const OAUTH2_GRANT_TYPES: Array<{ value: NonNullable<RequestState['authData']['oauth2GrantType']>; label: string }> = [
  { value: 'authorization_code', label: 'Authorization Code' },
  { value: 'client_credentials', label: 'Client Credentials' },
  { value: 'password', label: 'Password' },
];

type OAuth2GrantType = NonNullable<RequestState['authData']['oauth2GrantType']>;

/* ─── OAuthGrantDropdown ─────────────────────────── */

const OAuthGrantDropdown: React.FC<{ value: OAuth2GrantType; onChange: (v: OAuth2GrantType) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const label = OAUTH2_GRANT_TYPES.find((t) => t.value === value)?.label || 'Authorization Code';

  return (
    <AuthTypeWrap ref={ref} style={{ marginBottom: 4 }}>
      <AuthTypeTriggerBtn type="button" aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <AuthTypeTriggerLabel>{label}</AuthTypeTriggerLabel>
        <AuthTypeChevron $open={open} viewBox="0 0 10 6" width="10" height="6">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </AuthTypeChevron>
      </AuthTypeTriggerBtn>
      {open && (
        <AuthTypeMenu role="listbox">
          {OAUTH2_GRANT_TYPES.map((t) => (
            <AuthTypeOption
              key={t.value}
              role="option"
              aria-selected={t.value === value}
              $selected={t.value === value}
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(t.value);
                setOpen(false);
              }}
            >
              <AuthTypeOptLabel>{t.label}</AuthTypeOptLabel>
            </AuthTypeOption>
          ))}
        </AuthTypeMenu>
      )}
    </AuthTypeWrap>
  );
};

const AuthPanel: React.FC<AuthPanelProps> = ({ authType, authData, environment, oauthFetching, oauthStatus, onGetOAuthToken, onAuthTypeChange, onAuthDataChange }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [showOauthPassword, setShowOauthPassword] = useState(false);

  const buildOAuth2Config = (): OAuth2ConfigPayload => ({
    grantType: authData.oauth2GrantType || 'authorization_code',
    authUrl: authData.oauth2AuthUrl,
    tokenUrl: authData.oauth2TokenUrl || '',
    clientId: authData.oauth2ClientId || '',
    clientSecret: authData.oauth2ClientSecret,
    scopes: authData.oauth2Scopes,
    username: authData.oauth2Username,
    password: authData.oauth2Password,
    redirectUrl: authData.oauth2RedirectUrl,
    usePkce: authData.oauth2UsePkce !== false,
    extraParams: authData.oauth2ExtraParams,
  });

  const oauthReady = !!(authData.oauth2TokenUrl && authData.oauth2ClientId);
  const oauthGrant = authData.oauth2GrantType || 'authorization_code';

  const expiryText = (expiresAt?: number): string | null => {
    if (!expiresAt) return null;
    if (Date.now() > expiresAt) return 'expired';
    const mins = Math.round((expiresAt - Date.now()) / 60000);
    if (mins < 60) return `expires in ${mins}m`;
    return `expires in ${Math.round(mins / 60)}h`;
  };
  return (
    <AuthPanelWrapper>
      <FieldLabel>Auth Type</FieldLabel>
      <AuthTypeDropdown authType={authType} onChange={onAuthTypeChange} />

      {authType === 'bearer' && (
        <AuthFieldsContainer>
          <FieldLabel style={{ marginTop: 8 }}>Token</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.token || ''}
              placeholder="your_token_here or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ token: v })}
              variables={environment?.variables}
            />
          </RelativeWrap>
        </AuthFieldsContainer>
      )}

      {authType === 'basic' && (
        <AuthFieldsContainer>
          <FieldLabel style={{ marginTop: 8 }}>Username</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.username || ''}
              placeholder="username or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ username: v })}
              variables={environment?.variables}
            />
          </RelativeWrap>
          <FieldLabel style={{ marginTop: 8 }}>Password</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.password || ''}
              placeholder="password or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ password: v })}
              variables={environment?.variables}
              type={showPassword ? 'text' : 'password'}
            />
            <PasswordToggleBtn
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              title={showPassword ? 'Hide password' : 'Show password'}
            >
              <Icon icon={showPassword ? faEyeSlash : faEye} size={12} />
            </PasswordToggleBtn>
          </RelativeWrap>
        </AuthFieldsContainer>
      )}

      {authType === 'apikey' && (
        <AuthFieldsContainer>
          <FieldLabel>Key Name</FieldLabel>
          <AuthInput
            value={authData.keyName || ''}
            placeholder="X-API-Key or {{variable_name}}"
            onChange={(v) => onAuthDataChange({ keyName: v })}
            variables={environment?.variables}
          />
          <FieldLabel style={{ marginTop: 8 }}>Key Value</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.keyValue || ''}
              placeholder="api_key_value or {{variable_name}}"
              onChange={(v) => onAuthDataChange({ keyValue: v })}
              variables={environment?.variables}
            />
          </RelativeWrap>
          <FieldLabel style={{ marginTop: 8 }}>Add To</FieldLabel>
          <AddToDropdown value={authData.addTo || 'header'} onChange={(v) => onAuthDataChange({ addTo: v })} />
        </AuthFieldsContainer>
      )}

      {authType === 'inherit' && <InheritAuthFields onAuthDataChange={onAuthDataChange} />}

      {authType === 'digest' && (
        <DigestAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'awssigv4' && (
        <SigV4AuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'jwt' && (
        <JwtAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'hawk' && (
        <HawkAuthFields authData={authData} environment={environment} onAuthDataChange={onAuthDataChange} />
      )}

      {authType === 'oauth2' && (
        <AuthFieldsContainer>
          <OAuthHint>
            Configure the OAuth 2.0 provider and fetch an access token. The token is cached by the
            extension and refreshed automatically when possible.
          </OAuthHint>

          <FieldLabel>Grant Type</FieldLabel>
          <OAuthGrantDropdown value={oauthGrant} onChange={(v) => onAuthDataChange({ oauth2GrantType: v })} />

          {oauthGrant === 'authorization_code' && (
            <>
              <FieldLabel style={{ marginTop: 8 }}>Authorization URL</FieldLabel>
              <AuthInput
                value={authData.oauth2AuthUrl || ''}
                placeholder="https://provider.com/oauth/authorize"
                onChange={(v) => onAuthDataChange({ oauth2AuthUrl: v })}
                variables={environment?.variables}
              />
              <FieldLabel style={{ marginTop: 8 }}>Redirect URL (optional — auto-generated if empty)</FieldLabel>
              <AuthInput
                value={authData.oauth2RedirectUrl || ''}
                placeholder="http://127.0.0.1:<port>/callback"
                onChange={(v) => onAuthDataChange({ oauth2RedirectUrl: v })}
                variables={environment?.variables}
              />
              <FieldLabel style={{ marginTop: 8 }}>Use PKCE</FieldLabel>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={authData.oauth2UsePkce !== false}
                  onChange={(e) => onAuthDataChange({ oauth2UsePkce: e.target.checked })}
                />
                Send code challenge (S256)
              </label>
            </>
          )}

          <FieldLabel style={{ marginTop: 8 }}>Token URL</FieldLabel>
          <AuthInput
            value={authData.oauth2TokenUrl || ''}
            placeholder="https://provider.com/oauth/token"
            onChange={(v) => onAuthDataChange({ oauth2TokenUrl: v })}
            variables={environment?.variables}
          />

          <FieldLabel style={{ marginTop: 8 }}>Client ID</FieldLabel>
          <AuthInput
            value={authData.oauth2ClientId || ''}
            placeholder="client_id"
            onChange={(v) => onAuthDataChange({ oauth2ClientId: v })}
            variables={environment?.variables}
          />

          <FieldLabel style={{ marginTop: 8 }}>Client Secret</FieldLabel>
          <RelativeWrap>
            <AuthInput
              value={authData.oauth2ClientSecret || ''}
              placeholder="client_secret"
              onChange={(v) => onAuthDataChange({ oauth2ClientSecret: v })}
              variables={environment?.variables}
              type={showClientSecret ? 'text' : 'password'}
            />
            <PasswordToggleBtn
              type="button"
              onClick={() => setShowClientSecret((v) => !v)}
              title={showClientSecret ? 'Hide client secret' : 'Show client secret'}
            >
              <Icon icon={showClientSecret ? faEyeSlash : faEye} size={12} />
            </PasswordToggleBtn>
          </RelativeWrap>

          <FieldLabel style={{ marginTop: 8 }}>Scopes (space separated)</FieldLabel>
          <AuthInput
            value={authData.oauth2Scopes || ''}
            placeholder="read write"
            onChange={(v) => onAuthDataChange({ oauth2Scopes: v })}
            variables={environment?.variables}
          />

          {oauthGrant === 'password' && (
            <>
              <FieldLabel style={{ marginTop: 8 }}>Username</FieldLabel>
              <AuthInput
                value={authData.oauth2Username || ''}
                placeholder="username"
                onChange={(v) => onAuthDataChange({ oauth2Username: v })}
                variables={environment?.variables}
              />
              <FieldLabel style={{ marginTop: 8 }}>Password</FieldLabel>
              <RelativeWrap>
                <AuthInput
                  value={authData.oauth2Password || ''}
                  placeholder="password"
                  onChange={(v) => onAuthDataChange({ oauth2Password: v })}
                  variables={environment?.variables}
                  type={showOauthPassword ? 'text' : 'password'}
                />
                <PasswordToggleBtn
                  type="button"
                  onClick={() => setShowOauthPassword((v) => !v)}
                  title={showOauthPassword ? 'Hide password' : 'Show password'}
                >
                  <Icon icon={showOauthPassword ? faEyeSlash : faEye} size={12} />
                </PasswordToggleBtn>
              </RelativeWrap>
            </>
          )}

          <OAuthGetTokenBtn
            type="button"
            data-testid="oauth-get-token-btn"
            disabled={oauthFetching || !oauthReady}
            onClick={() => onGetOAuthToken?.(buildOAuth2Config())}
          >
            {oauthFetching && <OAuthSpin />}
            {oauthFetching
              ? (oauthGrant === 'authorization_code' ? 'Waiting for browser authorization…' : 'Requesting token…')
              : authData.accessToken
                ? 'Refresh Access Token'
                : 'Get New Access Token'}
          </OAuthGetTokenBtn>

          {oauthStatus?.text && (
            <OAuthStatus data-testid="oauth-status" $state={oauthStatus.state === 'success' ? 'success' : oauthStatus.state === 'error' ? 'error' : undefined}>
              {oauthStatus.text}
            </OAuthStatus>
          )}

          {authData.accessToken && (
            <OAuthTokenRow data-testid="oauth-token-row">
              <span>
                ✓ Token ready
                {expiryText(authData.tokenExpiresAt) ? ` (${expiryText(authData.tokenExpiresAt)})` : ''}
              </span>
              <OAuthResetBtn
                type="button"
                data-testid="oauth-clear-token-btn"
                onClick={() =>
                  onAuthDataChange({
                    accessToken: '',
                    refreshToken: '',
                    tokenExpiresAt: undefined,
                    tokenType: undefined,
                    tokenScope: undefined,
                  })
                }
              >
                Clear token
              </OAuthResetBtn>
            </OAuthTokenRow>
          )}
        </AuthFieldsContainer>
      )}
    </AuthPanelWrapper>
  );
};
