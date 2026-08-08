import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';

type WsStatus = 'idle' | 'connecting' | 'connected' | 'closed' | 'error';

interface WsLogRow {
  id: number;
  ts: number;
  direction: 'in' | 'out' | 'system';
  kind: 'text' | 'binary' | 'system' | 'error';
  text?: string;
  hex?: string;
  byteLength?: number;
}

const vscodeApi = (window as any).acquireVsCodeApi?.();

function post(message: unknown): void {
  vscodeApi?.postMessage(message);
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  font-size: 13px;
  color: ${({ theme }) => theme.fg};
  background: ${({ theme }) => theme.bg};
`;

const TopBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

const UrlInput = styled.input`
  flex: 1;
  padding: 6px 10px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  outline: none;
  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const Button = styled.button`
  padding: 6px 14px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  background: ${({ theme }) => theme.surface2};
  color: ${({ theme }) => theme.fg};
  cursor: pointer;
  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.hover};
    color: ${({ theme }) => theme.fg};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

const ConnectButton = styled(Button)`
  background: ${({ theme }) => theme.accent};
  border-color: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
`;

const Status = styled.span<{ $state: WsStatus }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  white-space: nowrap;
  background: ${({ theme, $state }) =>
    $state === 'connected'
      ? theme.success || 'rgba(46,160,67,.15)'
      : $state === 'connecting'
        ? 'rgba(200,170,0,.15)'
        : $state === 'error'
          ? 'rgba(248,81,73,.15)'
          : theme.border};
  color: ${({ theme, $state }) =>
    $state === 'connected'
      ? theme.success || '#2ea043'
      : $state === 'error'
        ? theme.error || '#f85149'
        : theme.fg};
`;

const StatusDot = styled.span<{ $state: WsStatus }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${({ theme, $state }) =>
    $state === 'connected'
      ? theme.success || '#2ea043'
      : $state === 'connecting'
        ? '#c8aa00'
        : $state === 'error'
          ? theme.error || '#f85149'
          : theme.fg};
`;

const Log = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  font-family: var(--vscode-editor-font-family, Menlo, Monaco, monospace);
  font-size: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const LogRow = styled.div<{ $direction: WsLogRow['direction']; $kind: WsLogRow['kind'] }>`
  display: flex;
  gap: 8px;
  padding: 4px 8px;
  border-radius: 4px;
  background: ${({ theme, $direction, $kind }) =>
    $direction === 'in'
      ? theme.hover || 'rgba(88,166,255,.08)'
      : $direction === 'out'
        ? 'rgba(46,160,67,.08)'
        : $kind === 'error'
          ? 'rgba(248,81,73,.12)'
          : 'transparent'};
  word-break: break-all;
  white-space: pre-wrap;
`;

const RowTime = styled.span`
  color: ${({ theme }) => theme.muted || theme.fg};
  opacity: 0.6;
  flex-shrink: 0;
`;

const RowArrow = styled.span<{ $direction: WsLogRow['direction'] }>`
  color: ${({ theme, $direction }) =>
    $direction === 'in'
      ? '#58a6ff'
      : $direction === 'out'
        ? '#2ea043'
        : theme.muted || theme.fg};
  flex-shrink: 0;
`;

const RowTag = styled.span<{ $kind: WsLogRow['kind'] }>`
  text-transform: uppercase;
  font-size: 10px;
  flex-shrink: 0;
  color: ${({ theme, $kind }) =>
    $kind === 'error'
      ? theme.error || '#f85149'
      : $kind === 'binary'
        ? '#d2a8ff'
        : theme.muted || theme.fg};
`;

const BottomBar = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid ${({ theme }) => theme.border};
`;

const MessageInput = styled.input`
  flex: 1;
  padding: 6px 10px;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  outline: none;
  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const BinaryLabel = styled.label`
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
  color: ${({ theme }) => theme.muted || theme.fg};
`;

export function WebSocketPanel(): React.ReactElement {
  const [url, setUrl] = useState('ws://localhost:3000/ws/echo');
  const [status, setStatus] = useState<WsStatus>('idle');
  const [protocol, setProtocol] = useState('');
  const [log, setLog] = useState<WsLogRow[]>([]);
  const [message, setMessage] = useState('');
  const [binary, setBinary] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    post({ command: 'webviewReady' });
    const handler = (event: MessageEvent) => {
      const msg = event.data;
      if (!msg?.command) return;
      switch (msg.command) {
        case 'wsStatus':
          setStatus(msg.state);
          if (msg.protocol) setProtocol(msg.protocol);
          break;
        case 'wsLog':
          setLog((prev) => [...prev, msg.entry]);
          break;
        case 'wsClear':
          setLog([]);
          setProtocol('');
          break;
        default:
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log]);

  const connected = status === 'connected';
  const connecting = status === 'connecting';

  const handleConnect = (): void => {
    if (connecting) return;
    if (connected) {
      post({ command: 'wsDisconnect' });
      setStatus('idle');
      return;
    }
    if (!url.trim()) return;
    post({ command: 'wsConnect', url });
  };

  const handleSend = (): void => {
    if (!connected || !message) return;
    post({ command: 'wsSend', data: message, binary });
    setMessage('');
  };

  const handleClear = (): void => {
    setLog([]);
    setProtocol('');
  };

  const statusLabel = status === 'idle' ? 'Idle' : status === 'connecting' ? 'Connecting…' : status === 'connected' ? 'Connected' : status === 'error' ? 'Error' : 'Closed';

  return (
    <Container>
      <TopBar>
        <UrlInput
          data-testid="ws-url-input"
          value={url}
          placeholder="ws://host:port/path"
          spellCheck={false}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleConnect();
          }}
        />
        <ConnectButton
          data-testid={connected ? 'ws-disconnect-btn' : 'ws-connect-btn'}
          onClick={handleConnect}
          disabled={connecting}
        >
          {connected ? 'Disconnect' : connecting ? 'Connecting…' : 'Connect'}
        </ConnectButton>
        <Status data-testid="ws-status" $state={status}>
          <StatusDot $state={status} />
          {statusLabel}
          {protocol ? ` · ${protocol}` : ''}
        </Status>
      </TopBar>
      <Log ref={logRef} data-testid="ws-log">
        {log.length === 0 && (
          <div style={{ opacity: 0.5 }}>No messages yet — connect to a WebSocket endpoint to begin.</div>
        )}
        {log.map((entry) => (
          <LogRow
            key={entry.id}
            data-testid={`ws-log-row-${entry.direction}`}
            $direction={entry.direction}
            $kind={entry.kind}
          >
            <RowTime>{new Date(entry.ts).toLocaleTimeString()}</RowTime>
            <RowArrow $direction={entry.direction}>
              {entry.direction === 'in' ? '▼' : entry.direction === 'out' ? '▲' : '•'}
            </RowArrow>
            <RowTag $kind={entry.kind}>{entry.kind}</RowTag>
            <span>
              {entry.text !== undefined
                ? entry.text
                : entry.hex !== undefined
                  ? `0x${entry.hex}`
                  : ''}
              {entry.byteLength !== undefined && entry.kind === 'binary'
                ? ` (${entry.byteLength} bytes)`
                : ''}
            </span>
          </LogRow>
        ))}
      </Log>
      <BottomBar>
        <MessageInput
          data-testid="ws-message-input"
          value={message}
          placeholder={binary ? 'Binary payload (UTF-8 text sent as bytes)' : 'Type a message…'}
          spellCheck={false}
          disabled={!connected}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSend();
          }}
        />
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
        <Button
          data-testid="ws-send-btn"
          onClick={handleSend}
          disabled={!connected || !message}
        >
          Send
        </Button>
        <Button data-testid="ws-clear-log" onClick={handleClear}>
          Clear
        </Button>
      </BottomBar>
    </Container>
  );
}
