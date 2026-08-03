import React, { useState, useRef, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { ResponseState, getStatusClass } from '../types';
import { Icon } from './FaIcon';
import { PdfViewer } from './PdfViewer';
import {
  faPaperPlane, faCopy, faTerminal, faMagnifyingGlass,
  faClipboardList, faXmark, faChevronRight,
  faArrowUp, faList, faLink, faFileCode, faFileLines, faDownload, faCode, faCookieBite,
} from '@fortawesome/free-solid-svg-icons';
import { PrettyBodyViewer } from './PrettyBodyViewer';

const LARGE_RESPONSE_THRESHOLD = 500 * 1024;
const FILE_PREVIEW_RENDER_THRESHOLD = 5 * 1024 * 1024;

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getHeaderValue(headers: Record<string, string | string[]> | undefined, name: string): string {
  if (!headers) return '';
  const hit = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  if (!hit) return '';
  return Array.isArray(hit) ? (hit[0] || '') : hit;
}

function flattenHeaders(headers: Record<string, string | string[]> | undefined): Array<{ key: string; value: string }> {
  if (!headers) return [];
  const rows: Array<{ key: string; value: string }> = [];
  Object.entries(headers).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach((v) => rows.push({ key, value: String(v) }));
      return;
    }
    rows.push({ key, value: String(value) });
  });
  return rows;
}

interface ResponseCookie {
  name: string;
  value: string;
  attributes: Array<{ key: string; value: string }>;
}

function parseResponseCookies(
  headers: Record<string, string | string[]> | undefined,
): ResponseCookie[] {
  if (!headers) return [];
  const entry = Object.entries(headers).find(
    ([k]) => k.toLowerCase() === 'set-cookie',
  );
  const setCookie = entry?.[1];
  const rawList = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  return rawList.map((raw) => {
    const [first, ...rest] = raw.split(';');
    const eq = first.indexOf('=');
    const name = eq === -1 ? first.trim() : first.slice(0, eq).trim();
    const value = eq === -1 ? '' : first.slice(eq + 1).trim();
    const attributes: Array<{ key: string; value: string }> = [];
    rest.forEach((part) => {
      const p = part.trim();
      if (!p) return;
      const e = p.indexOf('=');
      if (e === -1) attributes.push({ key: p, value: 'true' });
      else attributes.push({ key: p.slice(0, e).trim(), value: p.slice(e + 1).trim() });
    });
    return { name, value, attributes };
  });
}

function decodeBase64ToText(base64: string): string {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function parseCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (ch === '"') {
      if (inQuotes && input[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && input[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }

    cell += ch;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function isLikelyJson(body: string | undefined | null, headers?: Record<string, string | string[]>): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/json') || ct.includes('+json')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isLikelyXml(body: string | undefined | null, headers?: Record<string, string | string[]>): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('application/xml') || ct.includes('text/xml') || ct.includes('+xml')) return true;
  const trimmed = body.trimStart();
  return trimmed.startsWith('<') && !trimmed.startsWith('<!DOCTYPE html');
}

function isLikelyHtml(body: string | undefined | null, headers?: Record<string, string | string[]>): boolean {
  if (!body) return false;
  const contentType = getHeaderValue(headers, 'content-type');
  const ct = String(contentType).toLowerCase();
  if (ct.includes('text/html') || ct.includes('application/xhtml+xml')) return true;
  const trimmed = body.trimStart().toLowerCase();
  return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

interface ResponsePaneProps {
  response: ResponseState | null;
  loading: boolean;
  request?: any;
  onDownloadFile?: (payload: { fileName: string; mimeType: string; fileBase64: string }) => void;
  post?: (msg: any) => void;
}

type ResTab = 'body' | 'headers' | 'cookies' | 'logs' | 'raw';

/* ─── Styled Components ──────────────────────────────────── */

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const ResponsePaneWrapper = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

const ResponseEmpty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.muted};
  gap: 10px;
`;

const EmptyIcon = styled.div`
  font-size: 40px;
  opacity: 0.3;
`;

const Spinner = styled.div<{ $size?: number }>`
  width: ${({ $size }) => $size ? `${$size}px` : '32px'};
  height: ${({ $size }) => $size ? `${$size}px` : '32px'};
  border: ${({ $size }) => $size ? '2px' : '3px'} solid color-mix(in srgb, ${({ theme }) => theme.accent} 20%, transparent);
  border-top-color: ${({ theme }) => theme.accent};
  border-radius: 50%;
  animation: ${spin} .7s linear infinite;
`;

const HintText = styled.div`
  font-size: 11px;
  opacity: 0.5;
  margin-top: 8px;
  line-height: 1.8;
`;

const HintLine = styled.span`
  display: block;
`;

const LoadingText = styled.div`
  font-size: 12px;
`;

const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

const StatusCode = styled.span<{ $statusClass: string }>`
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;

  ${({ $statusClass, theme }) => {
    if ($statusClass === 'status-2xx') return `
      color: ${theme.success};
      background: color-mix(in srgb, ${theme.success} 15%, transparent);
    `;
    if ($statusClass === 'status-3xx') return `
      color: ${theme.warning};
      background: color-mix(in srgb, ${theme.warning} 15%, transparent);
    `;
    if ($statusClass === 'status-4xx' || $statusClass === 'status-5xx') return `
      color: ${theme.error};
      background: color-mix(in srgb, ${theme.error} 15%, transparent);
    `;
    return '';
  }}
`;

const StatusText = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
`;

const MetaChip = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
  padding: 3px 10px;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  white-space: nowrap;
`;

const ResponseActions = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

const CopyBtn = styled.button<{ $active?: boolean }>`
  background: ${({ $active, theme }) => $active
    ? `color-mix(in srgb, ${theme.accent} 15%, transparent)`
    : theme.surface2};
  border: 1px solid ${({ $active, theme }) => $active ? theme.accent : theme.border};
  color: ${({ $active, theme }) => $active ? theme.accent : theme.muted};
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
  white-space: nowrap;

  &:hover {
    color: ${({ $active, theme }) => $active ? theme.accent : theme.fg};
    background: ${({ $active, theme }) => $active
      ? `color-mix(in srgb, ${theme.accent} 15%, transparent)`
      : theme.hover};
  }
`;

const TabBar = styled.div`
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0 14px;
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
  gap: 2px;
`;

const TabItem = styled.div<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  color: ${({ $active, theme }) => $active ? theme.accent : theme.muted};
  border-bottom: 2px solid ${({ $active, theme }) => $active ? theme.accent : 'transparent'};
  user-select: none;
  white-space: nowrap;
  transition: all .15s;
  background: ${({ $active, theme }) => $active
    ? `color-mix(in srgb, ${theme.accent} 8%, transparent)`
    : 'transparent'};

  &:hover {
    color: ${({ $active, theme }) => $active ? theme.accent : theme.fg};
  }
`;

const TabBadge = styled.span`
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

const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
`;

const ResponseBody = styled.pre`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.inputFg};
  padding: 12px 14px;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.7;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
`;

const RequestLogContainer = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.fg};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const LogSection = styled.div`
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 60%, transparent);

  &:last-child {
    border-bottom: none;
  }
`;

const LogTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.accent};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

/* ─── Search Bar ──────────────────────────────────────── */

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.fg};
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
`;

const SearchCount = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

const SearchCloseBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
`;

