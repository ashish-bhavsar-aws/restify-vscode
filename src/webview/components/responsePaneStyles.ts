import styled, { keyframes } from 'styled-components';

export const spin = keyframes`
  to { transform: rotate(360deg); }
`;

export const ResponsePaneWrapper = styled.div`
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-width: 0;
`;

export const ResponseEmpty = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.muted};
  gap: 10px;
`;

export const EmptyIcon = styled.div`
  font-size: 40px;
  opacity: 0.3;
`;

export const Spinner = styled.div<{ $size?: number }>`
  width: ${({ $size }) => $size ? `${$size}px` : '32px'};
  height: ${({ $size }) => $size ? `${$size}px` : '32px'};
  border: ${({ $size }) => $size ? '2px' : '3px'} solid color-mix(in srgb, ${({ theme }) => theme.accent} 20%, transparent);
  border-top-color: ${({ theme }) => theme.accent};
  border-radius: 50%;
  animation: ${spin} .7s linear infinite;
`;

export const HintText = styled.div`
  font-size: 11px;
  opacity: 0.5;
  margin-top: 8px;
  line-height: 1.8;
`;

export const HintLine = styled.span`
  display: block;
`;

export const LoadingText = styled.div`
  font-size: 12px;
`;

export const StatusBar = styled.div`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  flex-shrink: 0;
`;

export const StatusCode = styled.span<{ $statusClass: string }>`
  font-size: 13px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 4px;

  ${({ $statusClass, theme }) => {
    if ($statusClass === 'status-2xx') return `
      color: ${theme.success};
      background: color-mix(in srgb, ${theme.success} 15%, transparent);
    `;
    if ($statusClass === 'status-3xx') return `
      color: ${theme.warning};
      background: color-mix(in srgb, ${theme.warning} 15%, transparent);
    `;
    if ($statusClass === 'status-4xx' || $statusClass === 'status-5xx') return `
      color: ${theme.error};
      background: color-mix(in srgb, ${theme.error} 15%, transparent);
    `;
    return '';
  }}
`;

export const StatusText = styled.span`
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
`;

export const MetaChip = styled.span`
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
  padding: 3px 10px;
  background: ${({ theme }) => theme.surface2};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  white-space: nowrap;
`;

export const LiveChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  color: #2ea043;
  padding: 3px 10px;
  background: rgba(46, 160, 67, 0.12);
  border: 1px solid rgba(46, 160, 67, 0.4);
  border-radius: 4px;
  white-space: nowrap;
  animation: restify-live-pulse 1.6s ease-in-out infinite;
  @keyframes restify-live-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }
`;

export const ResponseActions = styled.div`
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
`;

export const CopyBtn = styled.button<{ $active?: boolean }>`
  background: ${({ $active, theme }) => $active
    ? `color-mix(in srgb, ${theme.accent} 15%, transparent)`
    : theme.surface2};
  border: 1px solid ${({ $active, theme }) => $active ? theme.accent : theme.border};
  color: ${({ $active, theme }) => $active ? theme.accent : theme.muted};
  padding: 3px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  font-family: inherit;
  transition: all .15s;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 6px;

  &:hover {
    color: ${({ $active, theme }) => $active ? theme.accent : theme.fg};
    background: ${({ $active, theme }) => $active
      ? `color-mix(in srgb, ${theme.accent} 15%, transparent)`
      : theme.hover};
  }
`;

export const TabBar = styled.div`
  display: flex;
  align-items: center;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  padding: 0 14px;
  background: color-mix(in srgb, ${({ theme }) => theme.surface} 92%, transparent);
  flex-shrink: 0;
  gap: 2px;
`;

export const TabItem = styled.div<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 8px 12px;
  font-size: 12px;
  cursor: pointer;
  color: ${({ $active, theme }) => $active ? theme.accent : theme.muted};
  border-bottom: 2px solid ${({ $active, theme }) => $active ? theme.accent : 'transparent'};
  user-select: none;
  white-space: nowrap;
  transition: all .15s;
  background: ${({ $active, theme }) => $active
    ? `color-mix(in srgb, ${theme.accent} 8%, transparent)`
    : 'transparent'};

  &:hover {
    color: ${({ $active, theme }) => $active ? theme.accent : theme.fg};
  }
`;

export const TabBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  font-size: 9px;
  min-width: 18px;
  height: 18px;
  padding: 0 4px;
  border-radius: 9px;
  margin-left: 4px;
  font-weight: 700;
  vertical-align: middle;
  line-height: 1;
`;

export const ScrollArea = styled.div`
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
`;

export const ResponseBody = styled.pre`
  flex: 1;
  background: ${({ theme }) => theme.inputBg};
  color: ${({ theme }) => theme.inputFg};
  padding: 12px 14px;
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 12px;
  line-height: 1.7;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
`;

export const RequestLogContainer = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.fg};
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const LogSection = styled.div`
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 60%, transparent);

  &:last-child {
    border-bottom: none;
  }
`;

export const LogTitle = styled.div`
  font-size: 11px;
  font-weight: 700;
  color: ${({ theme }) => theme.accent};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 6px;
`;

