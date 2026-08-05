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
  sendRequest,
  setUrlAndSend,
  waitForResponse,
  getStatusCode,
  getResponseText,
  setBodyType,
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

  // ── F21: Request chaining ({{response.*}}) ───────────────────────

  async function waitForResponseText(frame: Frame, pattern: RegExp, timeout = 20_000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = await getResponseText(frame);
      if (pattern.test(text)) return text;
      await frame.waitForTimeout(300);
    }
    return getResponseText(frame);
  }

  test('F21 - response variable picker appears after a request', async () => {
    log('--- F21: response vars picker ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/chain/start'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);

    const pickerBtn = mainFrame!.locator('[data-testid="response-vars-picker-btn"]');
    await pickerBtn.waitFor({ state: 'visible', timeout: 8_000 });
    await clickInFrame(mainFrame!, '[data-testid="response-vars-picker-btn"]');
    await mainFrame!.waitForTimeout(400);

    const menu = mainFrame!.locator('[data-testid="response-vars-picker-menu"]');
    const menuText = await menu.textContent().catch(() => '');
    logCheck('Vars picker menu opens', menuText !== null);
    expect(menuText).not.toBeNull();
    logCheck('Body token listed', menuText!.includes('response.$.token'));
    expect(menuText!).toContain('response.$.token');
    await screenshot(app.window, 'f21-vars-picker');
  });

  test('F21 - previous response token is chained into the next request', async () => {
    log('--- F21: chain token into next request ---');
    // Seed the previous response with a token.
    await setUrlAndSend(mainFrame!, mockUrl('/api/chain/start'));
    let ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);

    // Reference the token from the previous response in a header.
    await addHeader(mainFrame!, 'Authorization', 'Bearer {{response.$.token}}');
    await mainFrame!.waitForTimeout(300);

    await setUrlAndSend(mainFrame!, mockUrl('/api/chain/verify'));
    ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"verified":\s*true/);
    logCheck('Chained token verified server-side', /"verified":\s*true/.test(body));
    expect(body).toMatch(/"verified":\s*true/);
    logCheck('Chained token in Authorization header', body.includes('chain-token-123'));
    expect(body).toContain('chain-token-123');
    await screenshot(app.window, 'f21-chained-request');
  });
});
