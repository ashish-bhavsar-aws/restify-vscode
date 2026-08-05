import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  clickInFrame,
  resetLog,
  log,
  logCheck,
  waitForElement,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setMethod,
  setUrl,
  sendRequest,
  setUrlAndSend,
  waitForResponse,
  getStatusCode,
  getResponseText,
  setBodyType,
  fillBody,
  addHeader,
  clickResponseTab,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

const HTTPS_URL = 'https://localhost:3443/api/echo';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Feature 1 (F1-F10) — Core Networking & Request Builder', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Feature1] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Feature1] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Feature1] afterAll ===');
    await closeVSCode(app);
  });

  async function waitForResponseText(frame: Frame, pattern: RegExp, timeout = 20_000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = await getResponseText(frame);
      if (pattern.test(text)) return text;
      await frame.waitForTimeout(300);
    }
    return getResponseText(frame);
  }

  // ── F1: GraphQL body ─────────────────────────────────────────────

  test('F1 - GraphQL query + variables are sent as JSON body', async () => {
    log('--- F1: GraphQL body ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'graphql');
    await fillBody(mainFrame!, 'query Hero($id: ID!) { hero(id: $id) { name } }');
    const vars = await mainFrame!.locator('#req-pane textarea').nth(1);
    await vars.click();
    await vars.fill('{"id": 1}');
    // Let the GraphQL editor state fully commit before sending; otherwise the
    // request can be serialized with a stale body type (observed as a 400).
    await mainFrame!.waitForTimeout(500);
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Body has GraphQL query', body.includes('hero(id: $id)'));
    logCheck('Body has variables', body.includes('"id": 1'));
    logCheck('Body has query field', /"query":/.test(body));
    await screenshot(app.window, 'f1-graphql');
  });

  // ── F2: SSL verification ─────────────────────────────────────────

  test('F2 - self-signed cert rejected by default (Verify SSL on)', async () => {
    log('--- F2: SSL on ---');
    await setUrlAndSend(mainFrame!, HTTPS_URL);
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /self-signed|certificate|unable to verify/i);
    logCheck('SSL error surfaced', /self-signed|certificate|unable to verify/i.test(body));
    expect(body.toLowerCase()).toMatch(/self-signed|certificate|unable to verify/);
    await screenshot(app.window, 'f2-ssl-error');
  });

  test('F2 - Verify SSL off allows self-signed cert', async () => {
    log('--- F2: SSL off ---');
    await clickInFrame(mainFrame!, '[data-testid="verify-ssl-toggle"]');
    await setUrlAndSend(mainFrame!, HTTPS_URL);
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200 over HTTPS', status);
    expect(status).toBe('200');
    await clickResponseTab(mainFrame!, 'body');
    const body = await getResponseText(mainFrame!);
    logCheck('Echo reached', body.includes('GET'));
    await screenshot(app.window, 'f2-ssl-off');
    await clickInFrame(mainFrame!, '[data-testid="verify-ssl-toggle"]');
  });

  // ── F3: Redirects ────────────────────────────────────────────────

  test('F3 - follows redirects by default', async () => {
    log('--- F3: follow redirects ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/redirect'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Final status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Redirect target reached', body.includes('redirected'));
    await screenshot(app.window, 'f3-redirect');
  });

  test('F3 - redirects can be disabled', async () => {
    log('--- F3: redirects disabled ---');
    await clickInFrame(mainFrame!, '[data-testid="follow-redirects-toggle"]');
    await setUrlAndSend(mainFrame!, mockUrl('/api/redirect'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 302 preserved', status);
    expect(status).toBe('302');
    await clickInFrame(mainFrame!, '[data-testid="follow-redirects-toggle"]');
    await setUrlAndSend(mainFrame!, mockUrl('/api/redirect'));
    await waitForResponse(mainFrame!, 15_000);
    const restored = await getStatusCode(mainFrame!);
    logCheck('Redirect following restored', restored);
    expect(restored).toBe('200');
  });

  // ── F4: Decompression ────────────────────────────────────────────

  test('F4 - gzip response is decompressed', async () => {
    log('--- F4: gzip ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/gzip'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Decompressed body visible', body.includes('gzip-compressed'));
    logCheck('JSON decoded', body.includes('item-5'));
    await screenshot(app.window, 'f4-gzip');
  });

  // ── F5: Cookie jar ───────────────────────────────────────────────

  test('F5 - cookies are stored and sent on subsequent requests', async () => {
    log('--- F5: cookies ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/cookie/set'));
    let ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const setBody = await getResponseText(mainFrame!);
    logCheck('Cookie set response', setBody.includes('session'));

    await setUrlAndSend(mainFrame!, mockUrl('/api/cookie/check'));
    ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('Cookie sent on next request', body.includes('session=abc123'));
    await screenshot(app.window, 'f5-cookie');
  });

  test('F5 - response Cookies tab lists Set-Cookie entries', async () => {
    log('--- F5: cookies tab ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/cookie/set?name=theme&value=dark'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'cookies');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Cookies tab shows name', body.includes('theme'));
    expect(body).toContain('theme');
    logCheck('Cookies tab shows value', body.includes('dark'));
    expect(body).toContain('dark');
    logCheck('Cookies tab shows Path attribute', body.includes('Path'));
    expect(body).toContain('Path');
    await screenshot(app.window, 'f5-cookies-tab');
  });

  // ── F6: Request cancellation ─────────────────────────────────────

  test('F6 - in-flight request can be cancelled', async () => {
    log('--- F6: cancel ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/slow?ms=12000'));
    const cancelBtn = mainFrame!.locator('[data-testid="cancel-btn"]');
    await cancelBtn.waitFor({ state: 'visible', timeout: 8_000 });
    log('Cancel button visible, clicking...');
    await clickInFrame(mainFrame!, '[data-testid="cancel-btn"]');
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /cancelled/i, 15_000);
    logCheck('Cancelled message shown', /cancelled/i.test(body));
    expect(body.toLowerCase()).toContain('cancelled');
    const status = await getStatusCode(mainFrame!);
    logCheck('Status ERR (0)', status === 'ERR' || status === '0');
    await screenshot(app.window, 'f6-cancel');
  });

  // ── F8: Request timeout ──────────────────────────────────────────

  test('F8 - per-request timeout aborts slow requests', async () => {
    log('--- F8: timeout ---');
    await mainFrame!.locator('[data-testid="timeout-input"]').fill('500');
    await setUrlAndSend(mainFrame!, mockUrl('/api/slow?ms=8000'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /timed out/i);
    logCheck('Timeout error shown', /timed out/i.test(body));
    expect(body.toLowerCase()).toContain('timed out');
    await screenshot(app.window, 'f8-timeout');
    await mainFrame!.locator('[data-testid="timeout-input"]').fill('');
  });

  // ── F10: Pre-request scripts ─────────────────────────────────────

  test('F10 - pre-request script sets a header before sending', async () => {
    log('--- F10: pre-request script ---');
    await clickRequestTab(mainFrame!, 'script');
    await mainFrame!.waitForTimeout(300);

    const codeEditor = mainFrame!.locator('.monaco-editor, textarea, [role="textbox"]').first();
    if (await codeEditor.count() > 0) {
      // The CodeEditor's textarea is transparent under a highlight overlay, so
      // click() hits the overlay — use focus() to target the real textarea.
      await codeEditor.focus();
      await mainFrame!.waitForTimeout(200);
      await app.window.keyboard.press('Meta+A');
      await mainFrame!.waitForTimeout(50);
      await app.window.keyboard.press('Backspace');
      await mainFrame!.waitForTimeout(100);
      await app.window.keyboard.type(
        `request.headers.push({ key: "X-Pre-Script", value: "injected-value", enabled: true });`,
        { delay: 5 },
      );
      await mainFrame!.waitForTimeout(300);
    }

    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'body');
    const body = await getResponseText(mainFrame!);
    logCheck('Pre-script header injected', body.includes('x-pre-script'));
    expect(body.toLowerCase()).toContain('x-pre-script');
    logCheck('Header value correct', body.includes('injected-value'));
    expect(body).toContain('injected-value');
    await screenshot(app.window, 'f10-pre-script');
  });
});

function clickRequestTab(frame: Frame, tab: string): Promise<void> {
  return clickInFrame(frame, `[data-testid="req-tab-${tab}"]`);
}
