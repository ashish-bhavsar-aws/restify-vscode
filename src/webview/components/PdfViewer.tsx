import React, { useEffect, useState, useRef } from 'react';
// We will lazy-load `react-pdf` at runtime to keep the main bundle small.
// The worker URI is provided by the webview HTML as `window.restifyPdfWorker`.

interface PdfViewerProps {
  fileBase64: string;
  fileName?: string;
  post?: (msg: any) => void;
}

// Worker configuration will be applied after `react-pdf` is dynamically imported.

export const PdfViewer: React.FC<PdfViewerProps> = ({ fileBase64, post }) => {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pdfLib, setPdfLib] = useState<any | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>(800);
  // Notify host to hide search while PDF viewer is active (host may ignore)
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

  // Lazy-load react-pdf when component mounts and set up worker; revoke blob on unmount
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
              // Fetch the worker script via the webview URI and create a blob URL
              const resp = await fetch(workerUri as string);
              if (resp.ok) {
                const code = await resp.text();
                const blob = new Blob([code], { type: 'application/javascript' });
                createdBlobUrl = URL.createObjectURL(blob);
                (mod.pdfjs as any).GlobalWorkerOptions.workerSrc = createdBlobUrl;
              } else {
                // Fallback to using the provided URI directly
                (mod.pdfjs as any).GlobalWorkerOptions.workerSrc = workerUri;
              }
            } catch {
              // If fetching fails, fall back to direct assignment
              (mod.pdfjs as any).GlobalWorkerOptions.workerSrc = workerUri;
            }
          }
        } catch {
          /* ignore */
        }
        if (mounted) setPdfLib(mod);
      } catch (err: any) {
        console.error('Failed to load react-pdf:', err);
        if (mounted) setLibError(err?.message || String(err));
      }
    })();
    return () => {
      mounted = false;
      // Revoke created blob URL to free memory and worker resources
      try {
        if (createdBlobUrl) {
          URL.revokeObjectURL(createdBlobUrl);
        }
        // Clear workerSrc to allow GC of underlying worker
        if ((pdfLib as any)?.pdfjs?.GlobalWorkerOptions) {
          try { (pdfLib as any).pdfjs.GlobalWorkerOptions.workerSrc = '';} catch { /* ignore */ }
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
      <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
        <div style={{ color: 'var(--error, #c0392b)', marginBottom: 6 }}>Failed to load PDF renderer: {libError}</div>
        <div>Use Download to save the PDF and open it locally.</div>
      </div>
    );
  }

  if (!pdfLib) {
    return (
      <div style={{ padding: 12, fontSize: 12, color: 'var(--muted)' }}>
        <div className="spinner" style={{ width: 18, height: 18, borderWidth: 2, display: 'inline-block', marginRight: 8 }} />
        Loading PDF renderer…
      </div>
    );
  }

  const Document = pdfLib.Document;
  const Page = pdfLib.Page;

  return (
    <div ref={containerRef} style={{ padding: 8 }}>
      {/* Render PDF only (no parsed-text view) */}
        <Document file={dataUrl} onLoadSuccess={({ numPages: n }: any) => setNumPages(n)}>
          {Array.from(new Array(numPages || 1), (_el, index) => (
            <div key={`page_${index + 1}`} style={{ marginBottom: 12 }}>
              <Page pageNumber={index + 1} width={Math.max(200, width - 16)} renderTextLayer={false} renderAnnotationLayer={false} />
            </div>
          ))}
        </Document>
      
    </div>
  );
};

export default PdfViewer;
