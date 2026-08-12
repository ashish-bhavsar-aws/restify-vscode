import React, { useState } from 'react';
import { ResponseState } from '../types';
import { Icon } from './FaIcon';
import {
  faArrowUp,
  faChevronRight,
  faCode,
  faCookieBite,
  faCopy,
  faDownload,
  faFileCode,
  faLink,
  faList,
  faTerminal,
} from '@fortawesome/free-solid-svg-icons';
import { formatSize } from '../utils/text';
import { parseResponseCookies } from '../utils/responsePaneUtils';
import {
  ChevronIcon,
  CollapsibleBadge,
  CollapsibleContainer,
  CollapsibleContent,
  CollapsibleHeader,
  CollapsibleTitle,
  CurlCopyBtn,
  LogEntryWrapper,
  LogLabel,
  LogLine,
  LogTimestamp,
  LogValue,
  MonoBlock,
  MonoPre,
  NoDataText,
  RequestLogContainer,
  ScriptBadge,
  ScriptErrorBlock,
  ScriptHeader,
  ScriptNoLogsBlock,
  ScriptRunningBox,
  ScriptSection,
  SectionLabel,
  Spinner,
  SubHeaderChevron,
  SubHeaderCount,
  SubHeaderLabel,
  SubHeaderRow,
  VarKey,
  VarRow,
} from './responsePaneStyles';

/* ─── Log Entry ───────────────────────────────────────── */

interface LogEntryProps {
  label: string;
  value: string;
  monospace?: boolean;
  small?: boolean;
  highlight?: boolean;
  indent?: boolean;
}

const LogEntry: React.FC<LogEntryProps> = ({
  label, value, monospace = false, small = false, highlight = false, indent = false,
}) => (
  <LogEntryWrapper $small={small} $indent={indent} $highlight={highlight}>
    <LogLabel>{label}:</LogLabel>
    <LogValue $monospace={monospace} $highlight={highlight}>{value}</LogValue>
  </LogEntryWrapper>
);

/* ─── CollapsibleSection ──────────────────────────────── */

interface CollapsibleSectionProps {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string | number;
  accentColor?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, defaultOpen = true, children, badge, accentColor }) => {
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

/* ─── Curl Command Generator ─────────────────────────── */

export function buildCurlCommand(request: any): string {
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

const CurlCommandGenerator: React.FC<{ request?: any; response: ResponseState | null }> = ({ request }) => {
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
        <Icon icon={faCopy} size={11} /> Copy cURL Command
      </CurlCopyBtn>
    </div>
  );
};

/* ─── Script Result Log ──────────────────────────────── */

export const ScriptResultLog: React.FC<{ request?: any }> = ({ request }) => {
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

/* ─── Request Log ─────────────────────────────────────── */

export const RequestLog: React.FC<{ response: ResponseState | null; request?: any }> = ({ response, request }) => {
  if (!response) {
    return <NoDataText>No request data available</NoDataText>;
  }

  const hasMtls = request?.mtlsUsed || false;
  const mtlsHostname = request?.mtlsHostname || null;

  const enabledRequestHeaders = (request?.headers || []).filter((h: any) => h.enabled !== false);
  const enabledQueryParams = (request?.queryParams || []).filter((p: any) => p.enabled !== false);
  const responseCookies = parseResponseCookies(response?.headers);

  return (
    <RequestLogContainer>

      <CollapsibleSection title={<SectionLabel><Icon icon={faArrowUp} size={11} />Request</SectionLabel>} defaultOpen={true}>
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
        <CollapsibleSection title={<SectionLabel><Icon icon={faList} size={11} />Request Headers</SectionLabel>} defaultOpen={false} badge={enabledRequestHeaders.length}>
          {enabledRequestHeaders.map((h: any, idx: number) => (
            <LogEntry key={idx} label={h.key} value={h.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {enabledQueryParams.length > 0 && (
        <CollapsibleSection title={<SectionLabel><Icon icon={faLink} size={11} />Query Parameters</SectionLabel>} defaultOpen={false} badge={enabledQueryParams.length}>
          {enabledQueryParams.map((p: any, idx: number) => (
            <LogEntry key={idx} label={p.key} value={p.value} monospace small />
          ))}
        </CollapsibleSection>
      )}

      {request?.body && (
        <CollapsibleSection title={<SectionLabel><Icon icon={faFileCode} size={11} />Request Body</SectionLabel>} defaultOpen={false}>
          <MonoPre>{request.body}</MonoPre>
        </CollapsibleSection>
      )}

      {request?.networkLogs && request.networkLogs.length > 0 && (
        <CollapsibleSection title={<SectionLabel><Icon icon={faTerminal} size={11} />Network Logs</SectionLabel>} defaultOpen={true} badge={request.networkLogs.length}>
          {request.networkLogs.map((ln: string, idx: number) => (
            <LogLine key={idx}>{ln}</LogLine>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection title={<SectionLabel><Icon icon={faDownload} size={11} />Response</SectionLabel>} defaultOpen={true}>
        <LogEntry label="Status Code" value={`${response.status} ${response.statusText}`} highlight={response.status >= 400} />
        <LogEntry label="Duration" value={`${response.duration}ms`} />
        <LogEntry label="Response Size" value={formatSize(response.size)} />
        <LogTimestamp>{new Date().toLocaleString()}</LogTimestamp>
      </CollapsibleSection>

      <CollapsibleSection title={<SectionLabel><Icon icon={faList} size={11} />Response Headers</SectionLabel>} defaultOpen={false} badge={Object.keys(response.headers).length}>
        {Object.entries(response.headers).map(([key, val]) => (
          <LogEntry key={key} label={key} value={String(val)} monospace small />
        ))}
      </CollapsibleSection>

      {responseCookies.length > 0 && (
        <CollapsibleSection title={<SectionLabel><Icon icon={faCookieBite} size={11} />Response Cookies</SectionLabel>} defaultOpen={false} badge={responseCookies.length}>
          {responseCookies.map((cookie, idx) => (
            <div key={idx}>
              <LogEntry label={cookie.name} value={cookie.value} monospace small />
              {cookie.attributes.length > 0 && (
                <LogEntry
                  label="attributes"
                  value={cookie.attributes.map((attr) =>
                    attr.value !== 'true' ? `${attr.key}=${attr.value}` : attr.key,
                  ).join(', ')}
                  monospace small indent
                />
              )}
            </div>
          ))}
        </CollapsibleSection>
      )}

      {request?.scriptLogs && request.scriptLogs.length > 0 && (
        <CollapsibleSection title={<SectionLabel><Icon icon={faCode} size={11} />Script Logs</SectionLabel>} defaultOpen={true} badge={request.scriptLogs.length}>
          {request.scriptLogs.map((ln: string, idx: number) => (
            <LogLine key={idx}>{ln}</LogLine>
          ))}
        </CollapsibleSection>
      )}

      <CollapsibleSection title={<SectionLabel><Icon icon={faTerminal} size={11} />cURL Command</SectionLabel>} defaultOpen={false}>
        <CurlCommandGenerator request={request} response={response} />
      </CollapsibleSection>

    </RequestLogContainer>
  );
};