/* ─── Large Response Warning ──────────────────────────── */

const LargeResponseWarning = styled.div`
  padding: 6px 12px;
  background: color-mix(in srgb, ${({ theme }) => theme.warning} 15%, transparent);
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.warning} 30%, transparent);
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

const ShowRawBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 11px;
  color: ${({ theme }) => theme.fg};
  flex-shrink: 0;
`;

/* ─── Body Content Wrapper ────────────────────────────── */

const BodyContentWrapper = styled.div`
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
`;

const ContentPadding = styled.div`
  padding: 8px;
`;

/* ─── Headers Table ───────────────────────────────────── */

const HeadersTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

const HeadersRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

const HeaderCell = styled.th`
  text-align: left;
  padding: 7px 12px;
  color: ${({ theme }) => theme.muted};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .5px;
`;

const DataRowsTr = styled.tr`
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
`;

const KeyCell = styled.td`
  padding: 6px 12px;
  font-family: monospace;
  color: ${({ theme }) => theme.accent2};
`;

const ValueCell = styled.td`
  padding: 6px 12px;
  font-family: monospace;
  word-break: break-all;
`;

const AttrChip = styled.span`
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-family: monospace;
  color: ${({ theme }) => theme.muted};
  background: color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
`;

const EmptyHint = styled.div`
  padding: 24px 16px;
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
  text-align: center;
`;

/* ─── Tab Content ─────────────────────────────────────── */

const TabContent = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  flex-direction: column;
`;

/* ─── Log Components ──────────────────────────────────── */

const CollapsibleContainer = styled(LogSection)`
  padding: 0;
  overflow: hidden;
`;

const CollapsibleHeader = styled.div<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 7px 10px;
  border-bottom: ${({ $open, theme }) => $open ? `1px solid ${theme.border}` : 'none'};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 40%, transparent);
`;

const ChevronIcon = styled.span<{ $open: boolean }>`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  transition: transform .15s;
  display: inline-block;
  transform: ${({ $open }) => $open ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

const CollapsibleTitle = styled(LogTitle)`
  margin: 0;
  flex: 1;
`;

const CollapsibleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: ${({ theme }) => theme.border};
  border-radius: 9px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  color: ${({ theme }) => theme.muted};
  line-height: 1;
  font-weight: 700;
`;

const CollapsibleContent = styled.div`
  padding: 8px 10px;
`;

/* ─── Log Entry ───────────────────────────────────────── */

interface LogEntryProps {
  label: string;
  value: string;
  monospace?: boolean;
  small?: boolean;
  highlight?: boolean;
  indent?: boolean;
}

const LogEntryWrapper = styled.div<{ $small: boolean; $indent: boolean; $highlight: boolean }>`
  display: flex;
  gap: 12px;
  padding: ${({ $small }) => $small ? '4px 0' : '8px 0'};
  border-bottom: ${({ $small, theme }) => $small ? 'none' : `1px solid color-mix(in srgb, ${theme.border} 40%, transparent)`};
  font-size: ${({ $small }) => $small ? 11 : 12}px;
  margin-left: ${({ $indent }) => $indent ? '20px' : '0'};
  color: ${({ $highlight, theme }) => $highlight ? theme.error : theme.fg};
`;

const LogLabel = styled.span`
  min-width: 180px;
  color: ${({ theme }) => theme.muted};
  font-weight: 500;
`;

const LogValue = styled.span<{ $monospace: boolean; $highlight: boolean }>`
  flex: 1;
  font-family: ${({ $monospace, theme }) => $monospace ? theme.monoFamily : 'inherit'};
  word-break: break-all;
  color: ${({ $highlight, theme }) => $highlight ? theme.error : theme.inputFg};
`;

