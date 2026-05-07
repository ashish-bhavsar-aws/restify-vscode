import React, { useState } from 'react';
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
    <div className="modal-overlay open" onClick={handleOverlayClick}>
      <div
        className="modal env-manager-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {editingEnv ? (
          /* ── Edit / New environment view ─────────────────── */
          <>
            <div className="modal-header">
              <h3>{editingEnv.id ? 'Edit Environment' : 'New Environment'}</h3>
              <button
                className="modal-close-btn"
                onClick={() => setEditingEnv(null)}
              >
                <Icon icon={faXmark} size={14} />
              </button>
            </div>

            <label className="modal-label">Name</label>
            <input
              className="modal-input"
              placeholder="Production"
              value={editingEnv.name}
              autoFocus
              onChange={(e) =>
                setEditingEnv({ ...editingEnv, name: e.target.value })
              }
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />

            <label className="modal-label env-vars-label">Variables</label>
            <div className="env-vars-scroll">
              <table className="env-vars-table">
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
                        <input
                          className="env-var-input"
                          placeholder="key"
                          value={v.key}
                          onChange={(e) => updateVar(i, 'key', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="env-var-input"
                          placeholder="value"
                          value={v.value}
                          onChange={(e) =>
                            updateVar(i, 'value', e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <button
                          className="btn-icon-sm"
                          onClick={() => removeVar(i)}
                          title="Remove variable"
                        >
                          <Icon icon={faTrash} size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button className="add-var-btn" onClick={addVar}>
              + Add Variable
            </button>

            <div className="modal-actions">
              <button className="btn-ghost" onClick={() => setEditingEnv(null)}>
                Back
              </button>
              <button
                className="btn"
                onClick={handleSave}
                disabled={!editingEnv.name.trim()}
              >
                Save
              </button>
            </div>
          </>
        ) : (
          /* ── List view ───────────────────────────────────── */
          <>
            <div className="modal-header">
              <h3>Manage Environments</h3>
              <button className="modal-close-btn" onClick={onClose}>
                <Icon icon={faXmark} size={14} />
              </button>
            </div>

            <button className="btn env-new-btn" onClick={openNew}>
              + New Environment
            </button>

            <div className="env-manager-list">
              {environments.length === 0 ? (
                <div className="env-empty">
                  No environments yet. Create one to use{' '}
                  <code>{'{{variable}}'}</code> in requests.
                </div>
              ) : (
                environments.map((env) => {
                  const visibleVars = env.variables.filter(
                    (v) => v.key.trim() || v.value.trim()
                  );
                  const isActive = env.id === activeEnvId;
                  return (
                    <div
                      key={env.id}
                      className={`env-manager-item ${isActive ? 'active' : ''}`}
                    >
                      <button
                        className={`env-radio-btn ${isActive ? 'active' : ''}`}
                        title={isActive ? 'Active — click to deselect' : 'Set as active'}
                        onClick={() =>
                          onSetActive(isActive ? null : env.id)
                        }
                      />
                      <div
                        className="env-item-info"
                        onClick={() => onSetActive(isActive ? null : env.id)}
                      >
                        <span className="env-item-name">{env.name}</span>
                        <span className="env-item-count">
                          {visibleVars.length} variable
                          {visibleVars.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <button
                        className="btn-icon-sm"
                        title="Edit"
                        onClick={() => setEditingEnv({ ...env })}
                      >
                        <Icon icon={faPen} size={13} />
                      </button>
                      <button
                        className="btn-icon-sm danger"
                        title="Delete"
                        onClick={() => onDelete(env.id)}
                      >
                        <Icon icon={faTrash} size={13} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
