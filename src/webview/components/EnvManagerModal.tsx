import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import { Environment } from '../types';
import { Icon } from './FaIcon';
import {
  faXmark,
  faPen,
  faTrash,
  faLock,
  faLockOpen,
  faEye,
  faEyeSlash,
  faUpload,
  faDownload,
  faRotateLeft,
  faArrowRight,
} from '@fortawesome/free-solid-svg-icons';

interface EnvManagerModalProps {
  open: boolean;
  environments: Environment[];
  activeEnvId: string | null;
  initialEditingEnv?: Environment | null;
  onClose: () => void;
  onSetActive: (id: string | null) => void;
  onSave: (env: Environment) => void;
  onDelete: (id: string) => void;
  onRevealSecret?: (envId: string, varKey: string) => Promise<string | undefined>;
  onImport?: () => void;
  onExport?: (env: Environment) => void;
}

const Overlay = styled.div<{ $open: boolean }>`
  display: ${({ $open }) => ($open ? 'flex' : 'none')};
  position: fixed;
  inset: 0;
  background: ${({ theme }) => theme.overlayBg};
  z-index: 200;
  align-items: center;
  justify-content: center;
`;

const Modal = styled.div`
  background: ${({ theme }) => theme.bg};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 18px;
  width: 640px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 20px 60px ${({ theme }) => theme.overlayBg};
`;

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;

  h3 {
    margin: 0;
    font-size: 14px;
  }
`;

const CloseBtn = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.muted};
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
  padding: 0 4px;
  transition: color 0.15s;

  &:hover {
    color: ${({ theme }) => theme.fg};
  }
`;

const Label = styled.label`
  display: block;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  padding: 7px 10px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  outline: none;
  margin-bottom: 10px;
  font-family: ${({ theme }) => theme.fontFamily};

  &:focus {
    border-color: ${({ theme }) => theme.accent};
  }
`;

const AccentBtn = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  font-family: ${({ theme }) => theme.fontFamily};
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.85;
  }
`;

const GhostBtn = styled.button`
  background: transparent;
  color: ${({ theme }) => theme.fg};
  border: 1px solid ${({ theme }) => theme.border};
  padding: 6px 14px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 12px;
  cursor: pointer;
  font-family: ${({ theme }) => theme.fontFamily};
  transition: background 0.15s;

  &:hover {
    background: ${({ theme }) => theme.hover};
  }
`;

const NewEnvBtn = styled(AccentBtn)`
  margin-bottom: 12px;
  width: 100%;
  text-align: center;
`;

const ModalActions = styled.div`
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 6px;
`;

const EnvList = styled.div`
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
  padding-right: 2px;
`;

const EnvItem = styled.div<{ $active: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: ${({ theme }) => theme.surface2};
  border-radius: ${({ theme }) => theme.radius};
  border: 1px solid transparent;
  transition: border-color 0.15s;

  ${({ $active, theme }) =>
    $active &&
    css`
      border-color: ${theme.accent};
    `}
`;

const RadioBtn = styled.button<{ $active: boolean }>`
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid ${({ theme }) => theme.border};
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
  transition: all 0.15s;

  ${({ $active, theme }) =>
    $active &&
    css`
      background: ${theme.accent};
      border-color: ${theme.accent};
    `}
`;

const ItemInfo = styled.div`
  flex: 1;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

const ItemName = styled.span`
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ItemCount = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
`;

const EmptyState = styled.div`
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
  text-align: center;
  padding: 24px 0;
  line-height: 1.6;

  code {
    font-family: ${({ theme }) => theme.monoFamily};
    background: ${({ theme }) => theme.surface2};
    padding: 1px 5px;
    border-radius: 3px;
  }
`;

const IconBtn = styled.button<{ $danger?: boolean }>`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 3px 7px;
  border-radius: 4px;
  font-size: 14px;
  transition: all 0.15s;
  flex-shrink: 0;
  line-height: 1;

  &:hover:not(:disabled) {
    background: ${({ theme }) => theme.hover};
    color: ${({ theme }) => theme.fg};
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }

  ${({ $danger, theme }) =>
    $danger &&
    css`
      &:hover:not(:disabled) {
        color: ${theme.error};
      }
    `}
`;

const VarsLabel = styled(Label)`
  margin-top: 10px;
