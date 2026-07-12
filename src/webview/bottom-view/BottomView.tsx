import React, { useEffect, useState } from 'react';
import styled, { css } from 'styled-components';
import { ThemeProvider, restifyTheme } from '../theme';
import GlobalStyles from '../theme/GlobalStyles';

declare const acquireVsCodeApi: () => {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

const vscodeApi = acquireVsCodeApi();

export interface ActivityEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  title: string;
  detail?: string;
}

/* ─── Styled Components ─────────────────────────────────────── */

const BottomView = styled.div`
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-right: 2px;
`;

const Toolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 2px 2px 6px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

const Title = styled.span`
  font-weight: 600;
`;

const ClearBtn = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.cardStrong};
  color: ${({ theme }) => theme.fg};
  border-radius: 4px;
  padding: 4px 8px;
  cursor: pointer;
  transition: transform 0.15s, background 0.15s;
  &:hover {
    background: ${({ theme }) => theme.card};
    transform: translateY(-1px);
  }
`;

const EmptyState = styled.div`
  color: ${({ theme }) => theme.muted};
  padding: 12px 6px;
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: 6px;
  text-align: center;
  flex: 1;
`;

const EntryList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  overflow-y: auto;
  padding-right: 2px;
`;

const entryLevelStyles = {
  warning: css`
    border-left: 3px solid ${({ theme }) => theme.warning};
  `,
  error: css`
    border-left: 3px solid ${({ theme }) => theme.error};
  `,
  info: css`
    border-left: 3px solid ${({ theme }) => theme.info};
  `,
};

const Entry = styled.div<{ $level?: 'info' | 'warning' | 'error' }>`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
  padding: 8px 10px;
  background: ${({ theme }) => theme.cardStrong};
  display: flex;
  flex-direction: column;
  gap: 3px;
  box-shadow: 0 1px 0 ${({ theme }) => theme.innerHighlight} inset;
  ${({ $level }) => $level && entryLevelStyles[$level ?? 'info']}
`;

const EntryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

const EntryTitle = styled.span`
  font-weight: 600;
  overflow-wrap: anywhere;
`;

const EntryTime = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 11px;
  white-space: nowrap;
`;

const EntryDetail = styled.div`
  color: ${({ theme }) => theme.muted};
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-family: var(--vscode-editor-font-family, var(--vscode-font-family, sans-serif));
  line-height: 1.5;
`;

/* ─── Component ─────────────────────────────────────────────── */

function BottomViewInner(): JSX.Element {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  const handleClear = () => {
    setEntries([]);
    vscodeApi.postMessage({ command: 'clearEntries' });
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message?.command === 'setEntries') {
        setEntries(message.entries || []);
      }
    };

    window.addEventListener('message', handleMessage);
    vscodeApi.postMessage({ command: 'activityReady' });
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <BottomView>
      <Toolbar>
        <Title>Activity</Title>
        <ClearBtn type="button" onClick={handleClear}>
          Clear
        </ClearBtn>
      </Toolbar>
      {entries.length === 0 ? (
        <EmptyState>No activity yet.</EmptyState>
      ) : (
        <EntryList>
          {[...entries].reverse().map((entry) => (
            <Entry key={entry.id} $level={entry.level || 'info'}>
              <EntryHeader>
                <EntryTitle>{entry.title}</EntryTitle>
                <EntryTime>{entry.timestamp}</EntryTime>
              </EntryHeader>
              {entry.detail ? <EntryDetail>{entry.detail}</EntryDetail> : null}
            </Entry>
          ))}
        </EntryList>
      )}
    </BottomView>
  );
}

export function BottomViewRoot(): JSX.Element {
  return (
    <ThemeProvider theme={restifyTheme}>
      <GlobalStyles />
      <BottomViewInner />
    </ThemeProvider>
  );
}
