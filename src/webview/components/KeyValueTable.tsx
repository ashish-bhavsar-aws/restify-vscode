import React, { useState, useRef, useCallback } from 'react';
import { KVItem, Environment } from '../types';
import { Icon,faTrash } from './FaIcon';

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
  environment?: Environment | null;
  isHeaderTable?: boolean;
}

/** Scroll the highlighted item into view inside the dropdown container. */
function scrollItemIntoView(container: HTMLDivElement | null, activeIndex: number) {
  if (!container) return;
  const item = container.children[activeIndex] as HTMLElement | undefined;
  if (!item) return;
  const { offsetTop, offsetHeight } = item;
  const { scrollTop, clientHeight } = container;
  if (offsetTop < scrollTop) {
    container.scrollTop = offsetTop;
  } else if (offsetTop + offsetHeight > scrollTop + clientHeight) {
    container.scrollTop = offsetTop + offsetHeight - clientHeight;
  }
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
  const [focusedIndex, _setFocusedIndex] = useState<number | null>(null);
  const [showKeyAutocomplete, setShowKeyAutocomplete] = useState<number | null>(null);
  const [showValueAutocomplete, setShowValueAutocomplete] = useState<number | null>(null);
  const [keyInput, setKeyInput] = useState<string>('');
  const [valueInput, setValueInput] = useState<string>('');
  const [keyActiveIndex, setKeyActiveIndex] = useState<number>(-1);
  const [valueActiveIndex, setValueActiveIndex] = useState<number>(-1);
  const keyDropdownRef = useRef<HTMLDivElement>(null);
  const valueDropdownRef = useRef<HTMLDivElement>(null);

  const resolveVariables = (text: string): string => {
    if (!text || !text.includes('{{')) return text;
    let resolved = text;
    variables.forEach((v) => {
      const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, 'g');
      resolved = resolved.replace(regex, v.value);
    });
    return resolved;
  };

  const handleKeyKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    suggestions: string[]
  ) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(keyActiveIndex + 1, suggestions.length - 1);
      setKeyActiveIndex(next);
      scrollItemIntoView(keyDropdownRef.current, next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(keyActiveIndex - 1, 0);
      setKeyActiveIndex(next);
      scrollItemIntoView(keyDropdownRef.current, next);
    } else if (e.key === 'Enter') {
      if (!suggestions.length) return;
      e.preventDefault();
      const idx = keyActiveIndex >= 0 ? keyActiveIndex : 0;
      const selected = suggestions[idx];
      onUpdate(rowIndex, 'key', selected);
      setKeyInput(selected);
      setShowKeyAutocomplete(null);
      setKeyActiveIndex(-1);
      try { (e.currentTarget as HTMLInputElement).blur(); } catch { void 0; }
    } else if (e.key === 'Escape') {
      setShowKeyAutocomplete(null);
      setKeyActiveIndex(-1);
    }
  }, [keyActiveIndex, onUpdate]);

  const handleValueKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIndex: number,
    suggestions: string[]
  ) => {
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.min(valueActiveIndex + 1, suggestions.length - 1);
      setValueActiveIndex(next);
      scrollItemIntoView(valueDropdownRef.current, next);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.max(valueActiveIndex - 1, 0);
      setValueActiveIndex(next);
      scrollItemIntoView(valueDropdownRef.current, next);
    } else if (e.key === 'Enter') {
      if (!suggestions.length) return;
      e.preventDefault();
      const idx = valueActiveIndex >= 0 ? valueActiveIndex : 0;
      const selected = suggestions[idx];
      onUpdate(rowIndex, 'value', selected);
      setValueInput(selected);
      setShowValueAutocomplete(null);
      setValueActiveIndex(-1);
      try { (e.currentTarget as HTMLInputElement).blur(); } catch { void 0; }
    } else if (e.key === 'Escape') {
      setShowValueAutocomplete(null);
      setValueActiveIndex(-1);
    }
  }, [valueActiveIndex, onUpdate]);

  return (
    <div className="kv-wrap">
      {items.map((item, i) => {
        const hasUnresolvedVars = hasUnresolvedVariables(item.value, variables);
        const _resolvedValue = resolveVariables(item.value);
        const isFocused = focusedIndex === i;
        const _showResolved = !isFocused && item.value && item.value.includes('{{');

        const keySuggestions = isHeaderTable && showKeyAutocomplete === i && keyInput.length > 0
          ? getPredefinedHeaderNames().filter((n) => n.toLowerCase().includes(keyInput.toLowerCase()))
          : [];
        const valueSuggestions = isHeaderTable && showValueAutocomplete === i && item.key && valueInput.length > 0
          ? getHeaderSuggestions(item.key).filter((v) => v.toLowerCase().includes(valueInput.toLowerCase()))
          : [];

        return (
          <div key={i} className={`kv-row ${hasUnresolvedVars ? 'has-unresolved-vars' : ''}`}>
            <div className="kv-check">
              <input
                type="checkbox"
                checked={item.enabled !== false}
                onChange={(e) => onUpdate(i, 'enabled', e.target.checked)}
              />
            </div>
            <div style={{ position: 'relative', flex: '1 1 0', minWidth: 0, display: 'flex' }}>
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
                    setKeyActiveIndex(-1);
                    setShowKeyAutocomplete(val.length > 0 ? i : null);
                  }
                }}
                onFocus={() => {
                  if (isHeaderTable && item.key.length > 0) {
                    setShowKeyAutocomplete(i);
                    setKeyInput(item.key);
                    setKeyActiveIndex(-1);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => { setShowKeyAutocomplete(null); setKeyActiveIndex(-1); }, 200);
                }}
                onKeyDown={(e) => handleKeyKeyDown(e, i, keySuggestions)}
              />
              {keySuggestions.length > 0 && (
                <div
                  ref={keyDropdownRef}
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
                  {keySuggestions.map((name, idx) => (
                    <div
                      key={name}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--fg)',
                        background: idx === keyActiveIndex ? 'var(--hover)' : 'transparent',
                      }}
                      onMouseDown={() => {
                        onUpdate(i, 'key', name);
                        setShowKeyAutocomplete(null);
                        setKeyInput(name);
                        setKeyActiveIndex(-1);
                      }}
                      onMouseEnter={() => setKeyActiveIndex(idx)}
                      onMouseLeave={() => setKeyActiveIndex(-1)}
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
                    setValueActiveIndex(-1);
                    setShowValueAutocomplete(v.length > 0 ? i : null);
                  }
                }}
                onFocus={() => {
                  if (isHeaderTable && item.key && item.value.length > 0) {
                    setShowValueAutocomplete(i);
                    setValueInput(item.value);
                    setValueActiveIndex(-1);
                  }
                }}
                onBlur={() => { setTimeout(() => { setShowValueAutocomplete(null); setValueActiveIndex(-1); }, 200); }}
                className={`${hasUnresolvedVars ? 'has-unresolved-vars' : ''} ${item.value.includes('{{') ? (hasUnresolvedVars ? 'kv-unresolved-var' : 'kv-resolved-var') : ''}`}
                variables={variables}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => handleValueKeyDown(e, i, valueSuggestions)}
              />

              {valueSuggestions.length > 0 && (
                <div
                  ref={valueDropdownRef}
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
                  {valueSuggestions.map((val, idx) => (
                    <div
                      key={val}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        borderBottom: '1px solid var(--border)',
                        color: 'var(--fg)',
                        background: idx === valueActiveIndex ? 'var(--hover)' : 'transparent',
                      }}
                      onMouseDown={() => {
                        onUpdate(i, 'value', val);
                        setShowValueAutocomplete(null);
                        setValueInput(val);
                        setValueActiveIndex(-1);
                      }}
                      onMouseEnter={() => setValueActiveIndex(idx)}
                      onMouseLeave={() => setValueActiveIndex(-1)}
                    >
                      {val}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button className="kv-del" onClick={() => onRemove(i)}>
              <Icon icon={faTrash} size={12} />
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

