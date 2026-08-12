import React, { useState, useRef, useEffect } from 'react';
import { ResponseState, getStatusClass, ResponseViewerSettings, DEFAULT_RESPONSE_VIEWER } from '../types';
import { Icon } from './FaIcon';
import {
  faPaperPlane, faCopy, faTerminal, faMagnifyingGlass,
  faClipboardList,
  faLink, faFileLines, faDownload, faFileCode, faCookieBite,
  faFlaskVial, faListCheck, faFloppyDisk, faClock,
} from '@fortawesome/free-solid-svg-icons';
import { PrettyBodyViewer } from './PrettyBodyViewer';
import { ResponseSearchBar, type ResponseSearchMode } from './ResponseSearchBar';
import { queryJsonPathInText } from '../../core/jsonPath';
import { TimelineView } from './TimelineView';
import { formatSize } from '../utils/text';
import {
  LARGE_RESPONSE_THRESHOLD,
  FILE_PREVIEW_RENDER_THRESHOLD,
  getHeaderValue,
  flattenHeaders,
  parseResponseCookies,
  decodeBase64ToText,
  isLikelyJson,
  isLikelyXml,
  isLikelyHtml,
} from '../utils/responsePaneUtils';
import { FilePreview } from './ResponseFilePreview';
import { RequestLog, ScriptResultLog, buildCurlCommand } from './ResponseLogs';
import { TestResults, SchemaResults } from './ResponseResults';
import {
  ResponsePaneWrapper,
  ResponseEmpty,
  EmptyIcon,
  Spinner,
  HintText,
  HintLine,
  LoadingText,
  StatusBar,
  StatusCode,
  StatusText,
  MetaChip,
  LiveChip,
  ResponseActions,
  CopyBtn,
  TabBar,
  TabItem,
  TabBadge,
  ScrollArea,
  ResponseBody,
  LargeResponseWarning,
  ShowRawBtn,
  BodyContentWrapper,
  ContentPadding,
  HeadersTable,
  HeadersRow,
  HeaderCell,
  DataRowsTr,
  KeyCell,
  ValueCell,
  AttrChip,
  EmptyHint,
  TabContent,
} from './responsePaneStyles';

interface ResponsePaneProps {
  response: ResponseState | null;
  loading: boolean;
  request?: any;
  schemaValidation?: any;
  onDownloadFile?: (payload: { fileName: string; mimeType: string; fileBase64: string }) => void;
  onSaveResponse?: (payload: { body: string; contentType?: string; suggestName?: string }) => void;
  post?: (msg: any) => void;
  /** F24: response body viewer display options (persisted via settings). */
  viewer?: ResponseViewerSettings;
  onViewerChange?: (viewer: ResponseViewerSettings) => void;
}

type ResTab = 'body' | 'headers' | 'cookies' | 'tests' | 'schema' | 'logs' | 'raw' | 'timeline';