export const LargeResponseWarning = styled.div`
  padding: 6px 12px;
  background: color-mix(in srgb, ${({ theme }) => theme.warning} 15%, transparent);
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.warning} 30%, transparent);
  font-size: 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
`;

export const ShowRawBtn = styled.button`
  background: none;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 11px;
  color: ${({ theme }) => theme.fg};
  flex-shrink: 0;
`;

export const BodyContentWrapper = styled.div`
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
`;

export const ContentPadding = styled.div`
  padding: 8px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
`;

export const HeadersTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

export const HeadersRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.border};
`;

export const HeaderCell = styled.th`
  text-align: left;
  padding: 7px 12px;
  color: ${({ theme }) => theme.muted};
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: .5px;
`;

export const DataRowsTr = styled.tr`
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
`;

export const KeyCell = styled.td`
  padding: 6px 12px;
  font-family: monospace;
  color: ${({ theme }) => theme.accent2};
`;

export const ValueCell = styled.td`
  padding: 6px 12px;
  font-family: monospace;
  word-break: break-all;
`;

export const AttrChip = styled.span`
  display: inline-block;
  margin: 2px 4px 2px 0;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-family: monospace;
  color: ${({ theme }) => theme.muted};
  background: color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
`;

export const EmptyHint = styled.div`
  padding: 24px 16px;
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
  text-align: center;
`;

export const TabContent = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
  flex-direction: column;
`;

export const CollapsibleContainer = styled(LogSection)`
  padding: 0;
  overflow: hidden;
`;

export const CollapsibleHeader = styled.div<{ $open: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  user-select: none;
  padding: 7px 10px;
  border-bottom: ${({ $open, theme }) => $open ? `1px solid ${theme.border}` : 'none'};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 40%, transparent);
`;

export const ChevronIcon = styled.span<{ $open: boolean }>`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  transition: transform .15s;
  display: inline-block;
  transform: ${({ $open }) => $open ? 'rotate(90deg)' : 'rotate(0deg)'};
`;

export const CollapsibleTitle = styled(LogTitle)`
  margin: 0;
  flex: 1;
`;

export const SectionLabel = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 5px;
`;

export const CollapsibleBadge = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  background: ${({ theme }) => theme.border};
  border-radius: 9px;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  color: ${({ theme }) => theme.muted};
  line-height: 1;
  font-weight: 700;
`;

export const CollapsibleContent = styled.div`
  padding: 8px 10px;
`;

export const LogEntryWrapper = styled.div<{ $small: boolean; $indent: boolean; $highlight: boolean }>`
  display: flex;
  gap: 12px;
  padding: ${({ $small }) => $small ? '4px 0' : '8px 0'};
  border-bottom: ${({ $small, theme }) => $small ? 'none' : `1px solid color-mix(in srgb, ${theme.border} 40%, transparent)`};
  font-size: ${({ $small }) => $small ? 11 : 12}px;
  margin-left: ${({ $indent }) => $indent ? '20px' : '0'};
  color: ${({ $highlight, theme }) => $highlight ? theme.error : theme.fg};
`;

export const LogLabel = styled.span`
  min-width: 180px;
  color: ${({ theme }) => theme.muted};
  font-weight: 500;
`;

export const LogValue = styled.span<{ $monospace: boolean; $highlight: boolean }>`
  flex: 1;
  font-family: ${({ $monospace, theme }) => $monospace ? theme.monoFamily : 'inherit'};
  word-break: break-all;
  color: ${({ $highlight, theme }) => $highlight ? theme.error : theme.inputFg};
`;

export const MonoBlock = styled.div`
  font-family: ${({ theme }) => theme.monoFamily};
  font-size: 11px;
  padding: 6px 12px;
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 50%, transparent);
  white-space: pre-wrap;
  word-break: break-all;
`;

export const MonoPre = styled.pre`
  font-size: 11px;
  color: ${({ theme }) => theme.inputFg};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 50%, transparent);
  padding: 8px 10px;
  border-radius: 4px;
  overflow: auto;
  max-height: 150px;
  margin: 0;
  border: 1px solid ${({ theme }) => theme.border};
`;

export const ScriptRunningBox = styled.div`
  margin-top: 16px;
  padding: 10px 14px;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
  display: flex;
  align-items: center;
  gap: 8px;
`;

export const ScriptSection = styled.div<{ $success: boolean }>`
  margin-top: 16px;
  border: 1px solid ${({ $success, theme }) => $success
    ? `color-mix(in srgb, ${theme.accent} 35%, transparent)`
    : `color-mix(in srgb, ${theme.error} 35%, transparent)`};
  border-radius: 6px;
  overflow: hidden;
`;

export const ScriptHeader = styled.div<{ $success: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  background: ${({ $success, theme }) => $success
    ? `color-mix(in srgb, ${theme.accent} 12%, transparent)`
    : `color-mix(in srgb, ${theme.error} 12%, transparent)`};
  font-size: 12px;
  font-weight: 600;
`;

export const ScriptBadge = styled.span<{ $success: boolean }>`
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  background: ${({ $success, theme }) => $success ? theme.accent : theme.error};
  color: ${({ $success, theme }) => $success ? theme.accentFg : '#fff'};
`;

