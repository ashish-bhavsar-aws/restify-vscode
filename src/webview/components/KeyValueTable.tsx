import React, { useState, useRef } from 'react';
import { KVItem, Environment } from '../types';
import { VariableDisplay } from './VariableDisplay';
import VariableTextInput from './VariableTextInput';
import { getPredefinedHeaderNames, getHeaderSuggestions } from '../constants/predefinedHeaders';

const hasUnresolvedVariables = (
  text: string,
  variables: Array<{ key: string; value: string }>
): boolean => {
  if (!text || !text.includes('{{')) return false;
  const variableRegex = /\{\{([^}]+)}}/g;
  let match: RegExpExecArray | null;
  while ((match = variableRegex.exec(text)) !== null) {
    const varName = match[1];
    if (!variables.some((v) => v.key === varName)) {
      return true;
    }
  }
  return false;
};

interface KeyValueTableProps {
  items: KVItem[];
  addLabel?: string;
  onAdd: () => void;
  onUpdate: (index: number, field: keyof KVItem, value: any) => void;
  onRemove: (index: number) => void;
  environment?: Environment | null; // Current environment for variable resolution
  isHeaderTable?: boolean; // Show header autocomplete
}

export const KeyValueTable: React.FC<KeyValueTableProps> = ({
  items,
  addLabel = '+ Add Row',
  onAdd,
  onUpdate,
  onRemove,
  environment,
  isHeaderTable = false,
}) => {
  const variables = environment?.variables || [];
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [showKeyAutocomplete, setShowKeyAutocomplete] = useState<number | null>(null);
  const [showValueAutocomplete, setShowValueAutocomplete] = useState<number | null>(null);
  const [keyInput, setKeyInput] = useState<string>('');
  const [valueInput, setValueInput] = useState<string>('');
  const autocompleteRef = useRef<HTMLDivElement>(null);

  // Function to resolve variables in text
  const resolveVariables = (text: string): string => {
    if (!text || !text.includes('{{')) return text;
    let resolved = text;
    variables.forEach((v) => {
      const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, 'g');
      resolved = resolved.replace(regex, v.value);
    });
    return resolved;
  };

  return (
    <div className="kv-wrap">
      {items.map((item, i) => {
        const hasUnresolvedVars = hasUnresolvedVariables(item.value, variables);
        const resolvedValue = resolveVariables(item.value);
        const isFocused = focusedIndex === i;
        const showResolved = !isFocused && item.value && item.value.includes('{{');

        return (
          <div key={i} className={`kv-row ${hasUnresolvedVars ? 'has-unresolved-vars' : ''}`}>
            <div className="kv-check">
              <input
                type="checkbox"
                checked={item.enabled !== false}
                onChange={(e) => onUpdate(i, 'enabled', e.target.checked)}
              />
            </div>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                type="text"
                className="kv-input"
                placeholder="Key"
                value={item.key}
                onChange={(e) => {
                  const val = e.target.value;
                  onUpdate(i, 'key', val);
                  if (isHeaderTable) {
                    setKeyInput(val);
                    setShowKeyAutocomplete(val.length > 0 ? i : null);
                  }
                }}
                onFocus={() => {
                  if (isHeaderTable && item.key.length > 0) {
                    setShowKeyAutocomplete(i);
                    setKeyInput(item.key);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => setShowKeyAutocomplete(null), 200);
                }}
              />
              {isHeaderTable && showKeyAutocomplete === i && keyInput.length > 0 && (
                <div
                  ref={autocompleteRef}
                  className="autocomplete-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginTop: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {getPredefinedHeaderNames()
                    .filter((name) =>
                      name.toLowerCase().includes(keyInput.toLowerCase())
                    )
                    .map((name) => (
                      <div
                        key={name}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--fg)',
                        }}
                        onMouseDown={() => {
                          onUpdate(i, 'key', name);
                          setShowKeyAutocomplete(null);
                          setKeyInput(name);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {name}
                      </div>
                    ))}
                </div>
              )}
            </div>
            <div className="kv-value-wrapper" style={{ position: 'relative' }}>
              <VariableTextInput
                value={item.value}
                placeholder="Value (type {{VAR}} to use environment variables)"
                onChange={(v) => {
                  onUpdate(i, 'value', v);
                  if (isHeaderTable && item.key) {
                    setValueInput(v);
                    setShowValueAutocomplete(v.length > 0 ? i : null);
                  }
                }}
                className={`${hasUnresolvedVars ? 'has-unresolved-vars' : ''} ${item.value.includes('{{') ? (hasUnresolvedVars ? 'kv-unresolved-var' : 'kv-resolved-var') : ''}`}
                variables={variables}
              />

              {isHeaderTable && showValueAutocomplete === i && item.key && valueInput.length > 0 && (
                <div
                  className="autocomplete-dropdown"
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    background: 'var(--input-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    zIndex: 1000,
                    maxHeight: '200px',
                    overflowY: 'auto',
                    marginTop: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {getHeaderSuggestions(item.key)
                    .filter((val) =>
                      val.toLowerCase().includes(valueInput.toLowerCase())
                    )
                    .map((val) => (
                      <div
                        key={val}
                        style={{
                          padding: '8px 12px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          borderBottom: '1px solid var(--border)',
                          color: 'var(--fg)',
                        }}
                        onMouseDown={() => {
                          onUpdate(i, 'value', val);
                          setShowValueAutocomplete(null);
                          setValueInput(val);
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--hover)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        {val}
                      </div>
                    ))}
                </div>
              )}
              
            </div>
            <button className="kv-del" onClick={() => onRemove(i)}>
              ×
            </button>
          </div>
        );
      })}
      <button className="add-row-btn" onClick={onAdd}>
        {addLabel}
      </button>
    </div>
  );
};