const LogEntry: React.FC<LogEntryProps> = ({
  label, value, monospace = false, small = false, highlight = false, indent = false,
}) => (
  <LogEntryWrapper $small={small} $indent={indent} $highlight={highlight}>
    <LogLabel>{label}:</LogLabel>
    <LogValue $monospace={monospace} $highlight={highlight}>{value}</LogValue>
  </LogEntryWrapper>
);

/* ─── Code Block (reused in logs) ─────────────────────── */

const MonoBlock = styled.div`
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 11px;
  padding: 6px 12px;
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 50%, transparent);
  white-space: pre-wrap;
  word-break: break-all;
`;

const MonoPre = styled.pre`
  font-size: 11px;
  color: ${({ theme }) => theme.inputFg};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 50%, transparent);
  padding: 8px 10px;
  border-radius: 4px;
  overflow: auto;
  max-height: 150px;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.border};
`;

/* ─── CollapsibleSection ──────────────────────────────── */

interface CollapsibleSectionProps {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
  accentColor?: string;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, defaultOpen = true, children, badge, accentColor }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <CollapsibleContainer data-testid="log-section">
      <CollapsibleHeader $open={open} onClick={() => setOpen((v) => !v)}>
        <ChevronIcon $open={open}><Icon icon={faChevronRight} size={9} /></ChevronIcon>
        <CollapsibleTitle data-testid="log-title" style={{ color: accentColor }}>{title}</CollapsibleTitle>
        {badge !== undefined && (
          <CollapsibleBadge>{badge}</CollapsibleBadge>
        )}
      </CollapsibleHeader>
      {open && <CollapsibleContent>{children}</CollapsibleContent>}
    </CollapsibleContainer>
  );
};

/* ─── Script Result Log ──────────────────────────────── */

interface ScriptResultLogProps {
  request?: any;
}

const ScriptResultLog: React.FC<ScriptResultLogProps> = ({ request }) => {
  const [logsOpen, setLogsOpen] = useState(true);
  const [varsOpen, setVarsOpen] = useState(true);

  if (request?.scriptRunning) {
    return (
      <ScriptRunningBox>
        <Spinner $size={14} />
        Running post-response script…
      </ScriptRunningBox>
    );
  }

  if (!request || request.scriptLogs === undefined) return null;

  const success: boolean = request.scriptSuccess !== false;
  const logs: string[] = request.scriptLogs || [];
  const error: string | undefined = request.scriptError;
  const variables: Record<string, any> = request.scriptVariables || {};
  const hasVars = Object.keys(variables).length > 0;

  const subHeader = (label: string, count: number, open: boolean, toggle: () => void): React.ReactNode => (
    <SubHeaderRow onClick={toggle}>
      <SubHeaderChevron $open={open}>▶</SubHeaderChevron>
      <SubHeaderLabel>{label}</SubHeaderLabel>
      <SubHeaderCount>{count}</SubHeaderCount>
    </SubHeaderRow>
  );

  return (
    <ScriptSection $success={success}>
      <ScriptHeader $success={success}>
        <span>Post-response Script</span>
        <ScriptBadge $success={success}>{success ? 'Executed' : 'Error'}</ScriptBadge>
      </ScriptHeader>

      {error && (
        <ScriptErrorBlock>
          ✗ {error}
        </ScriptErrorBlock>
      )}

      {logs.length > 0 && (
        <>
          {subHeader('Logs', logs.length, logsOpen, () => setLogsOpen((v) => !v))}
          {logsOpen && logs.map((ln, i) => (
            <MonoBlock key={i}>{ln}</MonoBlock>
          ))}
        </>
      )}

      {logs.length === 0 && !error && (
        <ScriptNoLogsBlock>
          Script ran with no logs. Use log() to output values.
        </ScriptNoLogsBlock>
      )}

      {hasVars && (
        <>
          {subHeader('Variables Extracted', Object.keys(variables).length, varsOpen, () => setVarsOpen((v) => !v))}
          {varsOpen && Object.entries(variables).map(([k, v]) => (
            <VarRow key={k}>
              <VarKey>{k}</VarKey>
              <span>{typeof v === 'string' ? v : JSON.stringify(v)}</span>
            </VarRow>
          ))}
        </>
      )}
    </ScriptSection>
  );
};

const ScriptRunningBox = styled.div`
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
  display: flex;
  align-items: center;
  gap: 8px;
`;

const ScriptSection = styled.div<{ $success: boolean }>`
  margin-top: 16px;
  border: 1px solid ${({ $success, theme }) => $success
    ? `color-mix(in srgb, ${theme.accent} 35%, transparent)`
    : `color-mix(in srgb, ${theme.error} 35%, transparent)`};
  border-radius: 6px;
  overflow: hidden;
`;

const ScriptHeader = styled.div<{ $success: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: ${({ $success, theme }) => $success
    ? `color-mix(in srgb, ${theme.accent} 12%, transparent)`
    : `color-mix(in srgb, ${theme.error} 12%, transparent)`};
  font-size: 12px;
  font-weight: 600;
`;

const ScriptBadge = styled.span<{ $success: boolean }>`
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ $success, theme }) => $success ? theme.accent : theme.error};
  color: ${({ $success, theme }) => $success ? theme.accentFg : '#fff'};
`;

const ScriptErrorBlock = styled(MonoBlock)`
  color: ${({ theme }) => theme.error};
  border-top: 1px solid ${({ theme }) => theme.border};
  padding: 8px 12px;
`;

const ScriptNoLogsBlock = styled(MonoBlock)`
  color: ${({ theme }) => theme.muted};
  border-top: 1px solid ${({ theme }) => theme.border};
  padding: 8px 12px;
`;

const SubHeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  user-select: none;
  border-top: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 30%, transparent);
`;