export const ScriptErrorBlock = styled(MonoBlock)`
  color: ${({ theme }) => theme.error};
  border-top: 1px solid ${({ theme }) => theme.border};
  padding: 8px 12px;
`;

export const ScriptNoLogsBlock = styled(MonoBlock)`
  color: ${({ theme }) => theme.muted};
  border-top: 1px solid ${({ theme }) => theme.border};
  padding: 8px 12px;
`;

export const SubHeaderRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  cursor: pointer;
  user-select: none;
  border-top: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 30%, transparent);
`;

export const SubHeaderChevron = styled.span<{ $open: boolean }>`
  font-size: 9px;
  color: ${({ theme }) => theme.muted};
  display: inline-block;
  transform: ${({ $open }) => $open ? 'rotate(90deg)' : 'rotate(0deg)'};
  transition: transform .15s;
`;

export const SubHeaderLabel = styled.span`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  text-transform: uppercase;
  letter-spacing: .5px;
  flex: 1;
`;

export const SubHeaderCount = styled.span`
  font-size: 10px;
  background: ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 1px 5px;
  color: ${({ theme }) => theme.muted};
`;

export const VarRow = styled(MonoBlock)`
  display: flex;
  gap: 12px;
`;

export const VarKey = styled.span`
  color: ${({ theme }) => theme.accent2};
  min-width: 140px;
`;

export const TestResultsWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

export const TestSummaryBar = styled.div<{ $allPassed: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ $allPassed, theme }) => $allPassed
    ? `color-mix(in srgb, ${theme.success} 10%, transparent)`
    : `color-mix(in srgb, ${theme.error} 10%, transparent)`};
  font-size: 13px;
  font-weight: 600;
`;

export const TestSummaryIcon = styled.span`
  font-size: 14px;
  font-weight: 700;
`;

export const TestSummaryText = styled.span`
  flex: 1;
`;

export const TestSummaryTotal = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
  font-weight: 400;
`;

export const TestResultRow = styled.div<{ $passed: boolean }>`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 40%, transparent);
  font-size: 12px;
`;

export const TestResultIcon = styled.span<{ $passed: boolean }>`
  font-weight: 700;
  width: 18px;
  text-align: center;
  color: ${({ $passed, theme }) => $passed ? theme.success : theme.error};
`;

export const TestResultName = styled.span`
  flex: 1;
`;

export const TestResultMsg = styled.div`
  padding: 2px 14px 8px 42px;
  font-size: 11px;
  font-family: var(--vscode-editor-font-family, monospace);
  color: ${({ theme }) => theme.error};
`;

export const SchemaPath = styled.code`
  font-family: var(--vscode-editor-font-family, monospace);
  font-size: 11px;
  color: ${({ theme }) => theme.accent};
  flex-shrink: 0;
  min-width: 120px;
`;

export const SchemaMsg = styled.span`
  flex: 1;
`;

export const NoDataText = styled.div`
  color: ${({ theme }) => theme.muted};
  font-size: 12px;
`;

export const LogLine = styled.div`
  font-family: ${({ theme }) => theme.monoFamily};
  padding: 3px 0;
  font-size: 11px;
  color: ${({ theme }) => theme.inputFg};
  word-break: break-word;
`;

export const LogTimestamp = styled.div`
  font-size: 10px;
  color: ${({ theme }) => theme.muted};
  padding-top: 6px;
`;

export const CurlCopyBtn = styled.button`
  background: ${({ theme }) => theme.accent};
  color: ${({ theme }) => theme.accentFg};
  border: none;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
`;

export const SearchablePre = styled.pre`
  margin: 0;
  padding: 12px;
  font-size: 12px;
  font-family: ${({ theme }) => theme.monoFamily};
  white-space: pre-wrap;
  word-break: break-all;
  color: ${({ theme }) => theme.fg};
`;

export const SearchMatch = styled.mark`
  background: color-mix(in srgb, ${({ theme }) => theme.accent} 50%, transparent);
  color: ${({ theme }) => theme.fg};
  border-radius: 2px;
`;

export const FilePreviewInfo = styled.div`
  padding: 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
`;

export const CsvPreviewContainer = styled.div`
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
`;

export const CsvPreviewLabel = styled.div`
  font-size: 11px;
  color: ${({ theme }) => theme.muted};
`;

export const CsvTableWrapper = styled.div`
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 6px;
`;

export const CsvTable = styled.table`
  width: max-content;
  min-width: 100%;
  border-collapse: collapse;
  font-size: 12px;
`;

export const CsvHeaderRow = styled.tr`
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: color-mix(in srgb, ${({ theme }) => theme.inputBg} 65%, transparent);
`;

export const CsvHeaderCell = styled.th`
  text-align: left;
  padding: 7px 10px;
  white-space: nowrap;
`;

export const CsvDataRow = styled.tr`
  border-bottom: 1px solid color-mix(in srgb, ${({ theme }) => theme.border} 35%, transparent);
`;

export const CsvDataCell = styled.td`
  padding: 6px 10px;
  white-space: nowrap;
`;
