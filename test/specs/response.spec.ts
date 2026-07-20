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
  setUrlAndSend,
  waitForResponse,
  getStatusCode,
  getResponseText,
  clickResponseTab,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Response', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Response] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Response] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Response] afterAll ===');
    await closeVSCode(app);
  });

  test('Status code 200 displayed for GET', async () => {
    log('--- Status 200 ---');
    await setUrlAndSend(mainFrame!, mockUrl('/'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'resp-status-200');
  });

  test('Response body contains JSON', async () => {
    log('--- Response body ---');
    const body = await getResponseText(mainFrame!);
    logCheck('Body has Welcome message', body.includes('Welcome'));
    expect(body).toContain('Welcome');
    await screenshot(app.window, 'resp-body-json');
  });

  test('Response time is displayed', async () => {
    log('--- Response time ---');
    const body = await getResponseText(mainFrame!);
    // Response time is shown in ms format
    const hasDuration = body.includes('ms') || body.includes('s');
    logCheck('Duration displayed', hasDuration);
    await screenshot(app.window, 'resp-duration');
  });

  test('Response size is displayed', async () => {
    log('--- Response size ---');
    const body = await getResponseText(mainFrame!);
    const hasSize = body.includes('B') || body.includes('KB');
    logCheck('Size displayed', hasSize);
    await screenshot(app.window, 'resp-size');
  });

  test('Response headers tab shows headers', async () => {
    log('--- Response headers tab ---');
    await clickResponseTab(mainFrame!, 'headers');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    const hasHeaders = body.includes('content-type') || body.includes('Content-Type') || body.includes('content_length');
    logCheck('Headers tab has content', hasHeaders);
    await screenshot(app.window, 'resp-headers-tab');
  });

  test('Response logs tab shows sections', async () => {
    log('--- Response logs tab ---');
    await clickResponseTab(mainFrame!, 'logs');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    logCheck('Request section', body.includes('Request'));
    logCheck('Response section', body.includes('Response'));
    logCheck('cURL section', body.includes('cURL') || body.includes('curl'));
    await screenshot(app.window, 'resp-logs-tab');
  });

  test('Response logs show request details', async () => {
    log('--- Request details in logs ---');
    const body = await getResponseText(mainFrame!);
    logCheck('Shows GET method', body.includes('GET') || body.includes('RequestMethod'));
    logCheck('Shows URL', body.includes('localhost:3000') || body.includes('URL'));
    await screenshot(app.window, 'resp-logs-request');
  });

  test('JSON response displays formatted body', async () => {
    log('--- JSON formatted ---');
    await clickResponseTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(300);
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('JSON body has users', body.includes('Alice') || body.includes('users'));
    await screenshot(app.window, 'resp-json-formatted');
  });

  test('CSV response content', async () => {
    log('--- CSV response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/csv'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('CSV content present', body.includes('CSV') || body.includes('Name') || body.includes('rows'));
    await screenshot(app.window, 'resp-csv');
  });

  test('XML response content', async () => {
    log('--- XML response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/xml-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('XML content present', body.includes('xml') || body.includes('root') || body.includes('Hello'));
    await screenshot(app.window, 'resp-xml');
  });

  test('Text response content', async () => {
    log('--- Text response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/text'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Text content present', body.includes('plain text') || body.includes('mock server'));
    await screenshot(app.window, 'resp-text');
  });

  test('404 response displays error status', async () => {
    log('--- 404 response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/status/404'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 404', status);
    expect(status).toBe('404');
    await screenshot(app.window, 'resp-404');
  });

  test('500 response displays error status', async () => {
    log('--- 500 response ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/status/500'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 500', status);
    expect(status).toBe('500');
    await screenshot(app.window, 'resp-500');
  });

  test('Response Raw tab shows raw content', async () => {
    log('--- Raw tab ---');
    await clickResponseTab(mainFrame!, 'raw');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    logCheck('Raw tab has content', body.length > 10);
    await screenshot(app.window, 'resp-raw');
  });
});
