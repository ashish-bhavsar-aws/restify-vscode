import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import type {
  RequestState,
  WsLogRow,
  WsSessionState,
} from '../types';

/**
 * Unified WebSocket client (Postman-style) rendered inside the main panel for
 * tabs whose request type is `ws`. The socket runs in the extension host; this
 * view only renders the session state streamed from it.
 */

interface WebSocketClientViewProps {
  tabId: string;
  request: RequestState;
  session: WsSessionState;
  onUpdate: (updates: Partial<RequestState>) => void;
  onConnect: (url: string, token: string) => void;
  onDisconnect: () => void;
  onSend: (data: string, binary: boolean) => void;
  onClear: () => void;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const syntaxJsonClasses = (match: string): string => {
  if (/^"/.test(match)) return /:$/.test(match) ? 'syntax-json-key' : 'syntax-json-string';
  if (/true|false/.test(match)) return 'syntax-json-boolean';
  if (/null/.test(match)) return 'syntax-json-null';
  return 'syntax-json-number';
};

function highlightPayload(text: string): string {
  let pretty = text;
  try {
    pretty = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return escapeHtml(text);
  }
  return escapeHtml(pretty).replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => `<span class="${syntaxJsonClasses(match)}">${match}</span>`,
  );
}

/* ─── Styled Components ───────────────────────────────────── */

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  font-size: 13px;
  color: ${({ theme }) => theme.fg};
  background: transparent;
`;

const UrlRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const UrlInput = styled.input`
  flex: 1;
  padding: 7px 12px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  outline: none;
  font-size: 13px;
  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const ConnectBtn = styled.button<{ $connected: boolean; $disabled: boolean }>`
  padding: 7px 16px;
  border-radius: ${({ theme }) => theme.radius};
  border: 1px solid ${({ $connected, theme }) => ($connected ? theme.error : theme.accent)};
  background: ${({ $connected, theme }) => ($connected ? theme.error : theme.accent)};
  color: ${({ $connected, theme }) => ($connected ? '#fff' : theme.accentFg)};
  font-weight: 600;
  cursor: ${({ $disabled }) => ($disabled ? 'default' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.55 : 1)};
  white-space: nowrap;
`;

const StatusPill = styled.span<{ $state: WsSessionState['status'] }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
  background: ${({ theme, $state }) =>
    $state === 'connected'
      ? 'rgba(46, 160, 67, 0.15)'
      : $state === 'connecting'
        ? 'rgba(200, 170, 0, 0.15)'
        : $state === 'error'
          ? 'rgba(248, 81, 73, 0.15)'
          : theme.surface2};
  color: ${({ theme, $state }) =>
    $state === 'connected'
      ? theme.success || '#2ea043'
      : $state === 'connecting'
        ? '#c8aa00'
        : $state === 'error'
          ? theme.error || '#f85149'
          : theme.muted};
`;

const StatusDot = styled.span<{ $state: WsSessionState['status'] }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ $state }) =>
    $state === 'connected'
      ? '#2ea043'
      : $state === 'connecting'
        ? '#c8aa00'
        : $state === 'error'
          ? '#f85149'
          : '#6b7280'};
`;

const AuthRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const AuthLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.muted};
  white-space: nowrap;
`;

const AuthSelect = styled.select`
  padding: 5px 8px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  outline: none;
  font-size: 12px;
`;

const TokenInput = styled.input`
  flex: 1;
  padding: 5px 10px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  outline: none;
  font-size: 12px;
  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const Log = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
  font-family: var(--vscode-editor-font-family, Menlo, Monaco, monospace);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const EmptyHint = styled.div`
  margin: auto;
  text-align: center;
  color: ${({ theme }) => theme.muted};
  opacity: 0.7;
  font-family: inherit;
`;

const LogCard = styled.div<{ $direction: WsLogRow['direction'] }>`
  border: 1px solid ${({ theme }) => theme.border};
  border-left: 3px solid
    ${({ $direction, theme }) =>
      $direction === 'in'
        ? '#58a6ff'
        : $direction === 'out'
          ? '#2ea043'
          : $direction === 'system'
            ? theme.muted
            : theme.error || '#f85149'};
  border-radius: 6px;
  background: ${({ theme, $direction }) =>
    $direction === 'in'
      ? 'rgba(88, 166, 255, 0.06)'
      : $direction === 'out'
        ? 'rgba(46, 160, 67, 0.06)'
        : $direction === 'system'
          ? theme.surface2
          : 'rgba(248, 81, 73, 0.08)'};
  padding: 6px 10px;
  word-break: break-word;
  white-space: pre-wrap;
`;

const CardHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

const DirectionBadge = styled.span<{ $direction: WsLogRow['direction'] }>`
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 6px;
  border-radius: 3px;
  color: ${({ $direction, theme }) =>
    $direction === 'in'
      ? '#58a6ff'
      : $direction === 'out'
        ? '#2ea043'
        : $direction === 'system'
          ? theme.muted
          : theme.error || '#f85149'};
  background: ${({ theme, $direction }) =>
    $direction === 'system' ? 'transparent' : `${theme.surface2}`};
`;

const Payload = styled.div`
  font-family: var(--vscode-editor-font-family, Menlo, Monaco, monospace);
  font-size: 12px;
  line-height: 1.5;
  color: ${({ theme }) => theme.fg};
`;

