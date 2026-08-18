import React, { useState } from 'react';
import { KVItem, RequestState, Environment, OAuth2ConfigPayload, HeaderPreset } from '../types';
import { KeyValueTable } from './KeyValueTable';
import { CodeEditor } from './CodeEditor';
import { BodyCompressBar } from './BodyCompressBar';
import { mergeHeaders } from '../../core/headerPresets';
import { getScriptTemplate } from './scriptExecutor';
import { faList, faLink, faFileLines, faTerminal, faKey } from './FaIcon';
import { faListCheck } from '@fortawesome/free-solid-svg-icons';
import { AuthPanel } from './AuthPanel';
import { FormDataEditor } from './FormDataEditor';
import {
  PaneWrapper,
  TabBarContainer,
  TabItem,
  TabIcon,
  TabBadgeCount,
  TabBadgeDot,
  TabPanel,
  HeaderPresetBar,
  PresetLabel,
  PresetSelect,
  PresetNameInput,
  PresetBtn,
  ScrollContainer,
  BodyTypeBar,
  BodyTypeBtn,
  EmptyBodyText,
  BodyEditorWrap,
  FormAddBtn,
  GqlLabel,
  CodeTextarea,
  SoapMetaRow,
  SoapMetaLabel,
  SoapMetaSelect,
  ScriptTitle,
  ScriptDesc,
  Mono,
  SchemaTitle,
  SchemaDesc,
  SchemaToggleRow,
} from './requestPaneStyles';

interface RequestPaneProps {
  request: RequestState;
  onUpdate: (updates: Partial<RequestState>) => void;
  themeKind?: number;
  environment?: Environment | null;
  oauthFetching?: boolean;
  oauthStatus?: { state: 'success' | 'error' | 'none'; text?: string };
  onGetOAuthToken?: (config: OAuth2ConfigPayload) => void;
  headerPresets?: HeaderPreset[];
  onSaveHeaderPreset?: (name: string, headers: KVItem[]) => void;
  onDeleteHeaderPreset?: (id: string) => void;
  enableRequestChaining?: boolean;
}

type ReqTab = 'params' | 'headers' | 'body' | 'script' | 'auth' | 'schema';
type BodyType = RequestState['bodyType'];

/* ─── Constants ──────────────────────────────────── */

const BODY_TYPES: BodyType[] = ['none', 'json', 'form', 'urlencoded', 'text', 'xml', 'graphql'];

/* ─── RequestPane ────────────────────────────────── */

