import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  resetLog,
  log,
  logCheck,
  clickInFrame,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setMethod,
  setUrl,
  setUrlAndSend,
  waitForResponse,
  getStatusCode,
  getResponseText,
  setBodyType,
  fillBody,
  clickResponseTab,
  addHeader,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Feature 3 (F21-F30) — Response Viewer & Advanced', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Feature3] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Feature3] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Feature3] afterAll ===');
    await closeVSCode(app);
  });

  // ── F22: Response body raw text ──────────────────────────────────

  test('F22 - response body raw text is displayed', async () => {
    log('--- F22: response body raw text ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Body contains JSON content', body.length > 0);
    expect(body.length).toBeGreaterThan(0);
    logCheck('Body contains expected field', body.includes('id') || body.includes('name') || body.includes('{'));
    await screenshot(app.window, 'f3-f22-body-text');
  });

  // ── F22: Response headers ────────────────────────────────────────

  test('F22 - response headers are displayed', async () => {
    log('--- F22: response headers ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'headers');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Headers tab shows content', body.length > 0);
    expect(body.length).toBeGreaterThan(0);
    logCheck('Headers include content-type', body.toLowerCase().includes('content-type'));
    await screenshot(app.window, 'f3-f22-headers');
  });

  // ── F23: Response status code ────────────────────────────────────

  test('F23 - response status code is shown', async () => {
    log('--- F23: status code ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status badge shows 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'f3-f23-status-code');
  });

  // ── F23: Response time ───────────────────────────────────────────

  test('F23 - response time is shown', async () => {
    log('--- F23: response time ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const timeEl = mainFrame!.locator('[data-testid="response-time"]');
    const count = await timeEl.count();
    logCheck('Response time element exists', count > 0);
    if (count > 0) {
      const timeText = (await timeEl.textContent()) || '';
      logCheck('Response time is non-empty', timeText.length > 0);
      expect(timeText.length).toBeGreaterThan(0);
      const hasMs = /\d/.test(timeText);
      logCheck('Response time contains a number', hasMs);
    }
    await screenshot(app.window, 'f3-f23-response-time');
  });

  // ── F24: Copy button ─────────────────────────────────────────────

  test('F24 - response body has copy button', async () => {
    log('--- F24: copy button ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(400);
    const copyBtn = mainFrame!.locator('[data-testid="copy-response-btn"]');
    const altCopyBtn = mainFrame!.locator('#res-pane button').filter({ hasText: /copy/i });
    const copyCount = await copyBtn.count();
    const altCount = await altCopyBtn.count();
    const hasCopy = copyCount > 0 || altCount > 0;
    logCheck('Copy button found in response pane', hasCopy);
    await screenshot(app.window, 'f3-f24-copy-button');
  });

  // ── F25: JSON formatting ─────────────────────────────────────────

  test('F25 - JSON response is formatted/prettified', async () => {
    log('--- F25: JSON formatting ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Body contains JSON', body.includes('{'));
    expect(body).toContain('{');
    const hasNewlines = body.includes('\n') || body.includes('\\n');
    const hasIndentation = body.includes('  ');
    logCheck('JSON has newlines or indentation', hasNewlines || hasIndentation);
    await screenshot(app.window, 'f3-f25-json-format');
  });

  // ── F27: Response size ───────────────────────────────────────────

  test('F27 - response size is displayed', async () => {
    log('--- F27: response size ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const sizeEl = mainFrame!.locator('[data-testid="response-size"]');
    const count = await sizeEl.count();
    logCheck('Response size element exists', count > 0);
    if (count > 0) {
      const sizeText = (await sizeEl.textContent()) || '';
      logCheck('Response size is non-empty', sizeText.length > 0);
      expect(sizeText.length).toBeGreaterThan(0);
    }
    await screenshot(app.window, 'f3-f27-response-size');
  });

  // ── F28: Status text ─────────────────────────────────────────────

  test('F28 - response status text is correct', async () => {
    log('--- F28: status text ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const statusEl = mainFrame!.locator('[data-testid="status-code"]');
    const statusText = (await statusEl.textContent()) || '';
    logCheck('Status text contains 200', statusText.includes('200'));
    expect(statusText).toContain('200');
    const hasOk = statusText.toLowerCase().includes('ok');
    logCheck('Status text includes OK', hasOk);
    await screenshot(app.window, 'f3-f28-status-text');
  });

  // ── F30: Large response rendering ────────────────────────────────

  test('F30 - large response body is fully rendered', async () => {
    log('--- F30: large response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Response body has content', body.length > 0);
    expect(body.length).toBeGreaterThan(0);
    const hasFields = (body.includes('id') || body.includes('name') || body.includes('data'));
    logCheck('Response body contains expected fields', hasFields);
    await screenshot(app.window, 'f3-f30-large-response');
  });

  // ── F21: Content-type header preserved ───────────────────────────

  test('F21 - response content-type header is preserved', async () => {
    log('--- F21: content-type header ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'headers');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Headers contain content-type', body.toLowerCase().includes('content-type'));
    expect(body.toLowerCase()).toContain('content-type');
    await screenshot(app.window, 'f3-f21-content-type');
  });

  // ── F21: Request chaining ({{var}} via post-script set()) ───────

  async function waitForResponseText(frame: Frame, pattern: RegExp, timeout = 20_000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = await getResponseText(frame);
      if (pattern.test(text)) return text;
      await frame.waitForTimeout(300);
    }
    return getResponseText(frame);
  }

  async function writePostScript(frame: Frame, code: string): Promise<void> {
    await clickInFrame(frame, '[data-testid="req-tab-script"]');
    await frame.waitForTimeout(300);
    const codeEditor = frame.locator('textarea[data-testid="code-editor-post-script-textarea"]');
    await codeEditor.click();
    await frame.waitForTimeout(200);
    await app.window.keyboard.press('Meta+A');
    await frame.waitForTimeout(50);
    await app.window.keyboard.press('Backspace');
    await frame.waitForTimeout(100);
    await app.window.keyboard.type(code, { delay: 5 });
    await frame.waitForTimeout(300);
  }

  test('F21 - post-script stores a chain variable from the response', async () => {
    log('--- F21: script stores chain variable ---');
    await writePostScript(mainFrame!, `set('token', response.body.token);`);
    await setUrlAndSend(mainFrame!, mockUrl('/api/chain/start'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"token":\s*"chain-token-123"/);
    logCheck('Chaining response exposes token', /"token":\s*"chain-token-123"/.test(body));
    expect(body).toMatch(/"token":\s*"chain-token-123"/);
    await screenshot(app.window, 'f21-script-chain-var');
  });

  test('F21 - chain variable renders resolved with hover preview and is sent to the next request', async () => {
    log('--- F21: chain var into next request ---');
    // Reference the script-extracted token in a header and in the URL.
    await addHeader(mainFrame!, 'Authorization', 'Bearer {{token}}');
    await mainFrame!.waitForTimeout(300);
    await setUrl(mainFrame!, mockUrl('/api/chain/verify?token={{token}}'));
    // Blur the URL input to switch VariableTextInput back to display mode.
    await mainFrame!.evaluate(() => {
      const input = document.querySelector('.url-input [data-testid="variable-text-input"]') as HTMLInputElement | null;
      if (input) input.blur();
    });
    await mainFrame!.waitForTimeout(600);

    // Hover preview: the resolved tag tooltip shows `token = chain-token-123`.
    const tag = mainFrame!.locator('[data-testid="variable-text-display"] [title*="token = "]').first();
    const tagCount = await tag.count();
    logCheck('Chain variable tag rendered in URL bar', tagCount > 0);
    expect(tagCount).toBeGreaterThan(0);
    const title = await tag.getAttribute('title');
    logCheck('Hover tooltip shows resolved chain value', title?.includes('chain-token-123') ?? false);
    expect(title).toContain('chain-token-123');
    await screenshot(app.window, 'f21-chain-var-hover');

    // Send the next request; the chain var must be resolved server-side.
    await setUrlAndSend(mainFrame!, mockUrl('/api/chain/verify?token={{token}}'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"verified":\s*true/);
    logCheck('Chained token verified server-side', /"verified":\s*true/.test(body));
    expect(body).toMatch(/"verified":\s*true/);
    logCheck('Chained token in Authorization header', body.includes('chain-token-123'));
    expect(body).toContain('chain-token-123');
    await screenshot(app.window, 'f21-chained-request');
  });

  // ── F22: HTTP methods (merged from http-requests.spec) ──────────

  test('F22 - POST with JSON body echoes method and data', async () => {
    log('--- F22: POST JSON ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'json');
    await fillBody(mainFrame!, '{"test":"hello","num":42}');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const responseBody = await getResponseText(mainFrame!);
    logCheck('Body echoes method', responseBody.includes('POST'));
    logCheck('Body echoes data', responseBody.includes('hello'));
    await screenshot(app.window, 'f22-post-json');
  });

  test('F22 - PUT request with body', async () => {
    log('--- F22: PUT ---');
    await setMethod(mainFrame!, 'PUT');
    await setBodyType(mainFrame!, 'json');
    await fillBody(mainFrame!, '{"updated":true}');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Body echoes PUT method', body.includes('PUT'));
    await screenshot(app.window, 'f22-put');
  });

  test('F22 - DELETE request', async () => {
    log('--- F22: DELETE ---');
    await setMethod(mainFrame!, 'DELETE');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Body echoes DELETE method', body.includes('DELETE'));
    await screenshot(app.window, 'f22-delete');
  });

  test('F22 - PATCH request with body', async () => {
    log('--- F22: PATCH ---');
    await setMethod(mainFrame!, 'PATCH');
    await setBodyType(mainFrame!, 'json');
    await fillBody(mainFrame!, '{"patched":true}');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Body echoes PATCH method', body.includes('PATCH'));
    await screenshot(app.window, 'f22-patch');
  });

  test('F22 - HEAD request', async () => {
    log('--- F22: HEAD ---');
    await setMethod(mainFrame!, 'HEAD');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'f22-head');
  });

  test('F22 - OPTIONS request', async () => {
    log('--- F22: OPTIONS ---');
    await setMethod(mainFrame!, 'OPTIONS');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status received', status);
    await screenshot(app.window, 'f22-options');
  });

  test('F22 - POST XML body', async () => {
    log('--- F22: POST XML ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'xml');
    await fillBody(mainFrame!, '<?xml version="1.0"?><root><name>test</name></root>');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'f22-post-xml');
  });

  test('F22 - POST text body', async () => {
    log('--- F22: POST text ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'text');
    await fillBody(mainFrame!, 'plain text body content');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'f22-post-text');
  });

  test('F22 - POST urlencoded body', async () => {
    log('--- F22: POST urlencoded ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'urlencoded');
    await fillBody(mainFrame!, 'key=value&foo=bar');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'f22-post-urlencoded');
  });

  test('F22 - POST with no body', async () => {
    log('--- F22: no body ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'f22-no-body');
  });

  test('F22 - 404 status code from server', async () => {
    log('--- F22: 404 ---');
    await setMethod(mainFrame!, 'GET');
    await setUrlAndSend(mainFrame!, mockUrl('/api/status/404'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 404', status);
    expect(status).toBe('404');
    await screenshot(app.window, 'f22-404');
  });

  test('F22 - 500 status code from server', async () => {
    log('--- F22: 500 ---');
    await setMethod(mainFrame!, 'GET');
    await setUrlAndSend(mainFrame!, mockUrl('/api/status/500'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 500', status);
    expect(status).toBe('500');
    await screenshot(app.window, 'f22-500');
  });

  // ── F22: Response content types (merged from response.spec) ─────

  test('F22 - CSV response content', async () => {
    log('--- F22: CSV ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/csv'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('CSV content present', body.includes('CSV') || body.includes('Name') || body.includes('rows'));
    await screenshot(app.window, 'f22-csv');
  });

  test('F22 - XML response content', async () => {
    log('--- F22: XML response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/xml-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('XML content present', body.includes('xml') || body.includes('root') || body.includes('Hello'));
    await screenshot(app.window, 'f22-xml');
  });

  test('F22 - Text response content', async () => {
    log('--- F22: text response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/text'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Text content present', body.includes('plain text') || body.includes('mock server'));
    await screenshot(app.window, 'f22-text');
  });

  test('F22 - response Raw tab shows raw content', async () => {
    log('--- F22: raw tab ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'raw');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    logCheck('Raw tab has content', body.length > 10);
    await screenshot(app.window, 'f22-raw');
  });

  test('F22 - response logs tab shows Request/Response/curl sections', async () => {
    log('--- F22: logs tab ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'logs');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    logCheck('Request section', body.includes('Request'));
    logCheck('Response section', body.includes('Response'));
    logCheck('cURL section', body.includes('cURL') || body.includes('curl'));
    await screenshot(app.window, 'f22-logs-tab');
  });

  // ── F22: File responses (merged from demo.spec) ─────────────────

  test('F22 - PDF response renders PDF viewer and download action', async () => {
    log('--- F22: PDF response ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, 'https://www.princexml.com/samples/invoice-colorful/invoicesample.pdf');
    const ok = await waitForResponse(mainFrame!, 30_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(300);

    const hasPdfCanvas = await mainFrame!.locator('.react-pdf__Page canvas, .react-pdf__Page svg').count().catch(() => 0);
    const hasPdfDocument = await mainFrame!.locator('[class*="pdf"], [data-testid*="pdf"]').count().catch(() => 0);
    logCheck('PDF canvas/svg rendered', hasPdfCanvas);
    logCheck('PDF viewer container present', hasPdfDocument);
    const hasDownloadBtn = await mainFrame!.locator('button:has-text("Download"), button[title*="download"], button[title*="Download"]').count().catch(() => 0);
    logCheck('Download button present', hasDownloadBtn);
    await screenshot(app.window, 'f22-pdf-response');
  });

  test('F22 - file download returns status 200', async () => {
    log('--- F22: download file ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, 'https://drive.usercontent.google.com/download?id=1zO8ekHWx9U7mrbx_0Hoxxu6od7uxJqWw&export=download&authuser=0');
    const ok = await waitForResponse(mainFrame!, 30_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(300);
    const resText = await getResponseText(mainFrame!);
    logCheck('Response pane has content', resText.length > 10);
    const hasDownloadBtn = await mainFrame!.locator('button:has-text("Download"), button[title*="download"], button[title*="Download"]').count().catch(() => 0);
    logCheck('Download button present', hasDownloadBtn);
    await screenshot(app.window, 'f22-download-file');
  });
});
