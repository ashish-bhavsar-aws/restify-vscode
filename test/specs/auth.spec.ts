import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
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
  getResponseText,
  clickRequestTab,
  setAuthType,
  fillBearerToken,
  fillBasicAuth,
  fillApiKeyAuth,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Authentication', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Auth] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Auth] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Auth] afterAll ===');
    await closeVSCode(app);
  });

  test('Bearer token is sent in Authorization header', async () => {
    log('--- Bearer token ---');
    await fillBearerToken(mainFrame!, 'my-secret-token-123');
    await setUrlAndSend(mainFrame!, mockUrl('/api/auth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('Bearer token in response', body.includes('my-secret-token-123'));
    expect(body).toContain('my-secret-token-123');
    await screenshot(app.window, 'auth-bearer');
  });

  test('Basic auth sends base64 encoded credentials', async () => {
    log('--- Basic auth ---');
    await fillBasicAuth(mainFrame!, 'admin', 'secret123');
    await setUrlAndSend(mainFrame!, mockUrl('/api/auth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    // Basic auth sends "Basic base64(admin:secret123)"
    const expectedB64 = Buffer.from('admin:secret123').toString('base64');
    logCheck('Basic auth header present', body.includes('Basic'));
    expect(body).toContain(expectedB64);
    await screenshot(app.window, 'auth-basic');
  });

  test('API Key in header', async () => {
    log('--- API Key header ---');
    await fillApiKeyAuth(mainFrame!, 'X-API-Key', 'my-api-key-value', 'header');
    await setUrlAndSend(mainFrame!, mockUrl('/api/auth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('API Key in response', body.includes('my-api-key-value'));
    expect(body).toContain('my-api-key-value');
    await screenshot(app.window, 'auth-apikey-header');
  });

  test('API Key in query param', async () => {
    log('--- API Key query ---');
    await fillApiKeyAuth(mainFrame!, 'api_key', 'query-key-123', 'query');
    await setUrlAndSend(mainFrame!, mockUrl('/api/auth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('API Key in query response', body.includes('query-key-123'));
    expect(body).toContain('query-key-123');
    await screenshot(app.window, 'auth-apikey-query');
  });

  test('No auth sends no Authorization header', async () => {
    log('--- No auth ---');
    await setAuthType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/auth/verify'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('No Authorization header', !body.includes('Bearer') && !body.includes('Basic'));
    await screenshot(app.window, 'auth-none');
  });
});