const SubHeaderChevron = styled.span<{ $open: boolean }>`
  font-size: 9px;
  color: ${({ theme }) => theme.muted};
  display: inline-block;
  transform: ${({ $open }) => $open ? 'rotate(90deg)' : 'rotate(0deg)'};
  transition: transform .15s;
`;

const SubHeaderLabel = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  text-transform: uppercase;
  letter-spacing: .5px;
  flex: 1;
`;

const SubHeaderCount = styled.span`
  font-size: 10px;
  background: ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 1px 5px;
  color: ${({ theme }) => theme.muted};
`;

const VarRow = styled(MonoBlock)`
  display: flex;
  gap: 12px;
`;

const VarKey = styled.span`
  color: ${({ theme }) => theme.accent2};
  min-width: 140px;
`;

/* ─── Request Log ─────────────────────────────────────── */

interface RequestLogProps {
  response: ResponseState | null;
  request?: any;
}

const RequestLog: React.FC<RequestLogProps> = ({ response, request }) => {
  if (!response) {
    return <NoDataText>No request data available</NoDataText>;
  }

  const hasMtls = request?.mtlsUsed || false;
  const mtlsHostname = request?.mtlsHostname || null;

  const enabledRequestHeaders = (request?.headers || []).filter((h: any) => h.enabled !== false);
  const enabledQueryParams = (request?.queryParams || []).filter((p: any) => p.enabled !== false);

  return (
    <RequestLogContainer>

      <CollapsibleSection title={<><Icon icon={faArrowUp} size={11} style={{ marginRight: 5 }} />Request</>} defaultOpen={true}>
        <LogEntry label="Method" value={request?.method || 'N/A'} />
        <LogEntry label="URL" value={request?.url || 'N/A'} monospace />
        <LogEntry label="Protocol" value={request?.url?.startsWith('https') ? 'HTTPS' : 'HTTP'} />
        <LogEntry label="SSL Verification" value={request?.rejectUnauthorized === false ? '✗ Disabled (Insecure)' : '✓ Enabled'} highlight={request?.rejectUnauthorized === false} />
        <LogEntry label="mTLS (Client Certificate)" value={hasMtls ? '✓ Enabled' : '✗ Not Used'} highlight={hasMtls} />
        {hasMtls && mtlsHostname && <LogEntry label="  Certificate Hostname" value={mtlsHostname} monospace indent />}
        <LogEntry label="Proxy" value={request?.proxyUsed ? '✓ Enabled' : '✗ Not Used'} highlight={false} />
        {request?.proxyUsed && request?.proxyUrl ? (
          <>
            <LogEntry label="  Proxy URL" value={request.proxyUrl} monospace indent />
            {request?.hasProxyAuth && <LogEntry label="  Proxy Authentication" value="✓ Configured (Basic Auth)" indent />}
          </>
        ) : !request?.proxyUsed && request?.proxyUrl ? (
          <LogEntry label="  Note" value="Proxy configured but not used (hostname may be in no-proxy list)" indent highlight={true} />
        ) : null}
      </CollapsibleSection>

      {enabledRequestHeaders.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faList} size={11} style={{ marginRight: 5 }} />Request Headers</>} defaultOpen={false} badge={enabledRequestHeaders.length}>
          {enabledRequestHeaders.map((h: any, idx: number) => (
            <LogEntry key={idx} label={h.key} value={h.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {enabledQueryParams.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faLink} size={11} style={{ marginRight: 5 }} />Query Parameters</>} defaultOpen={false} badge={enabledQueryParams.length}>
          {enabledQueryParams.map((p: any, idx: number) => (
            <LogEntry key={idx} label={p.key} value={p.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {request?.body && (
        <CollapsibleSection title={<><Icon icon={faFileCode} size={11} style={{ marginRight: 5 }} />Request Body</>} defaultOpen={false}>
          <MonoPre>{request.body}</MonoPre>
        </CollapsibleSection>
      )}

      {request?.networkLogs && request.networkLogs.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faTerminal} size={11} style={{ marginRight: 5 }} />Network Logs</>} defaultOpen={true} badge={request.networkLogs.length}>
          {request.networkLogs.map((ln: string, idx: number) => (
            <LogLine key={idx}>{ln}</LogLine>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection title={<><Icon icon={faDownload} size={11} style={{ marginRight: 5 }} />Response</>} defaultOpen={true}>
        <LogEntry label="Status Code" value={`${response.status} ${response.statusText}`} highlight={response.status >= 400} />
        <LogEntry label="Duration" value={`${response.duration}ms`} />
        <LogEntry label="Response Size" value={formatSize(response.size)} />
        <LogTimestamp>{new Date().toLocaleString()}</LogTimestamp>
      </CollapsibleSection>

      <CollapsibleSection title={<><Icon icon={faList} size={11} style={{ marginRight: 5 }} />Response Headers</>} defaultOpen={false} badge={Object.keys(response.headers).length}>
        {Object.entries(response.headers).map(([key, val]) => (
          <LogEntry key={key} label={key} value={String(val)} monospace small />
        ))}
      </CollapsibleSection>

      {request?.scriptLogs && request.scriptLogs.length > 0 && (
        <CollapsibleSection title={<><Icon icon={faCode} size={11} style={{ marginRight: 5 }} />Script Logs</>} defaultOpen={true} badge={request.scriptLogs.length}>
          {request.scriptLogs.map((ln: string, idx: number) => (
            <LogLine key={idx}>{ln}</LogLine>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection title={<><Icon icon={faTerminal} size={11} style={{ marginRight: 5 }} />cURL Command</>} defaultOpen={false}>
        <CurlCommandGenerator request={request} response={response} />
      </CollapsibleSection>

    </RequestLogContainer>
  );
};

const NoDataText = styled.div`
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
`;

const LogLine = styled.div`
  font-family: ${({ theme }) => theme.monoFamily};
  padding: 3px 0;
  font-size: 11px;
  color: ${({ theme }) => theme.inputFg};
  word-break: break-word;
