import React, { useEffect, useState, useRef } from 'react';
import styled, { keyframes } from 'styled-components';

interface PdfViewerProps {
  fileBase64: string;
  fileName?: string;
  post?: (msg: any) => void;
}

const spin = keyframes`
  to { transform: rotate(360deg); }
`;

const Spinner = styled.div`
  width: 32px;
  height: 32px;
  border: 3px solid color-mix(in srgb, ${({ theme }) => theme.accent} 20%, transparent);
  border-top-color: ${({ theme }) => theme.accent};
  border-radius: 50%;
  animation: ${spin} 0.7s linear infinite;
`;

const InlineSpinner = styled(Spinner)`
  width: 18px;
  height: 18px;
  border-width: 2px;
  display: inline-block;
  margin-right: 8px;
`;

const MessageWrapper = styled.div`
  padding: 12px;
  font-size: 12px;
  color: ${({ theme }) => theme.muted};
`;

const ErrorText = styled.div`
  color: ${({ theme }) => theme.error};
  margin-bottom: 6px;
`;

const PdfContainer = styled.div`
  padding: 8px;
`;

const PageWrapper = styled.div`
  margin-bottom: 12px;
`;

export const PdfViewer: React.FC<PdfViewerProps> = ({ fileBase64, post }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfLib, setPdfLib] = useState<any | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pdfLibRef = useRef<any | null>(null);
  const [width, setWidth] = useState<number>(800);

  useEffect(() => {
    try {
      post?.({ type: 'setSearchVisibility', visible: false });
    } catch { /* empty */ }
    return () => {
      try {
        post?.({ type: 'setSearchVisibility', visible: true });
      } catch { /* empty */ }
    };
  }, [post]);

  useEffect(() => {
    let mounted = true;
    let createdBlobUrl: string | null = null;
    (async () => {
      try {
        const mod = await import('react-pdf');
        try {
          const workerUri = (window as any)?.restifyPdfWorker;
          if (workerUri && mod?.pdfjs) {
            try {
              const resp = await fetch(workerUri as string);
              if (resp.ok) {
                const code = await resp.text();
                const blob = new Blob([code], { type: 'application/javascript' });
                createdBlobUrl = URL.createObjectURL(blob);
                (mod.pdfjs as any).GlobalWorkerOptions.workerSrc = createdBlobUrl;
              } else {
                (mod.pdfjs as any).GlobalWorkerOptions.workerSrc = workerUri;
              }
            } catch {
              (mod.pdfjs as any).GlobalWorkerOptions.workerSrc = workerUri;
            }
          }
        } catch {
          /* ignore */
        }
        if (mounted) {
          pdfLibRef.current = mod;
          setPdfLib(mod);
        }
      } catch (err: any) {
        console.error('Failed to load react-pdf:', err);
        if (mounted) setLibError(err?.message || String(err));
      }
    })();
    return () => {
      mounted = false;
      try {
        if (createdBlobUrl) {
          URL.revokeObjectURL(createdBlobUrl);
        }
        if (pdfLibRef.current?.pdfjs?.GlobalWorkerOptions) {
          try { pdfLibRef.current.pdfjs.GlobalWorkerOptions.workerSrc = '';} catch { /* ignore */ }
        }
      } catch { /* ignore cleanup errors */ }
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(() => setWidth(el.clientWidth || 800));
    obs.observe(el);
    setWidth(el.clientWidth || 800);
    return () => obs.disconnect();
  }, []);

  const dataUrl = `data:application/pdf;base64,${fileBase64}`;

  if (libError) {
    return (
      <MessageWrapper>
        <ErrorText>Failed to load PDF renderer: {libError}</ErrorText>
        <div>Use Download to save the PDF and open it locally.</div>
      </MessageWrapper>
    );
  }

  if (!pdfLib) {
    return (
      <MessageWrapper>
        <InlineSpinner />
        Loading PDF renderer…
      </MessageWrapper>
    );
  }

  const Document = pdfLib.Document;
  const Page = pdfLib.Page;

  return (
    <PdfContainer ref={containerRef}>
      <Document file={dataUrl} onLoadSuccess={({ numPages: n }: any) => setNumPages(n)}>
        {Array.from(new Array(numPages || 1), (_el, index) => (
          <PageWrapper key={`page_${index + 1}`}>
            <Page pageNumber={index + 1} width={Math.max(200, width - 16)} renderTextLayer={false} renderAnnotationLayer={false} />
          </PageWrapper>
        ))}
      </Document>
    </PdfContainer>
  );
};

export default PdfViewer;
