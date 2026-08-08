import React from 'react';
import styled from 'styled-components';
import { Icon } from './FaIcon';
import { faXmark } from '@fortawesome/free-solid-svg-icons';
import type { JsonPathInTextResult } from '../../core/jsonPath';

export type ResponseSearchMode = 'text' | 'jsonpath';

interface ResponseSearchBarProps {
  mode: ResponseSearchMode;
  query: string;
  searchableText: string;
  jsonPathResult: JsonPathInTextResult | null;
  onModeChange: (mode: ResponseSearchMode) => void;
  onQueryChange: (value: string) => void;
  onClose: () => void;
  inputRef: React.RefObject<HTMLInputElement>;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SearchBar = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

const SearchInput = styled.input`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  border: 1px solid ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.fg};
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-family: inherit;
  outline: none;
`;

const SearchCount = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  flex-shrink: 0;
`;

const SearchCloseBtn = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.muted};
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
`;

const SearchModeBtn = styled.button<{ $active: boolean }>`
  background: ${({ $active, theme }) => ($active ? theme.accent : 'transparent')};
  color: ${({ $active, theme }) => ($active ? theme.accentFg : theme.muted)};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
  flex-shrink: 0;
`;

const JsonPathResults = styled.div`
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  max-height: 180px;
  overflow: auto;
  flex-shrink: 0;
`;

const JsonPathResultRow = styled.div`
  display: flex;
  gap: 8px;
  padding: 3px 8px;
  font-size: 11px;
  font-family: ${({ theme }) => theme.monoFamily};
  border-bottom: 1px solid ${({ theme }) => theme.border};
  &:last-child { border-bottom: none; }
`;

const JsonPathResultPath = styled.span`
  color: ${({ theme }) => theme.accent};
  flex-shrink: 0;
`;

const JsonPathResultValue = styled.span`
  color: ${({ theme }) => theme.fg};
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const JsonPathHint = styled.div`
  padding: 3px 8px;
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

function displayValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return 'undefined';
  return serialized.length > 120 ? `${serialized.slice(0, 120)}…` : serialized;
}

export const ResponseSearchBar: React.FC<ResponseSearchBarProps> = ({
  mode,
  query,
  searchableText,
  jsonPathResult,
  onModeChange,
  onQueryChange,
  onClose,
  inputRef,
}) => {
  let count: React.ReactNode = null;
  if (mode === 'jsonpath') {
    if (jsonPathResult) {
      count = (
        <SearchCount data-testid="jsonpath-count">
          {jsonPathResult.ok
            ? `${jsonPathResult.matches.length} match${jsonPathResult.matches.length === 1 ? '' : 'es'}`
            : 'invalid'}
        </SearchCount>
      );
    }
  } else if (query) {
    let n = 0;
    try {
      n = (searchableText.match(new RegExp(escapeRegex(query), 'gi')) || []).length;
    } catch {
      n = 0;
    }
    count = <SearchCount>{n} matches</SearchCount>;
  }

  const results = mode === 'jsonpath' && query.trim() && jsonPathResult ? (
    jsonPathResult.ok ? (
      <JsonPathResults data-testid="jsonpath-results">
        {jsonPathResult.matches.slice(0, 50).map((m) => (
          <JsonPathResultRow key={m.path}>
            <JsonPathResultPath>{m.path}</JsonPathResultPath>
            <JsonPathResultValue>{displayValue(m.value)}</JsonPathResultValue>
          </JsonPathResultRow>
        ))}
        {jsonPathResult.matches.length > 50 && (
          <JsonPathHint>… and {jsonPathResult.matches.length - 50} more</JsonPathHint>
        )}
      </JsonPathResults>
    ) : (
      <JsonPathHint data-testid="jsonpath-error">{jsonPathResult.error}</JsonPathHint>
    )
  ) : null;

  return (
    <>
      <SearchBar>
        <SearchModeBtn
          $active={mode === 'text'}
          data-testid="search-mode-text"
          onClick={() => onModeChange('text')}
          title="Search response text"
        >
          Text
        </SearchModeBtn>
        <SearchModeBtn
          $active={mode === 'jsonpath'}
          data-testid="search-mode-jsonpath"
          onClick={() => onModeChange('jsonpath')}
          title="Query the JSON body with a JSONPath expression, e.g. $.users[*].name"
        >
          JSONPath
        </SearchModeBtn>
        <SearchInput
          ref={inputRef}
          type="text"
          placeholder={mode === 'jsonpath' ? 'JSONPath query, e.g. $.users[*].name' : 'Search in response...'}
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onClose()}
          data-testid="search-input"
        />
        {count}
        <SearchCloseBtn onClick={onClose}>
          <Icon icon={faXmark} size={13} />
        </SearchCloseBtn>
      </SearchBar>
      {results}
    </>
  );
};
