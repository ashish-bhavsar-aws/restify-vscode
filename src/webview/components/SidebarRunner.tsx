import React from 'react';
import styled from 'styled-components';
import { Icon } from './FaIcon';
import { faStop, faXmark, faCircleCheck, faCircleXmark, faTrash } from '@fortawesome/free-solid-svg-icons';
import { CollectionVar, RunState, METHOD_SHORT } from './sidebarTypes';
import {
  ModalActions,
  ModalBox,
  ModalInput,
  ModalLabel,
  ModalOverlay,
  MethodBadge,
  GhostButton,
  IconButton,
  PrimaryButton,
} from './sidebarStyles';

export const statusColor = (s: number | undefined): string => {
  if (s === undefined) return 'var(--muted)';
  if (s >= 200 && s < 300) return 'var(--green, #4ec9b0)';
  if (s >= 300 && s < 400) return 'var(--blue, #569cd6)';
  if (s >= 400 && s < 500) return 'var(--orange, #ce9178)';
  if (s >= 500) return 'var(--red, #f14c4c)';
  return 'var(--muted)';
};

/* ─── Collection runner results ──────────────────────────── */

const RunModalOverlay = styled(ModalOverlay)``;

const RunModalBox = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 16px;
  width: 92%;
  max-width: 560px;
  max-height: 72vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 48px ${({ theme }) => theme.shadowMd};
`;

const RunHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;

  h3 {
    font-size: 13px;
    color: ${({ theme }) => theme.fg};
    flex: 1;
    margin: 0;
  }
`;

const RunSpinner = styled.span`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, ${({ theme }) => theme.accent} 30%, transparent);
  border-top-color: ${({ theme }) => theme.accent};
  animation: rspin 0.8s linear infinite;

  @keyframes rspin {
    to { transform: rotate(360deg); }
  }
`;

const RunSummary = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  padding: 8px 10px;
  background: ${({ theme }) => theme.hover};
  border-radius: 6px;
  margin-bottom: 10px;

  strong {
    color: ${({ theme }) => theme.fg};
    font-weight: 600;
  }
`;

const RunList = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 120px;
`;

const RunRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: ${({ theme }) => theme.hover};
`;

const RunName = styled.div`
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: ${({ theme }) => theme.fg};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const RunMeta = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  white-space: nowrap;
`;

export const RunnerResultsModal: React.FC<{
  runState: RunState | null;
  onCancel(): void;
  onClose(): void;
}> = ({ runState, onCancel, onClose }) => {
  const entries = runState?.entries ?? [];
  const passedTests = entries.reduce((n, e) => n + (e.testSummary?.passed ?? 0), 0);
  const failedTests = entries.reduce((n, e) => n + (e.testSummary?.failed ?? 0), 0);
  const totalDuration = entries.reduce((n, e) => n + e.duration, 0);
  const done = entries.filter(e => !e.cancelled && e.status !== undefined).length;
  const failedReqs = entries.filter(e => !e.cancelled && (e.status >= 400 || e.error)).length;

  return (
    <RunModalOverlay $open={!!runState} onClick={onClose}>
      <RunModalBox data-testid="runner-modal" onClick={e => e.stopPropagation()}>
        <RunHeader>
          {runState?.running && <RunSpinner />}
          <h3>{runState?.running ? 'Running…' : 'Collection run'}</h3>
          {!runState?.running && (
            <IconButton data-testid="runner-close-btn" title="Close" onClick={onClose}><Icon icon={faXmark} size={14} /></IconButton>
          )}
        </RunHeader>
        <RunSummary data-testid="runner-summary">
          <span><strong>{runState?.running ? entries.length : done}</strong> / {runState?.total ?? 0} requests</span>
          {done > 0 && <span>{done - failedReqs} passed</span>}
          {failedReqs > 0 && <span><strong style={{ color: 'var(--red, #f14c4c)' }}>{failedReqs} failed</strong></span>}
          {(passedTests || failedTests) > 0 && (
            <span>tests {passedTests} <strong style={{ color: 'var(--red, #f14c4c)' }}>{failedTests}</strong></span>
          )}
          {totalDuration > 0 && <span>{Math.round(totalDuration)}ms</span>}
          {runState?.cancelled && <span><strong>Cancelled</strong></span>}
          {runState?.error && <span title={runState.error}><strong style={{ color: 'var(--red, #f14c4c)' }}>Error: {runState.error}</strong></span>}
        </RunSummary>
        <RunList>
          {entries.length === 0 && (
            <RunRow><RunName style={{ color: 'var(--muted)' }}>{runState?.running ? 'Running…' : 'No requests'}</RunName></RunRow>
          )}
          {entries.map((e) => (
            <RunRow key={e.requestId} title={e.url || e.name}>
              <MethodBadge $method={e.method}>{METHOD_SHORT[e.method] || e.method}</MethodBadge>
              <RunName>{e.name || e.url || 'Untitled'}</RunName>
              {e.error
                ? <RunMeta style={{ color: 'var(--red, #f14c4c)' }} title={e.error}>{e.cancelled ? 'cancelled' : 'error'}</RunMeta>
                : <RunMeta style={{ color: statusColor(e.status) }}>{e.status}{e.statusText ? ' ' + e.statusText : ''}</RunMeta>}
              {e.testSummary && (e.testSummary.passed > 0 || e.testSummary.failed > 0) && (
                <RunMeta style={{ color: 'var(--muted)' }}>
                  {e.testSummary.failed > 0
                    ? <Icon icon={faCircleXmark} size={11} style={{ color: 'var(--red, #f14c4c)', marginRight: 2 }} />
                    : <Icon icon={faCircleCheck} size={11} style={{ color: 'var(--green, #4ec9b0)', marginRight: 2 }} />}
                  {e.testSummary.passed}/{e.testSummary.passed + e.testSummary.failed}
                </RunMeta>
              )}
              {e.duration > 0 && <RunMeta>{Math.round(e.duration)}ms</RunMeta>}
              {e.size > 0 && <RunMeta>{(e.size / 1024).toFixed(1)}KB</RunMeta>}
            </RunRow>
          ))}
        </RunList>
        <ModalActions style={{ marginTop: 10, justifyContent: 'flex-end' }}>
          {runState?.running ? (
            <PrimaryButton data-testid="runner-cancel-btn" onClick={onCancel}><Icon icon={faStop} size={11} />Cancel</PrimaryButton>
          ) : (
            <PrimaryButton data-testid="runner-done-close-btn" onClick={onClose}>Close</PrimaryButton>
          )}
        </ModalActions>
      </RunModalBox>
    </RunModalOverlay>
  );
};

/* ─── Collection variables editor (F42) ──────────────────── */

const VarsModalBox = styled(ModalBox)`
  max-width: 460px;