`;

const VarsScroll = styled.div`
  overflow-y: auto;
  max-height: 240px;
  margin-bottom: 4px;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
`;

const VarsTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th {
    text-align: left;
    color: ${({ theme }) => theme.muted};
    font-size: 10px;
    padding: 6px 8px 4px;
    font-weight: normal;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    position: sticky;
    top: 0;
    background: ${({ theme }) => theme.bg};
  }

  td {
    padding: 3px 4px;
  }

  td:last-child {
    width: 92px;
    text-align: center;
    white-space: nowrap;
  }
`;

const VarInput = styled.input`
  width: 100%;
  background: transparent;
  border: none;
  border-bottom: 1px solid transparent;
  color: ${({ theme }) => theme.fg};
  padding: 4px 6px;
  font-size: 11px;
  outline: none;
  font-family: ${({ theme }) => theme.monoFamily};
  transition: border-color 0.15s;

  &:focus {
    border-bottom-color: ${({ theme }) => theme.accent};
  }

  &:disabled {
    opacity: 0.45;
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
    opacity: 0.6;
  }
`;

const ValueWrap = styled.div`
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
`;

const RevealBtn = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  padding: 3px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;

  &:hover {
    color: ${({ theme }) => theme.fg};
    background: ${({ theme }) => theme.hover};
  }
`;

const AddVarBtn = styled.button`
  background: transparent;
  border: 1px dashed ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.muted};
  width: 100%;
  padding: 6px;
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  cursor: pointer;
  font-family: ${({ theme }) => theme.fontFamily};
  margin: 8px 0 12px;
  transition: all 0.15s;

  &:hover {
    border-color: ${({ theme }) => theme.accent};
    color: ${({ theme }) => theme.accent};
  }
