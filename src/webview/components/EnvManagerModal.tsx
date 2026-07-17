import React, { useState } from 'react';
import styled, { css } from 'styled-components';
import { Environment } from '../types';
import { Icon } from './FaIcon';
import { faXmark, faPen, faTrash } from '@fortawesome/free-solid-svg-icons';

interface EnvManagerModalProps {
  open: boolean;
  environments: Environment[];
  activeEnvId: string | null;
  onClose: () => void;
  onSetActive: (id: string | null) => void;
  onSave: (env: Environment) => void;
  onDelete: (id: string) => void;
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
  width: 480px;
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

  &:hover {
    background: ${({ theme }) => theme.hover};
    color: ${({ theme }) => theme.fg};
  }

  ${({ $danger, theme }) =>
    $danger &&
    css`
      &:hover {
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
    width: 28px;
    text-align: center;
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

  &::placeholder {
    color: ${({ theme }) => theme.muted};
    opacity: 0.6;
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
  onClose,
  onSetActive,
  onSave,
  onDelete,
}) => {
  const [editingEnv, setEditingEnv] = useState<Environment | null>(null);

  if (!open) return null;

  const openNew = () =>
    setEditingEnv({ id: '', name: '', variables: [{ key: '', value: '' }] });

  const updateVar = (i: number, field: 'key' | 'value', val: string) => {
    if (!editingEnv) return;
    const vars = editingEnv.variables.map((v, idx) =>
      idx === i ? { ...v, [field]: val } : v
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
  };

  const handleSave = () => {
    if (!editingEnv || !editingEnv.name.trim()) return;
    onSave(editingEnv);
    setEditingEnv(null);
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
                    <th>Value</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {editingEnv.variables.map((v, i) => (
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
                        <VarInput
                          placeholder="value"
                          value={v.value}
                          data-testid="env-var-value"
                          onChange={(e) =>
                            updateVar(i, 'value', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <IconBtn
                          onClick={() => removeVar(i)}
                          title="Remove variable"
                        >
                          <Icon icon={faTrash} size={12} />
                        </IconBtn>
                      </td>
                    </tr>
                  ))}
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
              <CloseBtn onClick={onClose} data-testid="env-modal-close">
                <Icon icon={faXmark} size={14} />
              </CloseBtn>
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
                    <EnvItem key={env.id} $active={isActive}>
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