`;

const VarsHint = styled.p`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin: 0 0 8px;
  line-height: 1.4;
`;

const VarRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
`;

const VarKeyInput = styled(ModalInput)`
  width: 42%;
`;

const VarValueInput = styled(ModalInput)`
  flex: 1;
`;

const VarRemoveBtn = styled(IconButton)`
  flex-shrink: 0;
`;

const AddVarBtn = styled(GhostButton)`
  margin-top: 4px;
`;

export const CollectionVarsModal: React.FC<{
  title: string;
  variables: CollectionVar[];
  onChange(vars: CollectionVar[]): void;
  onCancel(): void;
  onSave(vars: CollectionVar[]): void;
}> = ({ title, variables, onChange, onCancel, onSave }) => {
  const update = (index: number, patch: Partial<CollectionVar>) => {
    const next = variables.map((v, i) => (i === index ? { ...v, ...patch } : v));
    onChange(next);
  };
  const remove = (index: number) => {
    onChange(variables.filter((_, i) => i !== index));
  };

  return (
    <ModalOverlay $open onClick={onCancel}>
      <VarsModalBox data-testid="collection-vars-modal" onClick={e => e.stopPropagation()}>
        <h3>Variables · {title}</h3>
        <VarsHint>
          These variables are available to every request in this collection as
          {' '}{'{{key}}'}, below the active environment but above global variables.
        </VarsHint>
        {variables.map((v, i) => (
          <VarRow key={i}>
            <VarKeyInput data-testid={`vars-key-${i}`} placeholder="key" value={v.key}
              onChange={e => update(i, { key: e.target.value })} />
            <VarValueInput data-testid={`vars-value-${i}`} placeholder="value" value={v.value}
              onChange={e => update(i, { value: e.target.value })} />
            <VarRemoveBtn title="Remove" onClick={() => remove(i)}><Icon icon={faTrash} size={12} /></VarRemoveBtn>
          </VarRow>
        ))}
        <AddVarBtn data-testid="vars-add-btn" onClick={() => onChange([...variables, { key: '', value: '' }])}>
          + Add variable
        </AddVarBtn>
        <ModalActions>
          <GhostButton data-testid="vars-cancel-btn" onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton data-testid="vars-save-btn" onClick={() => onSave(variables)}>Save</PrimaryButton>
        </ModalActions>
      </VarsModalBox>
    </ModalOverlay>
  );
};

/* ─── Collection scripts editor (F40) ────────────────────── */

const ScriptsModalBox = styled(ModalBox)`
  max-width: 560px;
  width: 94%;
`;

const ScriptsLabel = styled(ModalLabel)`
  margin-top: 10px;
`;

const ScriptInput = styled.textarea`
  width: 100%;
  min-height: 120px;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  color: ${({ theme }) => theme.fg};
  padding: 8px 10px;
  font-size: 11px;
  font-family: ${({ theme }) => theme.monoFamily};
  line-height: 1.5;
  resize: vertical;
  outline: none;
  box-sizing: border-box;

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

export const CollectionScriptsModal: React.FC<{
  title: string;
  preScript: string;
  testScript: string;
  onChange(pre: string, test: string): void;
  onCancel(): void;
  onSave(pre: string, test: string): void;
}> = ({ title, preScript, testScript, onChange, onCancel, onSave }) => {
  return (
    <ModalOverlay $open onClick={onCancel}>
      <ScriptsModalBox data-testid="collection-scripts-modal" onClick={e => e.stopPropagation()}>
        <h3>Scripts · {title}</h3>
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 4px', lineHeight: 1.4 }}>
          Collection-level scripts run for every request in this collection.
          Pre-request runs before each request&apos;s own script; Tests run after.
        </p>
        <ScriptsLabel>Pre-request script</ScriptsLabel>
        <ScriptInput
          data-testid="collection-pre-script"
          placeholder={'// Runs before every request\nset("key", "value");'}
          value={preScript}
          onChange={e => onChange(e.target.value, testScript)}
          spellCheck={false}
        />
        <ScriptsLabel>Tests</ScriptsLabel>
        <ScriptInput
          data-testid="collection-test-script"
          placeholder={'// Runs after every response\ntests["status is 2xx"] = response.status >= 200 && response.status < 300;'}
          value={testScript}
          onChange={e => onChange(preScript, e.target.value)}
          spellCheck={false}
        />
        <ModalActions>
          <GhostButton data-testid="scripts-cancel-btn" onClick={onCancel}>Cancel</GhostButton>
          <PrimaryButton data-testid="scripts-save-btn" onClick={() => onSave(preScript, testScript)}>Save</PrimaryButton>
        </ModalActions>
      </ScriptsModalBox>
    </ModalOverlay>
  );
};