`;

export const EnvManagerModal: React.FC<EnvManagerModalProps> = ({
  open,
  environments,
  activeEnvId,
  initialEditingEnv,
  onClose,
  onSetActive,
  onSave,
  onDelete,
  onRevealSecret,
  onImport,
  onExport,
}) => {
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);
  const [revealedVals, setRevealedVals] = useState<Record<number, string>>({});

  React.useEffect(() => {
    setRevealedVals({});
    if (open && initialEditingEnv) {
      setEditingEnv({ ...initialEditingEnv });
    } else if (open && !initialEditingEnv) {
      setEditingEnv(null);
    }
  }, [open, initialEditingEnv]);

  if (!open) return null;

  const openNew = () =>
    setEditingEnv({ id: '', name: '', variables: [{ key: '', value: '' }] });

  const updateVar = (i: number, field: 'key' | 'value' | 'initial', val: string) => {
    if (!editingEnv) return;
    const vars = editingEnv.variables.map((v, idx) =>
      idx === i ? { ...v, [field]: val } : v
    );
    setEditingEnv({ ...editingEnv, variables: vars });
    if (field === 'value') {
      setRevealedVals((r) => {
        const next = { ...r };
        delete next[i];
        return next;
      });
    }
  };

  // F43: reset copies the baseline (initial) value into the current value.
  const resetVar = (i: number) => {
    if (!editingEnv) return;
    const v = editingEnv.variables[i];
    if (!v) return;
    const vars = editingEnv.variables.map((v_, idx) =>
      idx === i ? { ...v_, value: v_.initialValue ?? v_.value } : v_
    );
    setEditingEnv({ ...editingEnv, variables: vars });
    setRevealedVals((r) => {
      const next = { ...r };
      delete next[i];
      return next;
    });
  };

  // F43: persist copies the current value into the baseline (initial) value.
  const persistVar = (i: number) => {
    if (!editingEnv) return;
    const vars = editingEnv.variables.map((v_, idx) =>
      idx === i ? { ...v_, initialValue: v_.value } : v_
    );
    setEditingEnv({ ...editingEnv, variables: vars });
  };

  const addVar = () => {
    if (!editingEnv) return;
    setEditingEnv({
      ...editingEnv,
      variables: [...editingEnv.variables, { key: '', value: '' }],
    });
  };

  const removeVar = (i: number) => {
    if (!editingEnv) return;
    setEditingEnv({
      ...editingEnv,
      variables: editingEnv.variables.filter((_, idx) => idx !== i),
    });
    setRevealedVals((r) => {
      const next = { ...r };
      delete next[i];
      return next;
    });
  };

  const toggleSecret = (i: number) => {
    if (!editingEnv) return;
    const vars = editingEnv.variables.map((v, idx) =>
      idx === i ? { ...v, isSecret: !v.isSecret } : v
    );
    setEditingEnv({ ...editingEnv, variables: vars });
    setRevealedVals((r) => {
      const next = { ...r };
      delete next[i];
      return next;
    });
  };

  const revealSecret = async (i: number) => {
    if (!editingEnv) return;
    const v = editingEnv.variables[i];
    if (!v?.key) return;
    if (!onRevealSecret || !editingEnv.id) return;
    const value = await onRevealSecret(editingEnv.id, v.key);
    setRevealedVals((r) => ({ ...r, [i]: value ?? '' }));
  };

  const handleSave = () => {
    if (!editingEnv || !editingEnv.name.trim()) return;
    onSave(editingEnv);
    setEditingEnv(null);
    setRevealedVals({});
  };

  const handleOverlayClick = () => {
    if (editingEnv) {
      setEditingEnv(null);
    } else {
      onClose();
    }
  };

  return (
    <Overlay $open={open} onClick={handleOverlayClick} data-testid="env-manager-overlay">
      <Modal onClick={(e) => e.stopPropagation()} data-testid="env-manager-modal">
        {editingEnv ? (
          <>
            <ModalHeader>
              <h3>{editingEnv.id ? 'Edit Environment' : 'New Environment'}</h3>
              <CloseBtn onClick={() => setEditingEnv(null)} data-testid="env-modal-close">
                <Icon icon={faXmark} size={14} />
              </CloseBtn>
            </ModalHeader>

            <Label>Name</Label>
            <Input
              placeholder="Production"
              value={editingEnv.name}
              autoFocus
              data-testid="env-name-input"
              onChange={(e) =>
                setEditingEnv({ ...editingEnv, name: e.target.value })
              }
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />

            <VarsLabel>Variables</VarsLabel>
            <VarsScroll>
              <VarsTable>
                <thead>
                  <tr>
                    <th>Key</th>
                    <th>Initial Value</th>
                    <th>Current Value</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {editingEnv.variables.map((v, i) => {
                    const isSecret = v.isSecret;
                    const revealedVal = revealedVals[i];
                    const showMasked =
                      isSecret && v.value === '' && revealedVal === undefined;
                    const initialValue = v.initialValue ?? v.value;
                    const canReset = !isSecret && initialValue !== v.value;
                    return (
                      <tr key={i}>
                        <td>
                          <VarInput
                            placeholder="key"
                            value={v.key}
                            data-testid="env-var-key"
                            onChange={(e) => updateVar(i, 'key', e.target.value)}
                          />
                        </td>
                        <td>
                          {isSecret ? (
                            <VarInput
                              disabled
                              placeholder="••••••••"
                              value=""
                              aria-label="Initial value (secrets keep a single value)"
                            />
                          ) : (
                            <VarInput
                              placeholder="initial"
                              value={initialValue}
                              data-testid={`env-var-initial-${i}`}
                              onChange={(e) =>
                                updateVar(i, 'initial', e.target.value)
                              }
                            />
                          )}
                        </td>
                        <td>
                          <ValueWrap>
                            <VarInput
                              placeholder={isSecret ? '••••••••' : 'current'}
                              type={isSecret && showMasked ? 'password' : 'text'}
                              value={isSecret ? (revealedVal ?? v.value) : v.value}
                              data-testid="env-var-value"
                              onChange={(e) =>
                                updateVar(i, 'value', e.target.value)
                              }
                            />
                            {isSecret && (
                              <RevealBtn
                                type="button"
                                title={showMasked ? 'Reveal secret' : 'Hide secret'}
                                data-testid={`env-secret-reveal-${i}`}
                                onClick={() => {
                                  if (showMasked) revealSecret(i);
                                  else setRevealedVals((r) => {
                                    const next = { ...r };
                                    delete next[i];
                                    return next;
                                  });
                                }}
                              >
                                <Icon icon={showMasked ? faEye : faEyeSlash} size={11} />
                              </RevealBtn>
                            )}
                          </ValueWrap>
                        </td>
                        <td>
                          {!isSecret && (
                            <>
                              <IconBtn
                                title="Reset current value to initial"
                                disabled={!canReset}
                                onClick={() => resetVar(i)}
                                data-testid={`env-var-reset-${i}`}
                              >
                                <Icon icon={faRotateLeft} size={11} />
                              </IconBtn>
                              <IconBtn
                                title="Persist current value as initial"
                                onClick={() => persistVar(i)}
                                data-testid={`env-var-persist-${i}`}
                              >
                                <Icon icon={faArrowRight} size={11} />
                              </IconBtn>
                            </>
                          )}
                          <IconBtn
                            title={isSecret ? 'Secret variable (stored encrypted)' : 'Mark as secret'}
                            onClick={() => toggleSecret(i)}
                            data-testid={`env-secret-toggle-${i}`}
                            style={isSecret ? { color: 'var(--info)' } : undefined}
                          >
                            <Icon icon={isSecret ? faLock : faLockOpen} size={12} />
                          </IconBtn>
                          <IconBtn
                            onClick={() => removeVar(i)}
                            title="Remove variable"
                          >
                            <Icon icon={faTrash} size={12} />
                          </IconBtn>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </VarsTable>
            </VarsScroll>

            <AddVarBtn onClick={addVar}>+ Add Variable</AddVarBtn>

            <ModalActions>
              <GhostBtn onClick={() => setEditingEnv(null)}>Back</GhostBtn>
              <AccentBtn
                onClick={handleSave}
                disabled={!editingEnv.name.trim()}
                data-testid="env-save-btn"
              >
                Save
              </AccentBtn>
            </ModalActions>
          </>
        ) : (
          <>
            <ModalHeader>
              <h3>Manage Environments</h3>
              <div style={{ display: 'flex', gap: 4 }}>
                {onImport && (
                  <IconBtn
                    title="Import environment (Postman / Restify JSON)"
                    onClick={onImport}
                    data-testid="env-import-btn"
                  >
                    <Icon icon={faUpload} size={13} />
                  </IconBtn>
                )}
                <CloseBtn onClick={onClose} data-testid="env-modal-close">
                  <Icon icon={faXmark} size={14} />
                </CloseBtn>
              </div>
            </ModalHeader>

            <NewEnvBtn onClick={openNew} data-testid="env-new-btn">+ New Environment</NewEnvBtn>

            <EnvList>
              {environments.length === 0 ? (
                <EmptyState>
                  No environments yet. Create one to use{' '}
                  <code>{'{{variable}}'}</code> in requests.
                </EmptyState>
              ) : (
                environments.map((env) => {
                  const visibleVars = env.variables.filter(
                    (v) => v.key.trim() || v.value.trim()
                  );
                  const isActive = env.id === activeEnvId;
                  return (
                    <EnvItem key={env.id} $active={isActive} data-testid={`env-item-${env.name}`}>
                      <RadioBtn
                        $active={isActive}
                        title={
                          isActive
                            ? 'Active — click to deselect'
                            : 'Set as active'
                        }
                        onClick={() =>
                          onSetActive(isActive ? null : env.id)
                        }
                      />
                      <ItemInfo onClick={() => onSetActive(isActive ? null : env.id)}>
                        <ItemName>{env.name}</ItemName>
                        <ItemCount>
                          {visibleVars.length} variable
                          {visibleVars.length !== 1 ? 's' : ''}
                        </ItemCount>
                      </ItemInfo>
                      <IconBtn
                        title="Edit"
                        onClick={() => setEditingEnv({ ...env })}
                      >
                        <Icon icon={faPen} size={13} />
                      </IconBtn>
                      {onExport && (
                        <IconBtn
                          title="Export as Postman environment"
                          onClick={() => onExport(env)}
                        >
                          <Icon icon={faDownload} size={13} />
                        </IconBtn>
                      )}
                      <IconBtn
                        $danger
                        title="Delete"
                        onClick={() => onDelete(env.id)}
                      >
                        <Icon icon={faTrash} size={13} />
                      </IconBtn>
                    </EnvItem>
                  );
                })
              )}
            </EnvList>
          </>
        )}
      </Modal>
    </Overlay>
  );
};