`;

const LogTimestamp = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  padding-top: 6px;
`;

/* ─── Curl Command Generator ─────────────────────────── */

interface CurlCommandGeneratorProps {
  request?: any;
  response: ResponseState | null;
}

const CurlCopyBtn = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
`;

const CurlCommandGenerator: React.FC<CurlCommandGeneratorProps> = ({ request }) => {
  if (!request) {
    return <NoDataText>No request data available</NoDataText>;
  }

  const curlCmd = request.curlCommand || buildCurlCommand(request);

  const handleCopyCurl = () => {
    navigator.clipboard.writeText(curlCmd);
  };

  return (
    <div>
      <MonoPre style={{ margin: '0 0 8px 0', wordBreak: 'break-all', whiteSpace: 'pre-wrap', fontSize: 10 }}>
        {curlCmd}
      </MonoPre>
      <CurlCopyBtn onClick={handleCopyCurl}>
        <Icon icon={faCopy} size={11} style={{ marginRight: 4 }} /> Copy cURL Command
      </CurlCopyBtn>
    </div>
  );
};

function buildCurlCommand(request: any): string {
  let curlCmd = `curl `;

  if (request.rejectUnauthorized === false) {
    curlCmd += `-k `;
  }

  curlCmd += `-X ${request.method || 'GET'} `;

  if (request.proxyUsed && request.proxyUrl) {
    curlCmd += `-x "${request.proxyUrl}" `;
    if (request.hasProxyAuth) {
      curlCmd += `-U "username:password" `;
    }
  }

  const enabledHeaders = (request.headers || []).filter((h: any) => h.enabled !== false);
  enabledHeaders.forEach((h: any) => {
    if (h.key && h.value) {
      curlCmd += `-H "${h.key}: ${h.value}" `;
    }
  });

  if (request.body) {
    const escapedBody = request.body.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    curlCmd += `-d "${escapedBody}" `;
  }

  let fullUrl = request.url || '';
  const enabledParams = (request.queryParams || []).filter((p: any) => p.enabled !== false);
  if (enabledParams.length > 0) {
    const queryString = enabledParams
      .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value)}`)
      .join('&');
    fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
  }

  curlCmd += `"${fullUrl}" -v`;
  return curlCmd;
}

/* ─── Searchable Body ────────────────────────────────── */

const SearchablePre = styled.pre`
  margin: 0;
  padding: 12px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  white-space: pre-wrap;
  word-break: break-all;
  color: ${({ theme }) => theme.fg};
`;

const SearchMatch = styled.mark`
  background: color-mix(in srgb, ${({ theme }) => theme.accent} 50%, transparent);
  color: ${({ theme }) => theme.fg};
  border-radius: 2px;
`;

const SearchableBody: React.FC<{ text: string; search: string }> = ({ text, search }) => {
  const parts = React.useMemo(() => {
    if (!search) return [{ text, match: false }];
    try {
      return text.split(new RegExp(`(${escapeRegex(search)})`, 'gi')).map((part, i) => ({ text: part, match: i % 2 === 1 }));
    } catch { return [{ text, match: false }]; }
  }, [text, search]);
  return (
    <SearchablePre>
      {parts.map((p, i) => p.match
        ? <SearchMatch key={i}>{p.text}</SearchMatch>
        : <React.Fragment key={i}>{p.text}</React.Fragment>)}
    </SearchablePre>
  );
};

/* ─── File Preview ───────────────────────────────────── */

const FilePreviewInfo = styled.div`
  padding: 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
`;

const CsvPreviewContainer = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
`;

const CsvPreviewLabel = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

const CsvTableWrapper = styled.div`
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
`;

const CsvTable = styled.table`
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

const CsvHeaderRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 65%, transparent);
`;

const CsvHeaderCell = styled.th`
  text-align: left;
  padding: 7px 10px;
  white-space: nowrap;
`;

const CsvDataRow = styled.tr`
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 35%, transparent);
`;

const CsvDataCell = styled.td`
  padding: 6px 10px;
  white-space: nowrap;
