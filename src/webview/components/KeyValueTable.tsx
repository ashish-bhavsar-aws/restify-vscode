import React, { useState, useRef, useCallback } from 'react';
import styled from 'styled-components';
import { KVItem, Environment } from '../types';
import { Icon, faTrash } from './FaIcon';
import VariableTextInput from './VariableTextInput';
import { getPredefinedHeaderNames, getHeaderSuggestions } from '../constants/predefinedHeaders';
import { isDynamicVariableToken } from '../../core/dynamicVarTokens';
import { getVariableSuggestions, applyVariableSuggestion } from '../../core/variableSuggestions';
import {
  parsePaste,
  parseBulkText,
  serializeBulkText,
  isBulkPaste,
} from '../../core/kvParse';

const hasUnresolvedVariables = (
  text: string,
  variables: Array<{ key: string; value: string }>
): boolean => {
  if (!text || !text.includes('{{')) return false;
  const variableRegex = /\{\{([^}]+)}}/g;
  let match: RegExpExecArray | null;
  while ((match = variableRegex.exec(text)) !== null) {
    const varName = match[1];
    if (isDynamicVariableToken(varName)) continue;
    if (!variables.some((v) => v.key === varName)) {
      return true;
    }
  }
  return false;
};

const KvWrap = styled.div`
  display: flex;
  flex-direction: column;
`;

const KvRow = styled.div<{ $hasUnresolvedVars?: boolean }>`
  display: flex;
  align-items: stretch;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  min-height: 36px;

  &:last-of-type {
    border-bottom: none;
  }

  ${({ $hasUnresolvedVars, theme }) =>
    $hasUnresolvedVars &&
    `& ${KvInput} {
      border-right-color: ${theme.error};
    }`}
`;

const KvCheck = styled.div`
  padding: 0 8px;
  flex-shrink: 0;
  display: flex;
  align-items: center;

  input[type='checkbox'] {
    cursor: pointer;
    accent-color: ${({ theme }) => theme.accent};
  }
`;

const KvInput = styled.input<{ $variant?: 'resolved-var' | 'unresolved-var' }>`
  flex: 1;
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.fg};
  padding: 8px 10px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  outline: none;
  min-width: 0;
  border-right: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  transition: background-color 0.2s, color 0.2s;

  &:last-of-type {
    border-right: none;
  }

  &:focus {
    background: color-mix(in srgb, ${({ theme }) => theme.accent} 8%, ${({ theme }) => theme.inputBg});
    color: ${({ theme }) => theme.fg};
  }

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }

  ${({ $variant, theme }) =>
    $variant === 'resolved-var' &&
    `
      border-right-color: ${theme.accent};
      color: ${theme.accent};
    `}

  ${({ $variant, theme }) =>
    $variant === 'unresolved-var' &&
    `
      border-right-color: ${theme.warning};
      color: ${theme.warning};
    `}
`;

const KvValueWrapper = styled.div`
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
  border-right: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  position: relative;
`;

const KvDel = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  color: ${({ theme }) => theme.muted};
  padding: 4px 8px;
  font-size: 15px;
  flex-shrink: 0;
  transition: color 0.1s;
  display: flex;
  align-items: center;

  &:hover {
    color: ${({ theme }) => theme.error};
  }
`;

const AddRowBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.accent};
  cursor: pointer;
  font-size: 11px;
  padding: 7px 12px;
  display: flex;
  align-items: center;
  gap: 4px;
  font-family: inherit;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }
`;

const AutocompleteDropdown = styled.div`
  position: absolute;
  z-index: 1000;
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radius};
  box-shadow: 0 4px 16px ${({ theme }) => theme.shadowSm};
  max-height: 160px;
  overflow-y: auto;
  min-width: 160px;
`;

const AutocompleteItem = styled.div<{ $active?: boolean }>`
  padding: 8px 12px;
  cursor: pointer;
  font-size: 12px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  color: ${({ theme }) => theme.fg};
  background: ${({ $active, theme }) => ($active ? theme.hover : 'transparent')};
`;

const ValueRelativeWrapper = styled.div`
  position: relative;
  flex: 1 1 0;
  min-width: 0;
  display: flex;
`;

const StyledVariableTextInput = styled(VariableTextInput)<{ $hasUnresolvedVars?: boolean; $variant?: 'resolved-var' | 'unresolved-var' }>`
  flex: 1;
  min-width: 0;

  ${({ $hasUnresolvedVars, theme }) =>
    $hasUnresolvedVars &&
    `
      & > div:first-child {
        color: ${theme.error};
        background: color-mix(in srgb, ${theme.error} 10%, transparent);
        border-right-color: ${theme.error};
      }
      & > div:first-child:focus-within {
        background: color-mix(in srgb, ${theme.error} 15%, ${theme.inputBg});
        color: ${theme.error};
      }
    `}

  ${({ $variant, theme }) =>
    $variant === 'resolved-var' &&
    `
      & > div:first-child {
        border-right-color: ${theme.accent};
        color: ${theme.accent};
      }
    `}

  ${({ $variant, theme }) =>
    $variant === 'unresolved-var' &&
    `
      & > div:first-child {
        border-right-color: ${theme.warning};
        color: ${theme.warning};
      }
    `}
`;

