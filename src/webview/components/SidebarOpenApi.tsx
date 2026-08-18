import React, { useCallback, useEffect, useState } from 'react';
import { Icon } from './FaIcon';
import {
  faMagnifyingGlass, faFileImport, faChevronRight, faUpload,
  faCode,
} from '@fortawesome/free-solid-svg-icons';
import { listNavKeyDown, METHOD_SHORT, vscodeApi } from './sidebarTypes';
import type { OpenApiViewerEndpoint, OpenApiViewerTag } from '../../core/openapiViewer';
import {
  Container, Toolbar, SearchWrapper, SearchIconWrapper, SearchInput,
  GhostButton, List, Empty, EmptyCta, EmptyIcon, EmptySub,
  Caret, CollectionCount, SubItem, SubName, MethodBadge,
} from './sidebarStyles';
import styled from 'styled-components';

/* ─── Styled components ────────────────────────────────────── */

const SpecHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 8px;
  cursor: default;
  background: color-mix(in srgb, ${({ theme }) => theme.hover} 45%, transparent);
  user-select: none;
`;

const SpecTitle = styled.span`
  flex: 1;
  font-weight: 600;
  font-size: 12px;
`;

const SpecVersion = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 10px;
  flex-shrink: 0;
`;

const SpecDescription = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  padding: 4px 8px 2px;
  line-height: 1.4;
`;

const TagSection = styled.div<{ $isDragOver?: boolean }>`
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

const TagHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  cursor: pointer;
  transition: background 0.1s;
  user-select: none;

  &:hover, &:focus-within {
    background: ${({ theme }) => theme.hover};
  }
`;

const TagName = styled.span`
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.fg};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const TagBody = styled.div``;

const EndpointRow = styled(SubItem)`
  padding-left: 24px;
`;

const DeprecatedBadge = styled.span`
  font-size: 8px;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  background: color-mix(in srgb, var(--tag-delete) 20%, transparent);
  color: var(--tag-delete);
  flex-shrink: 0;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const ImportBar = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  border-top: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
`;

/* ─── Tag Section ──────────────────────────────────────────── */

interface TagSectionProps {
  tag: OpenApiViewerTag;
  isOpen: boolean;
  onToggleTag(id: string): void;
  onLoadEndpoint(ep: OpenApiViewerEndpoint): void;
}

const TagSectionView: React.FC<TagSectionProps> = ({ tag, isOpen, onToggleTag, onLoadEndpoint }) => (
  <TagSection>
    <TagHeader onClick={() => onToggleTag(tag.name)} tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter') onToggleTag(tag.name); }}>
      <Caret $open={isOpen}><Icon icon={faChevronRight} size={10} /></Caret>
      <TagName>{tag.name}</TagName>
      <CollectionCount>{tag.endpoints.length}</CollectionCount>
    </TagHeader>
    {isOpen && (
      <TagBody>
        {tag.description && <SpecDescription>{tag.description}</SpecDescription>}
        {tag.endpoints.map(ep => (
          <EndpointRow key={ep.id} tabIndex={0}
            onClick={() => onLoadEndpoint(ep)}
            onKeyDown={e => { if (e.key === 'Enter') onLoadEndpoint(ep); }}>
            <MethodBadge $method={ep.method}>{METHOD_SHORT[ep.method] || ep.method}</MethodBadge>
            <SubName>{ep.summary || ep.path}</SubName>
            {ep.deprecated && <DeprecatedBadge>deprecated</DeprecatedBadge>}
          </EndpointRow>
        ))}
      </TagBody>
    )}
  </TagSection>
);

/* ─── Main Panel ───────────────────────────────────────────── */

interface SpecData {
  id: string;
  title: string;
  version: string;
  description?: string;
  baseUrl: string;
  tags: OpenApiViewerTag[];
  untagged: OpenApiViewerEndpoint[];
  totalEndpoints: number;
}