const Composer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const ComposerRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const MessageInput = styled.textarea`
  flex: 1;
  resize: vertical;
  min-height: 44px;
  max-height: 120px;
  padding: 6px 10px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  outline: none;
  font-family: var(--vscode-editor-font-family, Menlo, Monaco, monospace);
  font-size: 12px;
  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const ActionBtn = styled.button<{ $primary?: boolean; $disabled?: boolean }>`
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  border: 1px solid
    ${({ $primary, theme }) => ($primary ? theme.accent : theme.border)};
  background: ${({ $primary, theme }) => ($primary ? theme.accent : theme.surface2)};
  color: ${({ $primary, theme }) => ($primary ? theme.accentFg : theme.fg)};
  font-weight: 600;
  cursor: ${({ $disabled }) => ($disabled ? 'default' : 'pointer')};
  opacity: ${({ $disabled }) => ($disabled ? 0.5 : 1)};
  white-space: nowrap;
`;

const BinaryLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  white-space: nowrap;
  color: ${({ theme }) => theme.muted};
`;

/* ─── Component ───────────────────────────────────────────── */

export function WebSocketClientView({
  request,
  session,
  onUpdate,
  onConnect,
  onDisconnect,
  onSend,
  onClear,
}: WebSocketClientViewProps): React.ReactElement {
  const [message, setMessage] = useState('');
  const [binary, setBinary] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const connected = session.status === 'connected';
  const connecting = session.status === 'connecting';
  const bearer = request.authType === 'bearer';

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [session.log]);

  const handleConnect = (): void => {
    if (connecting) return;
    if (connected) {
      onDisconnect();
      return;
    }
    if (!request.url.trim()) return;
    onConnect(request.url.trim(), request.authData.token || '');
  };

  const handleSend = (): void => {
    if (!connected || !message) return;
    onSend(message, binary);
    setMessage('');
  };

  const statusLabel =
    session.status === 'idle'
      ? 'Idle'
      : session.status === 'connecting'
        ? 'Connecting…'
        : session.status === 'connected'
          ? 'Connected'
          : session.status === 'error'
            ? 'Error'
            : 'Closed';

  return (
    <Container data-testid="websocket-client-view">
      <UrlRow>
        <UrlInput
          data-testid="ws-url-input"
          value={request.url}
          placeholder="ws://host:port/path  ({{vars}} supported)"
          spellCheck={false}
          disabled={connecting}
          onChange={(e) => onUpdate({ url: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConnect();
          }}
        />
        <ConnectBtn
          data-testid={connected ? 'ws-disconnect-btn' : 'ws-connect-btn'}
          $connected={connected}
          $disabled={connecting}
          onClick={handleConnect}
        >
          {connected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect'}
        </ConnectBtn>
        <StatusPill data-testid="ws-status" $state={session.status}>
          <StatusDot $state={session.status} />
          {statusLabel}
          {session.protocol ? ` · ${session.protocol}` : ''}
        </StatusPill>
      </UrlRow>

      <AuthRow>
        <AuthLabel>Auth</AuthLabel>
        <AuthSelect
          data-testid="ws-auth-type"
          value={request.authType === 'bearer' ? 'bearer' : 'none'}
          onChange={(e) =>
            onUpdate({
              authType: (e.target.value === 'bearer' ? 'bearer' : 'none') as RequestState['authType'],
            })
          }
        >
          <option value="none">No Auth</option>
          <option value="bearer">Bearer Token</option>
        </AuthSelect>
        {bearer && (
          <TokenInput
            data-testid="ws-token-input"
            type="password"
            value={request.authData.token || ''}
            placeholder="Bearer token ({{vars}} supported)"
            spellCheck={false}
            onChange={(e) => onUpdate({ authData: { ...request.authData, token: e.target.value } })}
          />
        )}
      </AuthRow>

      <Log ref={logRef} data-testid="ws-log">
        {session.log.length === 0 && (
          <EmptyHint>
            No messages yet — connect to a WebSocket endpoint to begin.
          </EmptyHint>
        )}
        {session.log.map((entry) => (
          <LogCard key={entry.id} $direction={entry.direction}>
            <CardHeader>
              <DirectionBadge $direction={entry.direction}>
                {entry.direction === 'in'
                  ? 'Received'
                  : entry.direction === 'out'
                    ? 'Sent'
                    : entry.direction === 'system'
                      ? 'Info'
                      : 'Error'}
              </DirectionBadge>
              <span>{new Date(entry.ts).toLocaleTimeString()}</span>
              {entry.byteLength !== undefined && entry.kind === 'binary' && (
                <span>{entry.byteLength} bytes</span>
              )}
            </CardHeader>
            <Payload
              dangerouslySetInnerHTML={{
                __html:
                  entry.text !== undefined
                    ? highlightPayload(entry.text)
                    : entry.hex !== undefined
                      ? `0x${entry.hex}`
                      : '',
              }}
            />
          </LogCard>
        ))}
      </Log>

      <Composer>
        <MessageInput
          data-testid="ws-message-input"
          value={message}
          placeholder={binary ? 'Binary payload (UTF-8 text sent as bytes)' : 'Type a message…'}
          spellCheck={false}
          disabled={!connected}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <ComposerRow>
          <BinaryLabel>
            <input
              data-testid="ws-binary-toggle"
              type="checkbox"
              checked={binary}
              disabled={!connected}
              onChange={(e) => setBinary(e.target.checked)}
            />
            Binary
          </BinaryLabel>
          <ActionBtn
            data-testid="ws-send-btn"
            $primary
            $disabled={!connected || !message}
            onClick={handleSend}
          >
            Send
          </ActionBtn>
          <ActionBtn data-testid="ws-clear-log" onClick={onClear}>
            Clear
          </ActionBtn>
        </ComposerRow>
      </Composer>
    </Container>
  );
}
