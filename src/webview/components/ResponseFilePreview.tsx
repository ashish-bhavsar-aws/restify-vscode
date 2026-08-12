import React from 'react';
import { ResponseState } from '../types';
import { PdfViewer } from './PdfViewer';
import { escapeRegex, formatSize } from '../utils/text';
import { decodeBase64ToText, parseCsvRows, FILE_PREVIEW_RENDER_THRESHOLD } from '../utils/responsePaneUtils';
import {
  CsvDataCell,
  CsvDataRow,
  CsvHeaderCell,
  CsvHeaderRow,
  CsvPreviewContainer,
  CsvPreviewLabel,
  CsvTable,
  CsvTableWrapper,
  FilePreviewInfo,
  SearchMatch,
  SearchablePre,
} from './responsePaneStyles';

export const SearchableBody: React.FC<{ text: string; search: string }> = ({ text, search }) => {
  const parts = React.useMemo(() => {
    if (!search) return [{ text, match: false }];
    try {
      return text.split(new RegExp(`(${escapeRegex(search)})`, 'gi')).map((part, i) => ({ text: part, match: i % 2 === 1 }));
    } catch { return [{ text, match: false }]; }
  }, [text, search]);
  return (
    <SearchablePre>
      {parts.map((p, i) => p.match
        ? <SearchMatch key={i}>{p.text}</SearchMatch>
        : <React.Fragment key={i}>{p.text}</React.Fragment>)}
    </SearchablePre>
  );
};

const CsvOrExcelTable: React.FC<{
  headers: string[];
  dataRows: string[][];
  caption: string;
  search: string;
  ariaLabel: string;
}> = ({ headers, dataRows, caption, search, ariaLabel }) => {
  const filteredRows = search
    ? dataRows.filter((r) => r.join(' ').toLowerCase().includes(search.toLowerCase()))
    : dataRows;
  const cappedRows = filteredRows.slice(0, 300);
  return (
    <CsvPreviewContainer>
      <CsvPreviewLabel>
        {caption}: {filteredRows.length} rows {filteredRows.length > cappedRows.length ? `(showing first ${cappedRows.length})` : ''} {search && `(filtered)`}
      </CsvPreviewLabel>
      <CsvTableWrapper>
        <CsvTable role="grid" aria-label={ariaLabel}>
          <thead>
            <CsvHeaderRow>
              {headers.map((h, idx) => (
                <CsvHeaderCell key={`${h}-${idx}`}>
                  {h || `Column ${idx + 1}`}
                </CsvHeaderCell>
              ))}
            </CsvHeaderRow>
          </thead>
          <tbody>
            {cappedRows.map((r, rIdx) => (
              <CsvDataRow key={rIdx}>
                {headers.map((_, cIdx) => (
                  <CsvDataCell key={`${rIdx}-${cIdx}`}>
                    {r[cIdx] || ''}
                  </CsvDataCell>
                ))}
              </CsvDataRow>
            ))}
          </tbody>
        </CsvTable>
      </CsvTableWrapper>
    </CsvPreviewContainer>
  );
};

export const FilePreview: React.FC<{ response: ResponseState; search: string; post?: (msg: any) => void }> = ({ response, search, post }) => {
  const previewType = response.filePreviewType || 'none';
  const fileName = response.fileName || 'response.bin';

  const decodedText = React.useMemo(() => {
    if (!response.fileBase64) return '';
    if (previewType !== 'text' && previewType !== 'csv') return '';
    return decodeBase64ToText(response.fileBase64);
  }, [response.fileBase64, previewType]);

  const [excelData, setExcelData] = React.useState<{ error: string; rows: string[][]; sheetName: string } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    let workbook: any = null;
    if (previewType !== 'excel' || !response.fileBase64) {
      setExcelData(null);
      return undefined;
    }

    (async () => {
      try {
        const binary = Uint8Array.from(atob(response.fileBase64!), (c) => c.charCodeAt(0));
        const mod = await import('exceljs');
        const ExcelJSLib = (mod && (mod as any).default) ? (mod as any).default : mod;
        workbook = new ExcelJSLib.Workbook();
        await workbook.xlsx.load(binary.buffer as any);
        const ws = workbook.worksheets[0];
        if (!ws) {
          if (!cancelled) setExcelData({ error: 'No worksheet found in file', rows: [], sheetName: '' });
          return;
        }
        const rows: string[][] = [];
        ws.eachRow((row: any) => {
          const vals = (row.values as any[]).slice(1).map((v) => (v == null ? '' : String(v)));
          rows.push(vals);
        });
        if (!cancelled) setExcelData({ error: '', rows, sheetName: ws.name || '' });
      } catch {
        if (!cancelled) setExcelData({ error: 'Unable to parse Excel file for preview', rows: [], sheetName: '' });
      } finally {
        try { workbook = null; } catch { /* ignore */ }
      }
    })();

    return () => {
      cancelled = true;
      try { setExcelData(null); } catch { /* ignore */ }
      try { workbook = null; } catch { /* ignore */ }
    };
  }, [previewType, response.fileBase64]);

  if (response.size > FILE_PREVIEW_RENDER_THRESHOLD) {
    return (
      <FilePreviewInfo>
        Preview skipped for large file ({formatSize(response.size)}). Preview limit is 5 MB. Use Download to save {fileName}.
      </FilePreviewInfo>
    );
  }

  if (previewType === 'pdf' && response.fileBase64) {
    return <PdfViewer fileBase64={response.fileBase64} fileName={fileName} post={post} />;
  }

  if ((previewType === 'text' || previewType === 'csv') && decodedText) {
    if (previewType === 'csv') {
      const rows = parseCsvRows(decodedText);
      if (rows.length > 0) {
        const headers = rows[0];
        const dataRows = rows.slice(1);
        return <CsvOrExcelTable headers={headers} dataRows={dataRows} caption="CSV Preview" search={search} ariaLabel="CSV data (read-only)" />;
      }
    }

    if (search) return <SearchableBody text={decodedText} search={search} />;
    return (
      <SearchablePre role="document" aria-label="File preview (read-only)">
        {decodedText}
      </SearchablePre>
    );
  }

  if (previewType === 'excel') {
    if (!excelData) {
      return (
        <FilePreviewInfo>
          Excel file is empty. Use Download to open {fileName}.
        </FilePreviewInfo>
      );
    }

    if (excelData.error) {
      return (
        <FilePreviewInfo>
          {excelData.error}. Use Download to open {fileName} in your spreadsheet app.
        </FilePreviewInfo>
      );
    }

    if (!excelData.rows.length) {
      return (
        <FilePreviewInfo>
          Excel file is empty. Use Download to open {fileName}.
        </FilePreviewInfo>
      );
    }

    const headers = excelData.rows[0] || [];
    const dataRows = excelData.rows.slice(1);
    return <CsvOrExcelTable headers={headers} dataRows={dataRows} caption={`Excel Preview (${excelData.sheetName})`} search={search} ariaLabel="Excel data (read-only)" />;
  }

  return (
    <FilePreviewInfo>
      Binary file response detected ({fileName}). Use Download to save and open it locally.
    </FilePreviewInfo>
  );
};