`;

const FilePreview: React.FC<{ response: ResponseState; search: string; post?: (msg: any) => void }> = ({ response, search, post }) => {
  const previewType = response.filePreviewType || 'none';
  const fileName = response.fileName || 'response.bin';

  const decodedText = React.useMemo(() => {
    if (!response.fileBase64) return '';
    if (previewType !== 'text' && previewType !== 'csv') return '';
    return decodeBase64ToText(response.fileBase64);
  }, [response.fileBase64, previewType]);

  const [excelData, setExcelData] = React.useState<{ error: string; rows: string[][]; sheetName: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let workbook: any = null;
    if (previewType !== 'excel' || !response.fileBase64) {
      setExcelData(null);
      return undefined;
    }

    (async () => {
      try {
        const binary = Uint8Array.from(atob(response.fileBase64!), (c) => c.charCodeAt(0));
        const mod = await import('exceljs');
        const ExcelJSLib = (mod && (mod as any).default) ? (mod as any).default : mod;
        workbook = new ExcelJSLib.Workbook();
        await workbook.xlsx.load(binary.buffer as any);
        const ws = workbook.worksheets[0];
        if (!ws) {
          if (!cancelled) setExcelData({ error: 'No worksheet found in file', rows: [], sheetName: '' });
          return;
        }
        const rows: string[][] = [];
        ws.eachRow((row: any) => {
          const vals = (row.values as any[]).slice(1).map((v) => (v == null ? '' : String(v)));
          rows.push(vals);
        });
        if (!cancelled) setExcelData({ error: '', rows, sheetName: ws.name || '' });
      } catch {
        if (!cancelled) setExcelData({ error: 'Unable to parse Excel file for preview', rows: [], sheetName: '' });
      } finally {
        try { workbook = null; } catch { /* ignore */ }
      }
    })();

    return () => {
      cancelled = true;
      try { setExcelData(null); } catch { /* ignore */ }
      try { workbook = null; } catch { /* ignore */ }
    };
  }, [previewType, response.fileBase64]);

  if (response.size > FILE_PREVIEW_RENDER_THRESHOLD) {
    return (
      <FilePreviewInfo>
        Preview skipped for large file ({formatSize(response.size)}). Preview limit is 5 MB. Use Download to save {fileName}.
      </FilePreviewInfo>
    );
  }

  if (previewType === 'pdf' && response.fileBase64) {
    return <PdfViewer fileBase64={response.fileBase64} fileName={fileName} post={post} />;
  }

  if ((previewType === 'text' || previewType === 'csv') && decodedText) {
    if (previewType === 'csv') {
      const rows = parseCsvRows(decodedText);
      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);
        const filteredRows = search
          ? dataRows.filter((r) => r.join(' ').toLowerCase().includes(search.toLowerCase()))
          : dataRows;
        const cappedRows = filteredRows.slice(0, 300);
        return (
          <CsvPreviewContainer>
            <CsvPreviewLabel>
              CSV Preview: {filteredRows.length} rows {filteredRows.length > cappedRows.length ? `(showing first ${cappedRows.length})` : ''} {search && `(filtered)`}
            </CsvPreviewLabel>
            <CsvTableWrapper>
              <CsvTable role="grid" aria-label="CSV data (read-only)">
                <thead>
                  <CsvHeaderRow>
                    {headers.map((h, idx) => (
                      <CsvHeaderCell key={`${h}-${idx}`}>
                        {h || `Column ${idx + 1}`}
                      </CsvHeaderCell>
                    ))}
                  </CsvHeaderRow>
                </thead>
                <tbody>
                  {cappedRows.map((r, rIdx) => (
                    <CsvDataRow key={rIdx}>
                      {headers.map((_, cIdx) => (
                        <CsvDataCell key={`${rIdx}-${cIdx}`}>
                          {r[cIdx] || ''}
                        </CsvDataCell>
                      ))}
                    </CsvDataRow>
                  ))}
                </tbody>
              </CsvTable>
            </CsvTableWrapper>
          </CsvPreviewContainer>
        );
      }
    }

    if (search) return <SearchableBody text={decodedText} search={search} />;
    return (
      <SearchablePre role="document" aria-label="File preview (read-only)">
        {decodedText}
      </SearchablePre>
    );
  }

  if (previewType === 'excel') {
    if (!excelData) {
      return (
        <FilePreviewInfo>
          Excel file is empty. Use Download to open {fileName}.
        </FilePreviewInfo>
      );
    }

    if (excelData.error) {
      return (
        <FilePreviewInfo>
          {excelData.error}. Use Download to open {fileName} in your spreadsheet app.
        </FilePreviewInfo>
      );
    }

    if (!excelData.rows.length) {
      return (
        <FilePreviewInfo>
          Excel file is empty. Use Download to open {fileName}.
        </FilePreviewInfo>
      );
    }

    const headers = excelData.rows[0] || [];
    const dataRows = excelData.rows.slice(1);
    const filteredRows = search
      ? dataRows.filter((r) => r.join(' ').toLowerCase().includes(search.toLowerCase()))
      : dataRows;
    const cappedRows = filteredRows.slice(0, 300);

    return (
      <CsvPreviewContainer>
        <CsvPreviewLabel>
          Excel Preview ({excelData.sheetName}): {filteredRows.length} rows {filteredRows.length > cappedRows.length ? `(showing first ${cappedRows.length})` : ''} {search && `(filtered)`}
        </CsvPreviewLabel>
        <CsvTableWrapper>
          <CsvTable role="grid" aria-label="Excel data (read-only)">
            <thead>
              <CsvHeaderRow>
                {headers.map((h, idx) => (
                  <CsvHeaderCell key={`${h}-${idx}`}>
                    {h || `Column ${idx + 1}`}
                  </CsvHeaderCell>
                ))}
              </CsvHeaderRow>
            </thead>
            <tbody>
              {cappedRows.map((r, rIdx) => (
                <CsvDataRow key={rIdx}>
                  {headers.map((_, cIdx) => (
                    <CsvDataCell key={`${rIdx}-${cIdx}`}>
                      {r[cIdx] || ''}
                    </CsvDataCell>
                  ))}
                </CsvDataRow>
              ))}
            </tbody>
          </CsvTable>
        </CsvTableWrapper>
      </CsvPreviewContainer>
    );
  }

  return (
    <FilePreviewInfo>
      Binary file response detected ({fileName}). Use Download to save and open it locally.
    </FilePreviewInfo>
  );
};

/* ─── Main Component ──────────────────────────────────── */

export const ResponsePane: React.FC<ResponsePaneProps> = ({ response, loading, request, onDownloadFile, post }) => {
  const [activeTab, setActiveTab] = useState<ResTab>('body');
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [bodySearch, setBodySearch] = useState('');
  const [showRawForLarge, setShowRawForLarge] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const send = post;

  useEffect(() => { if (showSearch) searchRef.current?.focus(); }, [showSearch]);
  useEffect(() => { setShowSearch(false); setBodySearch(''); }, [response]);

  const decodedFileText = React.useMemo(() => {
    if (!response?.isFileResponse || !response.fileBase64) return '';
    if (response.filePreviewType !== 'text' && response.filePreviewType !== 'csv') return '';
    return decodeBase64ToText(response.fileBase64);
  }, [response]);

  const hideSearchButton = !!response?.isFileResponse && (response.filePreviewType === 'pdf') && !!response.fileBase64;
  useEffect(() => {
    if (hideSearchButton) {
      setShowSearch(false);
      setBodySearch('');
    }
  }, [hideSearchButton]);

  const hideBodyTab = !!response?.isFileResponse && (response.filePreviewType === 'pdf' || response.filePreviewType === 'excel') && !!response.fileBase64;
  useEffect(() => {
    if (hideBodyTab && activeTab === 'body') {
      setActiveTab('headers');
    }
  }, [hideBodyTab]);

  const isLargeFilePreviewBlocked = !!response?.isFileResponse && response.size > FILE_PREVIEW_RENDER_THRESHOLD;
  const isPdfPreview = !!response?.isFileResponse && response.filePreviewType === 'pdf' && !!response.fileBase64;
  const searchableText = isPdfPreview ? '' : (response?.body || decodedFileText || '');

  const headerRows = React.useMemo(
    () => flattenHeaders(response?.headers),
    [response?.headers],
  );

  const cookieRows = React.useMemo(
    () => parseResponseCookies(response?.headers),
    [response?.headers],
  );

  const handleCopy = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleCopyCurlStatus = () => {
    const curlCmd = request?.curlCommand || (request ? buildCurlCommand(request) : '');
    if (curlCmd) {
      navigator.clipboard.writeText(curlCmd);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    }
  };

  const handleDownloadFile = () => {
    if (!response?.fileBase64) return;
    const mimeType = response.fileMimeType || 'application/octet-stream';
    const fileName = response.fileName || 'response.bin';

    try {
      if (onDownloadFile) {
        onDownloadFile({
          fileName,
          mimeType,
          fileBase64: response.fileBase64,
        });
      } else {
        const selectedName = window.prompt('Save file as', fileName);
        if (!selectedName) return;
        const bytes = Uint8Array.from(atob(response.fileBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = selectedName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 1500);
    } catch {
      // Ignore download failures silently.
    }
  };

  /* loading state */
  if (loading) {
    return (
      <ResponsePaneWrapper id="res-pane">
        <ResponseEmpty>
          <Spinner />
          <LoadingText>Sending request…</LoadingText>
        </ResponseEmpty>
      </ResponsePaneWrapper>
    );
  }

  /* empty state */
  if (!response) {
    return (
      <ResponsePaneWrapper id="res-pane">
        <ResponseEmpty>
          <EmptyIcon><Icon icon={faPaperPlane} size={28} style={{ opacity: 0.5 }} /></EmptyIcon>
          <div>Send a request to see the response</div>
          <HintText>
            <HintLine>⏎ Enter — send request</HintLine>
            <HintLine>Ctrl+S — save request</HintLine>
            <HintLine>Ctrl+Enter — send request</HintLine>
          </HintText>
        </ResponseEmpty>
      </ResponsePaneWrapper>
    );
  }

  const statusClass = getStatusClass(response.status);

  return (
    <ResponsePaneWrapper id="res-pane">
      {/* Status bar */}
      <StatusBar data-testid="response-status-bar">
        <StatusCode data-testid="status-code" $statusClass={statusClass}>
          {response.status || 'ERR'}
        </StatusCode>
        <StatusText>{response.statusText}</StatusText>
        <MetaChip>{response.duration} ms</MetaChip>
        <MetaChip>{formatSize(response.size)}</MetaChip>
        {response.isFileResponse && response.fileDetectionSource === 'filename' && (
          <MetaChip title="File type inferred from filename when response headers were generic">
            Detected from filename
          </MetaChip>
        )}
        <ResponseActions>
          {request && (
            <CopyBtn onClick={handleCopyCurlStatus} title="Copy as cURL command">
              <Icon icon={faTerminal} size={12} style={{ marginRight: 4 }} />
              {copiedCurl ? 'cURL ✓' : 'cURL'}
            </CopyBtn>
          )}
          {response.body && !isLargeFilePreviewBlocked && (
            <CopyBtn onClick={handleCopy}>
              <Icon icon={faCopy} size={12} style={{ marginRight: 4 }} />
              {copied ? 'Copied ✓' : 'Copy'}
            </CopyBtn>
          )}
          {!isLargeFilePreviewBlocked && !hideSearchButton && (response.body || decodedFileText || response.isFileResponse) && (
            <CopyBtn title="Search in preview" onClick={() => setShowSearch(s => !s)}>
              <Icon icon={faMagnifyingGlass} size={12} />
            </CopyBtn>
          )}
          {response.isFileResponse && response.fileBase64 && (
            <CopyBtn $active={downloaded} onClick={handleDownloadFile} title={response.fileName || 'Download file'}>
              <Icon icon={faDownload} size={12} style={{ marginRight: 4 }} />
              {downloaded ? 'Downloaded ✓' : 'Download'}
            </CopyBtn>
          )}
        </ResponseActions>
      </StatusBar>

      {/* Tab bar */}
      <TabBar id="res-tabs">
        {(['body', 'headers', 'cookies', 'logs', 'raw'] as ResTab[]).map((tab) => (
          <TabItem
            key={tab}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            data-testid={`res-tab-${tab}`}
          >
            <Icon
              icon={
                tab === 'body' ? faFileLines
                : tab === 'headers' ? faLink
                : tab === 'cookies' ? faCookieBite
                : tab === 'logs' ? faClipboardList
                : faFileCode
              }
              size={12}
            />
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && (
              <TabBadge>{headerRows.length}</TabBadge>
            )}
            {tab === 'cookies' && cookieRows.length > 0 && (
              <TabBadge>{cookieRows.length}</TabBadge>
            )}
            {tab === 'logs' && ((request?.networkLogs?.length || 0) > 0 || (request?.scriptLogs?.length || 0) > 0) && (
              <TabBadge style={{ background: request.scriptSuccess === false ? 'var(--error, #c0392b)' : 'var(--accent, #50fa7b)', color: 'var(--accent-fg, #fff)' }}>
                {request.scriptSuccess === false ? '✗' : ((request?.networkLogs?.length || 0) + (request?.scriptLogs?.length || 0))}
              </TabBadge>
            )}
          </TabItem>
        ))}
      </TabBar>

      {/* Body tab */}
      {activeTab === 'body' && (
        <BodyContentWrapper>
          {/* Search bar */}
          {showSearch && (
            <SearchBar>
              <SearchInput ref={searchRef} type="text" placeholder="Search in response..." value={bodySearch}
                onChange={e => setBodySearch(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setShowSearch(false), setBodySearch(''))}
              />
              {bodySearch && (
                <SearchCount>
                  {(() => { try { return (searchableText.match(new RegExp(escapeRegex(bodySearch), 'gi')) || []).length; } catch { return 0; } })()} matches
                </SearchCount>
              )}
              <SearchCloseBtn onClick={() => { setShowSearch(false); setBodySearch(''); }}>
                <Icon icon={faXmark} size={13} />
              </SearchCloseBtn>
            </SearchBar>
          )}
          {/* Large response warning */}
          {response.size > LARGE_RESPONSE_THRESHOLD && !showRawForLarge && (
            <LargeResponseWarning>
              <span>⚠️ Large response ({formatSize(response.size)}) — syntax highlighting may be slow.</span>
              <ShowRawBtn onClick={() => { setShowRawForLarge(true); setActiveTab('raw'); }}>Show Raw</ShowRawBtn>
            </LargeResponseWarning>
          )}
          {/* Body content */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {response.isFileResponse && response.fileBase64 ? (
              <FilePreview response={response} search={bodySearch} post={send} />
            ) : isLikelyJson(response.body, response.headers) ? (
              <ContentPadding><PrettyBodyViewer text={response.body} language="json" search={bodySearch} /></ContentPadding>
            ) : isLikelyHtml(response.body, response.headers) ? (
              <ContentPadding><PrettyBodyViewer text={response.body} language="html" search={bodySearch} /></ContentPadding>
            ) : isLikelyXml(response.body, response.headers) ? (
              <ContentPadding><PrettyBodyViewer text={response.body} language="xml" search={bodySearch} /></ContentPadding>
            ) : (
              <ContentPadding><PrettyBodyViewer text={searchableText} language="text" search={bodySearch} /></ContentPadding>
            )}
          </div>
        </BodyContentWrapper>
      )}

      {/* Headers tab */}
      {activeTab === 'headers' && (
        <TabContent>
          <ScrollArea>
            <HeadersTable>
              <thead>
                <HeadersRow>
                  <HeaderCell>Header</HeaderCell>
                  <HeaderCell>Value</HeaderCell>
                </HeadersRow>
              </thead>
              <tbody>
                {headerRows.map(({ key, value }, idx) => (
                  <DataRowsTr key={`${key}-${idx}`}>
                    <KeyCell>{key}</KeyCell>
                    <ValueCell>{value}</ValueCell>
                  </DataRowsTr>
                ))}
              </tbody>
            </HeadersTable>
          </ScrollArea>
        </TabContent>
      )}

      {/* Cookies tab */}
      {activeTab === 'cookies' && (
        <TabContent>
          <ScrollArea>
            {cookieRows.length === 0 ? (
              <EmptyHint>No cookies in this response (no Set-Cookie headers).</EmptyHint>
            ) : (
              <HeadersTable>
                <thead>
                  <HeadersRow>
                    <HeaderCell>Name</HeaderCell>
                    <HeaderCell>Value</HeaderCell>
                    <HeaderCell>Attributes</HeaderCell>
                  </HeadersRow>
                </thead>
                <tbody>
                  {cookieRows.map(({ name, value, attributes }, idx) => (
                    <DataRowsTr key={`${name}-${idx}`}>
                      <KeyCell>{name}</KeyCell>
                      <ValueCell>{value}</ValueCell>
                      <ValueCell>
                        {attributes.map((attr) => (
                          <AttrChip key={`${attr.key}-${attr.value}`}>
                            {attr.key}
                            {attr.value !== 'true' ? `=${attr.value}` : ''}
                          </AttrChip>
                        ))}
                      </ValueCell>
                    </DataRowsTr>
                  ))}
                </tbody>
              </HeadersTable>
            )}
          </ScrollArea>
        </TabContent>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <TabContent>
          <ScrollArea>
            <div style={{ padding: '12px' }}>
              <RequestLog response={response} request={request} />
              <ScriptResultLog request={request} />
            </div>
          </ScrollArea>
        </TabContent>
      )}

      {/* Raw tab */}
      {activeTab === 'raw' && (
        <TabContent>
          <ResponseBody>{response.body}</ResponseBody>
        </TabContent>
      )}
    </ResponsePaneWrapper>
  );
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