export const ResponsePane: React.FC<ResponsePaneProps> = ({ response, loading, request, schemaValidation, onDownloadFile, onSaveResponse, post, viewer, onViewerChange }) => {
  const [activeTab, setActiveTab] = useState<ResTab>('body');
  const [copied, setCopied] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [bodySearch, setBodySearch] = useState('');
  const [searchMode, setSearchMode] = useState<ResponseSearchMode>('text');
  const [showRawForLarge, setShowRawForLarge] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const send = post;

  useEffect(() => { if (showSearch) searchRef.current?.focus(); }, [showSearch]);
  useEffect(() => { setShowSearch(false); setBodySearch(''); setSearchMode('text'); }, [response]);

  const decodedFileText = React.useMemo(() => {
    if (!response?.isFileResponse || !response.fileBase64) return '';
    if (response.filePreviewType !== 'text' && response.filePreviewType !== 'csv') return '';
    return decodeBase64ToText(response.fileBase64);
  }, [response]);

  const hideSearchButton = !!response?.isFileResponse && (response.filePreviewType === 'pdf') && !!response.fileBase64;
  useEffect(() => {
    if (hideSearchButton) {
      setShowSearch(false);
      setBodySearch('');
    }
  }, [hideSearchButton]);

  const hideBodyTab = !!response?.isFileResponse && (response.filePreviewType === 'pdf' || response.filePreviewType === 'excel') && !!response.fileBase64;
  useEffect(() => {
    if (hideBodyTab && activeTab === 'body') {
      setActiveTab('headers');
    }
  }, [hideBodyTab, activeTab]);

  const isLargeFilePreviewBlocked = !!response?.isFileResponse && response.size > FILE_PREVIEW_RENDER_THRESHOLD;
  const isPdfPreview = !!response?.isFileResponse && response.filePreviewType === 'pdf' && !!response.fileBase64;
  const searchableText = isPdfPreview ? '' : (response?.body || decodedFileText || '');

  const jsonPathResult = React.useMemo(() => {
    if (searchMode !== 'jsonpath' || !bodySearch.trim()) return null;
    return queryJsonPathInText(response?.body || '', bodySearch.trim());
  }, [searchMode, bodySearch, response?.body]);

  const jsonPathHighlightRanges = React.useMemo(
    () => (jsonPathResult?.ok ? jsonPathResult.ranges : []),
    [jsonPathResult],
  );

  const headerRows = React.useMemo(
    () => flattenHeaders(response?.headers),
    [response?.headers],
  );

  const cookieRows = React.useMemo(
    () => parseResponseCookies(response?.headers),
    [response?.headers],
  );

  // F24: viewer display options wired to the persisted settings.
  const viewerSettings = viewer ?? DEFAULT_RESPONSE_VIEWER;
  const patchViewer = (patch: Partial<ResponseViewerSettings>) =>
    onViewerChange?.({ ...viewerSettings, ...patch });
  const viewerProps = {
    wrap: viewerSettings.wrap,
    showLineNumbers: viewerSettings.lineNumbers,
    fontSize: viewerSettings.fontSize,
    onWrapChange: (wrap: boolean) => patchViewer({ wrap }),
    onLineNumbersChange: (lineNumbers: boolean) => patchViewer({ lineNumbers }),
    onFontSizeChange: (fontSize: number) => patchViewer({ fontSize }),
  };

  const handleCopy = () => {
    if (response?.body) {
      navigator.clipboard.writeText(response.body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleCopyCurlStatus = () => {
    const curlCmd = request?.curlCommand || (request ? buildCurlCommand(request) : '');
    if (curlCmd) {
      navigator.clipboard.writeText(curlCmd);
      setCopiedCurl(true);
      setTimeout(() => setCopiedCurl(false), 1500);
    }
  };

  const handleDownloadFile = () => {
    if (!response?.fileBase64) return;
    const mimeType = response.fileMimeType || 'application/octet-stream';
    const fileName = response.fileName || 'response.bin';

    try {
      if (onDownloadFile) {
        onDownloadFile({
          fileName,
          mimeType,
          fileBase64: response.fileBase64,
        });
      } else {
        const selectedName = window.prompt('Save file as', fileName);
        if (!selectedName) return;
        const bytes = Uint8Array.from(atob(response.fileBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = selectedName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      }
      setDownloaded(true);
      setTimeout(() => setDownloaded(false), 1500);
    } catch {
      // Ignore download failures silently.
    }
  };

  const handleSaveResponse = () => {
    if (!response?.body || !onSaveResponse) return;
    const contentType = getHeaderValue(response.headers, 'content-type');
    let suggestName = '';
    const url = request?.url || '';
    const pathOnly = url.split('?')[0].replace(/\/+$/, '');
    const lastSeg = pathOnly.split('/').pop() || '';
    if (lastSeg) suggestName = lastSeg.replace(/[\\/:*?"<>|\s]+/g, '_');
    onSaveResponse({ body: response.body, contentType, suggestName });
  };

  /* loading state */
  if (loading) {
    return (
      <ResponsePaneWrapper id="res-pane">
        <ResponseEmpty>
          <Spinner />
          <LoadingText>Sending request…</LoadingText>
        </ResponseEmpty>
      </ResponsePaneWrapper>
    );
  }

  /* empty state */
  if (!response) {
    return (
      <ResponsePaneWrapper id="res-pane">
        <ResponseEmpty>
          <EmptyIcon><Icon icon={faPaperPlane} size={28} style={{ opacity: 0.5 }} /></EmptyIcon>
          <div>Send a request to see the response</div>
          <HintText>
            <HintLine>⏎ Enter — send request</HintLine>
            <HintLine>Ctrl+S — save request</HintLine>
            <HintLine>Ctrl+Enter — send request</HintLine>
          </HintText>
        </ResponseEmpty>
      </ResponsePaneWrapper>
    );
  }

  const statusClass = getStatusClass(response.status);

  return (
    <ResponsePaneWrapper id="res-pane">
      {/* Status bar */}
      <StatusBar data-testid="response-status-bar">
        <StatusCode data-testid="status-code" $statusClass={statusClass}>
          {response.status || 'ERR'}
        </StatusCode>
        <StatusText>{response.statusText}</StatusText>
        {response.isStreaming && (
          <LiveChip data-testid="live-streaming-badge" title="Response body is streaming in real time">
            ● LIVE
          </LiveChip>
        )}
        <MetaChip>{response.duration} ms</MetaChip>
        <MetaChip>{formatSize(response.size)}</MetaChip>
        {response.isFileResponse && response.fileDetectionSource === 'filename' && (
          <MetaChip title="File type inferred from filename when response headers were generic">
            Detected from filename
          </MetaChip>
        )}
        <ResponseActions>
          {request && (
            <CopyBtn onClick={handleCopyCurlStatus} title="Copy as cURL command">
              <Icon icon={faTerminal} size={12} />
              {copiedCurl ? 'cURL ✓' : 'cURL'}
            </CopyBtn>
          )}
          {response.body && !isLargeFilePreviewBlocked && (
            <CopyBtn onClick={handleCopy}>
              <Icon icon={faCopy} size={12} />
              {copied ? 'Copied ✓' : 'Copy'}
            </CopyBtn>
          )}
          {response.body && !isLargeFilePreviewBlocked && !response.isFileResponse && (
            <CopyBtn data-testid="save-response-btn" onClick={handleSaveResponse} title="Save response body to a file">
              <Icon icon={faFloppyDisk} size={12} />
              Save
            </CopyBtn>
          )}
          {!isLargeFilePreviewBlocked && !hideSearchButton && (response.body || decodedFileText || response.isFileResponse) && (
            <CopyBtn title="Search in preview" onClick={() => setShowSearch(s => !s)}>
              <Icon icon={faMagnifyingGlass} size={12} />
            </CopyBtn>
          )}
          {response.isFileResponse && response.fileBase64 && (
            <CopyBtn $active={downloaded} onClick={handleDownloadFile} title={response.fileName || 'Download file'}>
              <Icon icon={faDownload} size={12} />
              {downloaded ? 'Downloaded ✓' : 'Download'}
            </CopyBtn>
          )}
        </ResponseActions>
      </StatusBar>

      {/* Tab bar */}
      <TabBar id="res-tabs">
        {(['body', 'headers', 'cookies', 'tests', 'schema', 'logs', 'raw', 'timeline'] as ResTab[]).map((tab) => (
          <TabItem
            key={tab}
            $active={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            role="tab"
            data-testid={`res-tab-${tab}`}
          >
            <Icon
              icon={
                tab === 'body' ? faFileLines
                : tab === 'headers' ? faLink
                : tab === 'cookies' ? faCookieBite
                : tab === 'tests' ? faFlaskVial
                : tab === 'schema' ? faListCheck
                : tab === 'logs' ? faClipboardList
                : tab === 'timeline' ? faClock
                : faFileCode
              }
              size={12}
            />
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {tab === 'headers' && (
              <TabBadge>{headerRows.length}</TabBadge>
            )}
            {tab === 'cookies' && cookieRows.length > 0 && (
              <TabBadge>{cookieRows.length}</TabBadge>
            )}
            {tab === 'tests' && (() => {
              const tests: Record<string, boolean> = request?.scriptTests || {};
              const count = Object.keys(tests).length;
              if (count === 0) return null;
              const allPassed = Object.values(tests).every(Boolean);
              return (
                <TabBadge style={{ background: allPassed ? 'var(--accent, #50fa7b)' : 'var(--error, #c0392b)', color: 'var(--accent-fg, #fff)' }}>
                  {allPassed ? '✓' : '✗'} {count}
                </TabBadge>
              );
            })()}
            {tab === 'schema' && schemaValidation && (
              <TabBadge style={{
                background: schemaValidation.valid ? 'var(--accent, #50fa7b)' : 'var(--error, #c0392b)',
                color: 'var(--accent-fg, #fff)',
              }}>
                {schemaValidation.valid ? '✓' : '✗'} {schemaValidation.errorCount ?? 0}
              </TabBadge>
            )}
            {tab === 'logs' && ((request?.networkLogs?.length || 0) > 0 || (request?.scriptLogs?.length || 0) > 0) && (
              <TabBadge style={{ background: request.scriptSuccess === false ? 'var(--error, #c0392b)' : 'var(--accent, #50fa7b)', color: 'var(--accent-fg, #fff)' }}>
                {request.scriptSuccess === false ? '✗' : ((request?.networkLogs?.length || 0) + (request?.scriptLogs?.length || 0))}
              </TabBadge>
            )}
          </TabItem>
        ))}
      </TabBar>

      {/* Body tab */}
      {activeTab === 'body' && (
        <BodyContentWrapper>
          {/* Search bar */}
          {showSearch && (
            <ResponseSearchBar
              mode={searchMode}
              query={bodySearch}
              searchableText={searchableText}
              jsonPathResult={jsonPathResult}
              onModeChange={setSearchMode}
              onQueryChange={setBodySearch}
              onClose={() => { setShowSearch(false); setBodySearch(''); }}
              inputRef={searchRef}
            />
          )}
          {/* Large response warning */}
          {response.size > LARGE_RESPONSE_THRESHOLD && !showRawForLarge && (
            <LargeResponseWarning>
              <span>⚠️ Large response ({formatSize(response.size)}) — syntax highlighting may be slow.</span>
              <ShowRawBtn onClick={() => { setShowRawForLarge(true); setActiveTab('raw'); }}>Show Raw</ShowRawBtn>
            </LargeResponseWarning>
          )}
          {/* Body content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {response.isFileResponse && response.fileBase64 ? (
              <div style={{ flex: 1, overflow: 'auto' }}>
                <FilePreview response={response} search={bodySearch} post={send} />
              </div>
            ) : response.isStreaming ? (
              <ContentPadding><PrettyBodyViewer {...viewerProps} text={searchableText} language="text" search={bodySearch} /></ContentPadding>
            ) : isLikelyJson(response.body, response.headers) ? (
              <ContentPadding><PrettyBodyViewer {...viewerProps} text={response.body} language="json" search={searchMode === 'jsonpath' ? '' : bodySearch} highlightRanges={jsonPathHighlightRanges} /></ContentPadding>
            ) : isLikelyHtml(response.body, response.headers) ? (
              <ContentPadding><PrettyBodyViewer {...viewerProps} text={response.body} language="html" search={bodySearch} /></ContentPadding>
            ) : isLikelyXml(response.body, response.headers) ? (
              <ContentPadding><PrettyBodyViewer {...viewerProps} text={response.body} language="xml" search={bodySearch} /></ContentPadding>
            ) : (
              <ContentPadding><PrettyBodyViewer {...viewerProps} text={searchableText} language="text" search={bodySearch} /></ContentPadding>
            )}
          </div>
        </BodyContentWrapper>
      )}

      {/* Headers tab */}
      {activeTab === 'headers' && (
        <TabContent>
          <ScrollArea>
            <HeadersTable>
              <thead>
                <HeadersRow>
                  <HeaderCell>Header</HeaderCell>
                  <HeaderCell>Value</HeaderCell>
                </HeadersRow>
              </thead>
              <tbody>
                {headerRows.map(({ key, value }, idx) => (
                  <DataRowsTr key={`${key}-${idx}`}>
                    <KeyCell>{key}</KeyCell>
                    <ValueCell>{value}</ValueCell>
                  </DataRowsTr>
                ))}
              </tbody>
            </HeadersTable>
          </ScrollArea>
        </TabContent>
      )}

      {/* Cookies tab */}
      {activeTab === 'cookies' && (
        <TabContent>
          <ScrollArea>
            {cookieRows.length === 0 ? (
              <EmptyHint>No cookies in this response (no Set-Cookie headers).</EmptyHint>
            ) : (
              <HeadersTable>
                <thead>
                  <HeadersRow>
                    <HeaderCell>Name</HeaderCell>
                    <HeaderCell>Value</HeaderCell>
                    <HeaderCell>Attributes</HeaderCell>
                  </HeadersRow>
                </thead>
                <tbody>
                  {cookieRows.map(({ name, value, attributes }, idx) => (
                    <DataRowsTr key={`${name}-${idx}`}>
                      <KeyCell>{name}</KeyCell>
                      <ValueCell>{value}</ValueCell>
                      <ValueCell>
                        {attributes.map((attr) => (
                          <AttrChip key={`${attr.key}-${attr.value}`}>
                            {attr.key}
                            {attr.value !== 'true' ? `=${attr.value}` : ''}
                          </AttrChip>
                        ))}
                      </ValueCell>
                    </DataRowsTr>
                  ))}
                </tbody>
              </HeadersTable>
            )}
          </ScrollArea>
        </TabContent>
      )}

      {/* Tests tab */}
      {activeTab === 'tests' && (
        <TabContent>
          <ScrollArea>
            <div style={{ padding: '12px' }}>
              <TestResults request={request} />
            </div>
          </ScrollArea>
        </TabContent>
      )}

      {/* Schema Validation tab */}
      {activeTab === 'schema' && (
        <TabContent>
          <ScrollArea>
            <div style={{ padding: '12px' }}>
              <SchemaResults schemaValidation={schemaValidation} />
            </div>
          </ScrollArea>
        </TabContent>
      )}

      {/* Logs tab */}
      {activeTab === 'logs' && (
        <TabContent>
          <ScrollArea>
            <div style={{ padding: '12px' }}>
              <RequestLog response={response} request={request} />
              <ScriptResultLog request={request} />
            </div>
          </ScrollArea>
        </TabContent>
      )}

      {/* Raw tab */}
      {activeTab === 'raw' && (
        <TabContent>
          <ResponseBody>{response.body}</ResponseBody>
        </TabContent>
      )}

      {/* Timeline tab (F27) */}
      {activeTab === 'timeline' && (
        <TabContent>
          <ScrollArea>
            <TimelineView timings={response.timings} duration={response.duration} />
          </ScrollArea>
        </TabContent>
      )}
    </ResponsePaneWrapper>
  );
};