export const OpenApiPanel: React.FC = () => {
  const [spec, setSpec] = useState<SpecData | null>(null);
  const [search, setSearch] = useState('');
  const [expansionStates, setExpansionStates] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const d = event.data;
      if (d.command === 'setData' && d.type === 'openapi') {
        if (d.data.spec) setSpec(d.data.spec);
        if (d.data.expansionStates) setExpansionStates(d.data.expansionStates);
      }
      if (d.command === 'expansionStates') {
        setExpansionStates(d.states);
      }
    };
    window.addEventListener('message', handler);
    vscodeApi?.postMessage({ command: 'requestData' });
    return () => window.removeEventListener('message', handler);
  }, []);

  const post = useCallback((msg: any) => vscodeApi?.postMessage(msg), []);

  const handleToggleTag = useCallback((name: string) => {
    const id = `tag:${name}`;
    const next = !expansionStates[id];
    setExpansionStates(prev => ({ ...prev, [id]: next }));
    post({ command: 'toggleExpansion', id, isOpen: next });
  }, [expansionStates, post]);

  const filteredTags = (spec?.tags || []).map(tag => {
    if (!search) return tag;
    const q = search.toLowerCase();
    const filtered = tag.endpoints.filter(ep =>
      (ep.summary || '').toLowerCase().includes(q) ||
      ep.path.toLowerCase().includes(q) ||
      (ep.operationId || '').toLowerCase().includes(q) ||
      ep.method.toLowerCase().includes(q)
    );
    return { ...tag, endpoints: filtered };
  }).filter(tag => tag.endpoints.length > 0 || !search);

  const filteredUntagged = (spec?.untagged || []).filter(ep => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (ep.summary || '').toLowerCase().includes(q) ||
      ep.path.toLowerCase().includes(q) ||
      ep.method.toLowerCase().includes(q);
  });

  return (
    <Container>
      <Toolbar>
        <SearchWrapper>
          <SearchIconWrapper><Icon icon={faMagnifyingGlass} size={11} /></SearchIconWrapper>
          <SearchInput placeholder="Filter endpoints..." value={search}
            onChange={e => setSearch(e.target.value)} />
        </SearchWrapper>
      </Toolbar>

      {!spec ? (
        <Empty>
          <EmptyIcon><Icon icon={faCode} size={28} /></EmptyIcon>
          <div>No spec loaded</div>
          <EmptySub>Load an OpenAPI / Swagger spec to browse endpoints</EmptySub>
          <EmptyCta onClick={() => post({ command: 'loadSpecFile' })}>
            <Icon icon={faUpload} size={12} /> Load from File
          </EmptyCta>
        </Empty>
      ) : (
        <>
          <SpecHeader>
            <SpecTitle>{spec.title}</SpecTitle>
            <SpecVersion>v{spec.version}</SpecVersion>
          </SpecHeader>
          {spec.description && <SpecDescription>{spec.description}</SpecDescription>}
          <SpecDescription style={{ paddingBottom: 2 }}>{spec.baseUrl} · {spec.totalEndpoints} endpoint(s)</SpecDescription>
          <List onKeyDown={listNavKeyDown}>
            {filteredTags.map(tag => (
              <TagSectionView
                key={tag.name}
                tag={tag}
                isOpen={!!expansionStates[`tag:${tag.name}`]}
                onToggleTag={handleToggleTag}
                onLoadEndpoint={ep => post({ command: 'loadEndpoint', endpoint: ep })}
              />
            ))}
            {filteredUntagged.length > 0 && (
              <TagSection>
                <TagHeader tabIndex={0} onClick={() => handleToggleTag('__untagged__')}
                  onKeyDown={e => { if (e.key === 'Enter') handleToggleTag('__untagged__'); }}>
                  <Caret $open={!!expansionStates['tag:__untagged__']}><Icon icon={faChevronRight} size={10} /></Caret>
                  <TagName>Untagged</TagName>
                  <CollectionCount>{filteredUntagged.length}</CollectionCount>
                </TagHeader>
                {expansionStates['tag:__untagged__'] && (
                  <TagBody>
                    {filteredUntagged.map(ep => (
                      <EndpointRow key={ep.id} tabIndex={0}
                        onClick={() => post({ command: 'loadEndpoint', endpoint: ep })}
                        onKeyDown={e => { if (e.key === 'Enter') post({ command: 'loadEndpoint', endpoint: ep }); }}>
                        <MethodBadge $method={ep.method}>{METHOD_SHORT[ep.method] || ep.method}</MethodBadge>
                        <SubName>{ep.summary || ep.path}</SubName>
                        {ep.deprecated && <DeprecatedBadge>deprecated</DeprecatedBadge>}
                      </EndpointRow>
                    ))}
                  </TagBody>
                )}
              </TagSection>
            )}
          </List>
          <ImportBar>
            <GhostButton title="Import as collection" onClick={() => post({ command: 'importAsCollection' })}>
              <Icon icon={faFileImport} size={12} /> Import as Collection
            </GhostButton>
          </ImportBar>
        </>
      )}
    </Container>
  );
};