interface KeyValueTableProps {
  items: KVItem[];
  addLabel?: string;
  onAdd: () => void;
  onUpdate: (index: number, field: keyof KVItem, value: any) => void;
  onRemove: (index: number) => void;
  environment?: Environment | null;
  isHeaderTable?: boolean;
  /** Bulk-insert rows starting at the given index (clipboard paste). */
  onBulkInsert?: (rows: KVItem[], index: number) => void;
  /** Replace the full row list (bulk editor parse-on-change). */
  onReplaceAll?: (rows: KVItem[]) => void;
}

/** Normalized autocomplete suggestion for a KV value cell. */
type ValueSuggestionItem = {
  display: string;
  token: string;
};

const KvToolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  padding: 4px 8px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  flex-shrink: 0;
`;

const BulkToggle = styled.button<{ $active?: boolean }>`
  background: none;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.accent : theme.border)};
  color: ${({ theme, $active }) => ($active ? theme.accent : theme.muted)};
  border-radius: ${({ theme }) => theme.radius};
  font-size: 11px;
  padding: 2px 10px;
  cursor: pointer;
  font-family: inherit;

  &:hover {
    border-color: ${({ theme }) => theme.accent};
    color: ${({ theme }) => theme.accent};
  }
`;

const BulkEditor = styled.div`
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
`;

const BulkTextarea = styled.textarea`
  flex: 1;
  min-height: 160px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: ${({ theme }) => theme.fg};
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  padding: 10px 12px;
  line-height: 1.6;

  &::placeholder {
    color: ${({ theme }) => theme.muted};
  }