export const RequestPane: React.FC<RequestPaneProps> = ({ request, onUpdate, themeKind, environment, oauthFetching, oauthStatus, onGetOAuthToken, headerPresets = [], onSaveHeaderPreset, onDeleteHeaderPreset, enableRequestChaining = false }) => {
  const [activeTab, setActiveTab] = useState<ReqTab>('params');
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [namingPreset, setNamingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  const activeParamCount = request.queryParams.filter((p) => p.key && p.enabled !== false).length;
  const activeHeaderCount = request.headers.filter((h) => h.key && h.enabled !== false).length;
  const hasBody = request.bodyType !== 'none' && (
    (request.bodyType === 'form' && (request.formData||[]).some(f => f.key)) ||
    (request.bodyType === 'urlencoded' && (request.urlencoded||[]).some(u => u.key)) ||
    (['json','text','xml','graphql'].includes(request.bodyType) && (request.body||'').trim().length > 0)
  );
  const hasAuth = request.authType && request.authType !== 'none';
  const hasScript = (request.script || '').trim().length > 0;
  const hasSchema = (request.schema || '').trim().length > 0;

  const updateKvList = (field: 'queryParams' | 'headers' | 'formData', index: number, key: keyof KVItem, value: any) => {
    const items = [...request[field]] as KVItem[];
    items[index] = { ...items[index], [key]: value };
    onUpdate({ [field]: items });
  };

  const addKvRow = (field: 'queryParams' | 'headers') => {
    onUpdate({ [field]: [...(request[field] as KVItem[]), { key: '', value: '', enabled: true }] });
  };

  const removeKvRow = (field: 'queryParams' | 'headers', index: number) => {
    onUpdate({ [field]: (request[field] as KVItem[]).filter((_, i) => i !== index) });
  };

  const bulkInsertKvRows = (field: 'queryParams' | 'headers' | 'urlencoded', index: number, rows: KVItem[]) => {
    const current =
      field === 'urlencoded'
        ? (request.urlencoded || []) as KVItem[]
        : (request[field] as KVItem[]);
    const next = [...current];
    const target = next[index];
    // Reuse the empty target row as the first pasted row when present.
    if (target && target.key === '' && target.value === '') {
      next.splice(index, 1, ...rows);
    } else {
      next.splice(index, 0, ...rows);
    }
    onUpdate({ [field]: next });
  };

  const replaceAllKvRows = (field: 'queryParams' | 'headers' | 'urlencoded', rows: KVItem[]) => {
    onUpdate({ [field]: rows });
  };

  const selectedPreset = headerPresets.find((p) => p.id === selectedPresetId) || null;

  const applySelectedPreset = () => {
    if (!selectedPreset) return;
    onUpdate({ headers: mergeHeaders(request.headers, selectedPreset.headers) });
  };

  const saveCurrentAsPreset = () => {
    if (!onSaveHeaderPreset) return;
    setNamingPreset(true);
    setPresetName('');
  };

  const confirmSavePreset = () => {
    const name = presetName.trim();
    if (!name || !onSaveHeaderPreset) return;
    onSaveHeaderPreset(name, request.headers.filter((h) => (h.key || '').trim() !== ''));
    setNamingPreset(false);
    setPresetName('');
  };

  const deleteSelectedPreset = () => {
    if (!selectedPreset || !onDeleteHeaderPreset) return;
    onDeleteHeaderPreset(selectedPreset.id);
    setSelectedPresetId('');
  };

  const soapMeta = request.soapMeta;
  const soapOperations = soapMeta?.operations || [];
  const currentSoapOperation = soapOperations.find((op) => op.name === soapMeta?.operation) || soapOperations[0];

  const soapCtype = (isSoap12: boolean) =>
    isSoap12 ? 'application/soap+xml; charset=utf-8' : 'text/xml; charset=utf-8';

  const upsertHeader = (base: KVItem[], key: string, value: string) => {
    const headers = [...base];
    const index = headers.findIndex((h) => (h.key || '').toLowerCase() === key.toLowerCase());
    if (index >= 0) {
      headers[index] = { ...headers[index], value, enabled: true };
    } else {
      headers.push({ key, value, enabled: true });
    }
    return headers;
  };

  const handleSoapOperationChange = (operationName: string) => {
    const op = soapOperations.find((o) => o.name === operationName);
    if (!op || !soapMeta) return;
    let headers = upsertHeader(request.headers || [], 'SOAPAction', op.soapAction || '');
    headers = upsertHeader(headers, 'Content-Type', soapCtype(op.isSoap12));
    onUpdate({
      soapMeta: { ...soapMeta, operation: op.name, isSoap12: op.isSoap12, operations: soapOperations },
      body: op.body,
      headers,
    });
  };

  const handleBodyTypeChange = (bt: BodyType) => {
    const mapping: Record<BodyType, string | undefined> = {
      json: 'application/json',
      xml: 'application/xml',
      text: 'text/plain',
      urlencoded: 'application/x-www-form-urlencoded',
      form: 'multipart/form-data',
      graphql: 'application/json',
      none: undefined,
    };

    const desired = mapping[bt];

    const existingIndex = (request.headers || []).findIndex((h) => (h.key || '').toLowerCase() === 'content-type');

    if (desired && existingIndex === -1) {
      onUpdate({ bodyType: bt, headers: [...(request.headers || []), { key: 'Content-Type', value: desired, enabled: true }] });
      return;
    }

    onUpdate({ bodyType: bt });
  };

  return (
    <PaneWrapper id="req-pane">
      {/* Tab Bar */}
      <TabBarContainer id="req-tabs">
        {(['params', 'headers', 'body', 'script', 'auth', 'schema'] as ReqTab[]).filter((tab) => enableRequestChaining || tab !== 'script').map((tab) => (
          <TabItem
            key={tab}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            data-testid={`req-tab-${tab}`}
          >
            <TabIcon
              icon={
                tab === 'params' ? faList
                : tab === 'headers' ? faLink
                : tab === 'body' ? faFileLines
                : tab === 'script' ? faTerminal
                : tab === 'auth' ? faKey
                : faListCheck
              }
              size={12}
              $active={activeTab === tab}
            />
            {tab === 'schema' ? 'Schema' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'params' && activeParamCount > 0 && (
              <TabBadgeCount>{activeParamCount}</TabBadgeCount>
            )}
            {tab === 'headers' && activeHeaderCount > 0 && (
              <TabBadgeCount>{activeHeaderCount}</TabBadgeCount>
            )}
            {tab === 'body' && hasBody && (
              <TabBadgeDot />
            )}
            {tab === 'auth' && hasAuth && (
              <TabBadgeDot />
            )}
            {tab === 'script' && hasScript && (
              <TabBadgeDot />
            )}
            {tab === 'schema' && hasSchema && (
              <TabBadgeDot />
            )}
          </TabItem>
        ))}
      </TabBarContainer>

      {/* Params Tab */}
      {activeTab === 'params' && (
        <TabPanel>
          <ScrollContainer>
            <KeyValueTable
              items={request.queryParams}
              addLabel="+ Add Parameter"
              onAdd={() => addKvRow('queryParams')}
              onUpdate={(i, f, v) => updateKvList('queryParams', i, f, v)}
              onRemove={(i) => removeKvRow('queryParams', i)}
              environment={environment}
              onBulkInsert={(rows, idx) => bulkInsertKvRows('queryParams', idx, rows)}
              onReplaceAll={(rows) => replaceAllKvRows('queryParams', rows)}
            />
          </ScrollContainer>
        </TabPanel>
      )}

      {/* Headers Tab */}
      {activeTab === 'headers' && (
        <TabPanel>
          <ScrollContainer>
            <HeaderPresetBar>
              {namingPreset ? (
                <>
                  <PresetLabel>Name</PresetLabel>
                  <PresetNameInput
                    autoFocus
                    data-testid="header-preset-name-input"
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') confirmSavePreset();
                      if (e.key === 'Escape') setNamingPreset(false);
                    }}
                    placeholder="Preset name…"
                  />
                  <PresetBtn
                    data-testid="header-preset-name-save"
                    onClick={confirmSavePreset}
                    disabled={!presetName.trim()}
                  >
                    Save
                  </PresetBtn>
                  <PresetBtn data-testid="header-preset-name-cancel" onClick={() => setNamingPreset(false)}>
                    Cancel
                  </PresetBtn>
                </>
              ) : (
                <>
                  <PresetLabel>Presets</PresetLabel>
                  <PresetSelect
                    data-testid="header-preset-select"
                    value={selectedPresetId}
                    onChange={(e) => setSelectedPresetId(e.target.value)}
                  >
                    <option value="">Select preset…</option>
                    {headerPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </PresetSelect>
                  <PresetBtn
                    data-testid="header-preset-apply"
                    onClick={applySelectedPreset}
                    disabled={!selectedPreset}
                    title="Merge the selected preset into the current headers"
                  >
                    Apply
                  </PresetBtn>
                  <PresetBtn
                    data-testid="header-preset-save"
                    onClick={saveCurrentAsPreset}
                    disabled={!onSaveHeaderPreset || request.headers.every((h) => !(h.key || '').trim())}
                    title="Save the current headers as a reusable preset"
                  >
                    Save as Preset
                  </PresetBtn>
                  <PresetBtn
                    data-testid="header-preset-delete"
                    $danger
                    onClick={deleteSelectedPreset}
                    disabled={!selectedPreset || !onDeleteHeaderPreset}
                    title="Delete the selected preset"
                  >
                    Delete
                  </PresetBtn>
                </>
              )}
            </HeaderPresetBar>
            <KeyValueTable
              items={request.headers}
              addLabel="+ Add Header"
              onAdd={() => addKvRow('headers')}
              onUpdate={(i, f, v) => updateKvList('headers', i, f, v)}
              onRemove={(i) => removeKvRow('headers', i)}
              environment={environment}
              isHeaderTable={true}
              onBulkInsert={(rows, idx) => bulkInsertKvRows('headers', idx, rows)}
              onReplaceAll={(rows) => replaceAllKvRows('headers', rows)}
            />
          </ScrollContainer>
        </TabPanel>
      )}

      {/* Body Tab */}
      {activeTab === 'body' && (
        <BodyEditorWrap>
          {/* Body type selector */}
          <BodyTypeBar>
            {BODY_TYPES.map((bt) => (
              <BodyTypeBtn
                key={bt}
                data-testid={`body-type-${bt}`}
                $active={request.bodyType === bt}
                onClick={() => handleBodyTypeChange(bt)}
              >
                {bt}
              </BodyTypeBtn>
            ))}
          </BodyTypeBar>

          {request.bodyType !== 'none' && (
            <BodyCompressBar request={request} onUpdate={onUpdate} />
          )}

          {request.bodyType === 'none' && (
            <EmptyBodyText>This request has no body</EmptyBodyText>
          )}

          {(request.bodyType === 'json' || request.bodyType === 'text' || request.bodyType === 'xml') && (
            <BodyEditorWrap>
              <CodeEditor
                value={request.body}
                onChange={(body) => onUpdate({ body })}
                language={request.bodyType as 'json' | 'xml' | 'text'}
                themeKind={themeKind}
                jsonFormatMode={request.bodyFormat || 'formatted'}
                onJsonFormatModeChange={(bodyFormat) => onUpdate({ bodyFormat })}
                placeholder={request.bodyType === 'json' ? '{\n}' : 'Enter request body…'}
                variableNames={(environment?.variables || []).map((v) => v.key)}
              />
            </BodyEditorWrap>
          )}

          {request.bodyType === 'form' && (
            <FormDataEditor items={request.formData || []} onUpdate={onUpdate} />
          )}

          {request.bodyType === 'urlencoded' && (
            <ScrollContainer style={{ flex: 1 }}>
              <KeyValueTable
                items={request.urlencoded || []}
                addLabel="+ Add Parameter"
                onAdd={() => {
                  onUpdate({
                    urlencoded: [...(request.urlencoded || []), { key: '', value: '', enabled: true }],
                  });
                }}
                onUpdate={(i, f, v) => {
                  const items = [...(request.urlencoded || [])];
                  items[i] = { ...items[i], [f]: v };
                  onUpdate({ urlencoded: items });
                }}
                onRemove={(i) => {
                  onUpdate({
                    urlencoded: (request.urlencoded || []).filter((_, idx) => idx !== i),
                  });
                }}
                environment={environment}
                onBulkInsert={(rows, idx) => bulkInsertKvRows('urlencoded', idx, rows)}
                onReplaceAll={(rows) => replaceAllKvRows('urlencoded', rows)}
              />
            </ScrollContainer>
          )}

          {request.bodyType === 'graphql' && (
            <BodyEditorWrap>
              <GqlLabel>QUERY</GqlLabel>
              <CodeTextarea
                value={request.gqlQuery}
                placeholder="{ users { id name } }"
                style={{ minHeight: 0 }}
                onChange={(e) => onUpdate({ gqlQuery: e.target.value })}
              />
              <GqlLabel $hasBorderTop>VARIABLES (JSON)</GqlLabel>
              <CodeTextarea
                value={request.gqlVars}
                placeholder='{"id": 1}'
                style={{ height: 100, flexShrink: 0 }}
                onChange={(e) => onUpdate({ gqlVars: e.target.value })}
              />
            </BodyEditorWrap>
          )}

          {soapOperations.length > 0 && (
            <SoapMetaRow>
              <SoapMetaLabel>SOAP Operation</SoapMetaLabel>
              <SoapMetaSelect
                data-testid="soap-operation-select"
                value={currentSoapOperation?.name || ''}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleSoapOperationChange(e.target.value)}
              >
                {soapOperations.map((op) => (
                  <option key={op.name} value={op.name}>
                    {op.name}
                  </option>
                ))}
              </SoapMetaSelect>
            </SoapMetaRow>
          )}
        </BodyEditorWrap>
      )}

      {/* Script Tab */}
      {activeTab === 'script' && (
        <TabPanel style={{ padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <ScriptTitle>Pre-request Script (optional)</ScriptTitle>
            <div>
              <FormAddBtn
                onClick={() => onUpdate({ preScript: "// Example: vars['authToken'] = 'abc123';" })}
              >
                Insert Example
              </FormAddBtn>
            </div>
          </div>

          <ScriptDesc>
            Write JavaScript that runs before the request is sent. Use{' '}
            <Mono>set(key, value)</Mono> to store environment variables and{' '}
            <Mono>log()</Mono> to add debug logs.
          </ScriptDesc>

          <div style={{ flex: 1, overflow: 'hidden', marginBottom: 16 }}>
            <CodeEditor
              value={request.preScript || ''}
              onChange={(preScript) => onUpdate({ preScript })}
              language={'javascript'}
              themeKind={themeKind}
              placeholder={'// Example: vars[\'authToken\'] = \'abc123\';'}
              dataTestId="code-editor-pre-script"
              variableNames={(environment?.variables || []).map((v) => v.key)}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <ScriptTitle>Post-response Script (optional)</ScriptTitle>
            <div>
              <FormAddBtn
                onClick={() => onUpdate({ script: getScriptTemplate() })}
              >
                Insert Example
              </FormAddBtn>
            </div>
          </div>

          <ScriptDesc>
            Write JavaScript that runs after a response arrives. Use{' '}
            <Mono>set(key, value)</Mono> to store environment variables, and{' '}
            <Mono>log()</Mono> to add script logs.
          </ScriptDesc>

          <div style={{ flex: 1, overflow: 'hidden' }}>
            <CodeEditor
              value={request.script || ''}
              onChange={(script) => onUpdate({ script })}
              language={'javascript'}
              themeKind={themeKind}
              placeholder={'// Example: vars[\'token\'] = response.body.access_token;'}
              dataTestId="code-editor-post-script"
              variableNames={(environment?.variables || []).map((v) => v.key)}
            />
          </div>
        </TabPanel>
      )}

      {/* Auth Tab */}
      {activeTab === 'auth' && (
        <TabPanel>
          <ScrollContainer>
            <AuthPanel
              authType={request.authType}
              authData={request.authData}
              environment={environment}
              oauthFetching={oauthFetching}
              oauthStatus={oauthStatus}
              onGetOAuthToken={onGetOAuthToken}
              onAuthTypeChange={(authType) => onUpdate({ authType })}
              onAuthDataChange={(authData) => onUpdate({ authData: { ...request.authData, ...authData } })}
            />
          </ScrollContainer>
        </TabPanel>
      )}

      {/* Schema Tab (F22) */}
      {activeTab === 'schema' && (
        <TabPanel style={{ padding: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <SchemaTitle>JSON Schema (draft-07, optional)</SchemaTitle>
            <div>
              <FormAddBtn
                onClick={() => onUpdate({ schema: '{\n  "$schema": "http://json-schema.org/draft-07/schema#",\n  "type": "object",\n  "properties": {\n    "ok": { "type": "boolean" }\n  },\n  "required": ["ok"]\n}' })}
              >
                Insert Example
              </FormAddBtn>
            </div>
          </div>

          <SchemaDesc>
            Validate JSON responses against this schema after each request. The
            result appears in the response&apos;s <Mono>Schema</Mono> tab.
          </SchemaDesc>

          <div style={{ flex: 1, overflow: 'hidden', marginBottom: 16 }}>
            <CodeEditor
              value={request.schema || ''}
              onChange={(schema) => onUpdate({ schema })}
              language={'json'}
              themeKind={themeKind}
              placeholder={'{\n  "type": "object",\n  "properties": {}\n}'}
              dataTestId="schema-editor"
            />
          </div>

          <SchemaToggleRow data-testid="validate-schema-toggle">
            <input
              type="checkbox"
              checked={request.validateSchema === true}
              onChange={(e) => onUpdate({ validateSchema: e.target.checked })}
            />
            <span>Validate JSON responses against this schema</span>
          </SchemaToggleRow>
        </TabPanel>
      )}
    </PaneWrapper>
  );
};
