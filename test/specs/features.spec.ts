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
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setMethod,
  setUrlAndSend,
  waitForResponse,
  getStatusCode,
  getResponseText,
  setBodyType,
  fillBody,
  clickResponseTab,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

const HTTPS_URL = 'https://localhost:3443/api/echo';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Roadmap Features (F1-F6)', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Features] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Features] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Features] afterAll ===');
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
    await screenshot(app.window, 'features-f1-graphql');
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
    await screenshot(app.window, 'features-f3-redirect');
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
    await screenshot(app.window, 'features-f4-gzip');
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
    await screenshot(app.window, 'features-f5-cookie');
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
    await screenshot(app.window, 'features-f5-cookies-tab');
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
    await screenshot(app.window, 'features-f8-timeout');
    await mainFrame!.locator('[data-testid="timeout-input"]').fill('');
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
    await screenshot(app.window, 'features-f6-cancel');
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
    await screenshot(app.window, 'features-f2-ssl-error');
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
    await screenshot(app.window, 'features-f2-ssl-off');
    await clickInFrame(mainFrame!, '[data-testid="verify-ssl-toggle"]');
  });
});