`;

const BulkHint = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  padding: 0 12px 6px;
  opacity: 0.8;
  flex-shrink: 0;
`;

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
  onBulkInsert,
  onReplaceAll,
}) => {
  const variables = environment?.variables || [];
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [showKeyAutocomplete, setShowKeyAutocomplete] = useState<number | null>(null);
  const [showValueAutocomplete, setShowValueAutocomplete] = useState<number | null>(null);
  const [keyInput, setKeyInput] = useState<string>('');
  const [valueInput, setValueInput] = useState<string>('');
  const [keyActiveIndex, setKeyActiveIndex] = useState<number>(-1);
  const [valueActiveIndex, setValueActiveIndex] = useState<number>(-1);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const keyDropdownRef = useRef<HTMLDivElement>(null);
  const valueDropdownRef = useRef<HTMLDivElement>(null);

  const bulkMode: 'headers' | 'params' = isHeaderTable ? 'headers' : 'params';

  const openBulkEditor = () => {
    setBulkText(serializeBulkText(items, bulkMode));
    setBulkOpen(true);
  };

  const handleBulkChange = (text: string) => {
    setBulkText(text);
    if (!onReplaceAll) return;
    const rows = parseBulkText(text, bulkMode);
    if (rows.length > 0) onReplaceAll(rows as KVItem[]);
  };

  const handleCellPaste = (e: React.ClipboardEvent<HTMLInputElement>, rowIndex: number) => {
    if (!onBulkInsert) return;
    const text = e.clipboardData?.getData('text') ?? '';
    if (!isBulkPaste(text)) return;
    e.preventDefault();
    const rows = parsePaste(text, bulkMode);
    if (rows.length > 0) onBulkInsert(rows as KVItem[], rowIndex);
  };

  const applyValueSuggestion = useCallback(
    (currentValue: string, suggestion: string): string =>
      suggestion.startsWith('{{')
        ? applyVariableSuggestion(currentValue, { token: suggestion })
        : suggestion,
    [],
  );

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
    suggestions: ValueSuggestionItem[],
    currentValue: string,
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
      onUpdate(rowIndex, 'value', applyValueSuggestion(currentValue, selected.token));
      setValueInput(selected.display);
      setShowValueAutocomplete(null);
      setValueActiveIndex(-1);
      try { (e.currentTarget as HTMLInputElement).blur(); } catch { void 0; }
    } else if (e.key === 'Escape') {
      setShowValueAutocomplete(null);
      setValueActiveIndex(-1);
    }
  }, [valueActiveIndex, onUpdate, applyValueSuggestion]);

  return (
    <KvWrap>
      {onReplaceAll && (
        <KvToolbar>
          <BulkToggle
            $active={bulkOpen}
            data-testid="kv-bulk-toggle"
            onClick={() => (bulkOpen ? setBulkOpen(false) : openBulkEditor())}
          >
            {bulkOpen ? 'Done' : 'Bulk Edit'}
          </BulkToggle>
        </KvToolbar>
      )}

      {bulkOpen ? (
        <BulkEditor>
          <BulkTextarea
            data-testid="kv-bulk-editor"
            value={bulkText}
            onChange={(e) => handleBulkChange(e.target.value)}
            placeholder={
              bulkMode === 'headers'
                ? 'Accept: application/json\nX-API-Key: abc123'
                : 'id=1\nname=Example'
            }
            spellCheck={false}
          />
          <BulkHint>
            {bulkMode === 'headers'
              ? 'One header per line as Key: Value. Changes apply live.'
              : 'One parameter per line as key=value. Changes apply live.'}
          </BulkHint>
        </BulkEditor>
      ) : (
        <>
          {items.map((item, i) => {
        const hasUnresolvedVars = hasUnresolvedVariables(item.value, variables);
        const _resolvedValue = resolveVariables(item.value);
        const isFocused = focusedIndex === i;
        const _showResolved = !isFocused && item.value && item.value.includes('{{');

        const keySuggestions = isHeaderTable && showKeyAutocomplete === i && keyInput.length > 0
          ? getPredefinedHeaderNames().filter((n) => n.toLowerCase().includes(keyInput.toLowerCase()))
          : [];
        const varSuggestions = (focusedIndex === i
          ? getVariableSuggestions(item.value, variables.map((v) => v.key))
          : []
        ).map((s) => ({ display: s.dynamic ? s.token : `{{${s.name}}}`, token: s.token }));
        const headerValueSuggestions = (isHeaderTable && showValueAutocomplete === i && item.key && valueInput.length > 0
          ? getHeaderSuggestions(item.key).filter((v) => v.toLowerCase().includes(valueInput.toLowerCase()))
          : []
        ).map((v) => ({ display: v, token: v }));
        const valueSuggestions = [...headerValueSuggestions, ...varSuggestions];

        const valueVariant = item.value.includes('{{')
          ? hasUnresolvedVars
            ? 'unresolved-var' as const
            : 'resolved-var' as const
          : undefined;

        return (
          <KvRow key={i} $hasUnresolvedVars={hasUnresolvedVars}>
            <KvCheck>
              <input
                type="checkbox"
                checked={item.enabled !== false}
                onChange={(e) => onUpdate(i, 'enabled', e.target.checked)}
              />
            </KvCheck>
            <ValueRelativeWrapper>
              <KvInput
                data-testid="kv-key-input"
                type="text"
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
                onPaste={(e) => handleCellPaste(e, i)}
              />
              {keySuggestions.length > 0 && (
                <AutocompleteDropdown
                  ref={keyDropdownRef}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '200px',
                    marginTop: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {keySuggestions.map((name, idx) => (
                    <AutocompleteItem
                      key={name}
                      $active={idx === keyActiveIndex}
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
                    </AutocompleteItem>
                  ))}
                </AutocompleteDropdown>
              )}
            </ValueRelativeWrapper>
            <KvValueWrapper data-testid="kv-value-wrapper" style={{ position: 'relative' }}>
              <StyledVariableTextInput
                value={item.value}
                placeholder="Value (type {{VAR}} to use variables, or {{$… for dynamic ones)"
                onChange={(v) => {
                  onUpdate(i, 'value', v);
                  if (isHeaderTable && item.key) {
                    setValueInput(v);
                    setValueActiveIndex(-1);
                    setShowValueAutocomplete(v.length > 0 ? i : null);
                  }
                }}
                onFocus={() => {
                  setFocusedIndex(i);
                  if (isHeaderTable && item.key && item.value.length > 0) {
                    setShowValueAutocomplete(i);
                    setValueInput(item.value);
                    setValueActiveIndex(-1);
                  }
                }}
                onBlur={() => {
                  setTimeout(() => {
                    setFocusedIndex(null);
                    setShowValueAutocomplete(null);
                    setValueActiveIndex(-1);
                  }, 200);
                }}
                $hasUnresolvedVars={hasUnresolvedVars}
                $variant={valueVariant}
                variables={variables}
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => handleValueKeyDown(e, i, valueSuggestions, item.value)}
                onPaste={(e) => handleCellPaste(e, i)}
              />

              {valueSuggestions.length > 0 && (
                <AutocompleteDropdown
                  ref={valueDropdownRef}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    maxHeight: '200px',
                    marginTop: '4px',
                    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
                  }}
                >
                  {valueSuggestions.map((val, idx) => (
                    <AutocompleteItem
                      key={`${val.token}-${idx}`}
                      data-testid="kv-suggestion-item"
                      $active={idx === valueActiveIndex}
                      onMouseDown={() => {
                        onUpdate(i, 'value', applyValueSuggestion(item.value, val.token));
                        setShowValueAutocomplete(null);
                        setValueInput(val.display);
                        setValueActiveIndex(-1);
                      }}
                      onMouseEnter={() => setValueActiveIndex(idx)}
                      onMouseLeave={() => setValueActiveIndex(-1)}
                    >
                      {val.display}
                    </AutocompleteItem>
                  ))}
                </AutocompleteDropdown>
              )}
            </KvValueWrapper>
            <KvDel onClick={() => onRemove(i)}>
              <Icon icon={faTrash} size={12} />
            </KvDel>
          </KvRow>
        );
        })}
          <AddRowBtn onClick={onAdd} data-testid="kv-add-row">
            {addLabel}
          </AddRowBtn>
        </>
      )}
    </KvWrap>
  );
};
