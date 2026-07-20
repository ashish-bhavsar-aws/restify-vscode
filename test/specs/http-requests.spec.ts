import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  findMainPanelFrame,
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
  getStatusCode,
  getResponseText,
  setBodyType,
  fillBody,
  clickResponseTab,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('HTTP Requests', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [HTTP] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [HTTP] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [HTTP] afterAll ===');
    await closeVSCode(app);
  });

  test('GET request returns 200', async () => {
    log('--- GET request ---');
    const resp = await getResponseText(mainFrame!);
    await setUrlAndSend(mainFrame!, mockUrl('/'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'http-get');
  });

  test('POST JSON body', async () => {
    log('--- POST JSON ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'json');
    await fillBody(mainFrame!, '{"test":"hello","num":42}');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    const responseBody = await getResponseText(mainFrame!);
    log(`  Status: ${status}`);
    log(`  Response (first 500 chars): ${responseBody.substring(0, 500)}`);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    logCheck('Body contains method', responseBody.includes('POST'));
    logCheck('Body contains test data', responseBody.includes('hello'));
    await screenshot(app.window, 'http-post-json');
  });

  test('PUT request with body', async () => {
    log('--- PUT request ---');
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
    logCheck('Body has PUT method', body.includes('PUT'));
    await screenshot(app.window, 'http-put');
  });

  test('DELETE request', async () => {
    log('--- DELETE request ---');
    await setMethod(mainFrame!, 'DELETE');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    const body = await getResponseText(mainFrame!);
    logCheck('Body has DELETE method', body.includes('DELETE'));
    await screenshot(app.window, 'http-delete');
  });

  test('PATCH request with body', async () => {
    log('--- PATCH request ---');
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
    logCheck('Body has PATCH method', body.includes('PATCH'));
    await screenshot(app.window, 'http-patch');
  });

  test('HEAD request', async () => {
    log('--- HEAD request ---');
    await setMethod(mainFrame!, 'HEAD');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'http-head');
  });

  test('OPTIONS request', async () => {
    log('--- OPTIONS request ---');
    await setMethod(mainFrame!, 'OPTIONS');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status received', status);
    await screenshot(app.window, 'http-options');
  });

  test('POST XML body', async () => {
    log('--- POST XML ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'xml');
    await fillBody(mainFrame!, '<?xml version="1.0"?><root><name>test</name></root>');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'http-post-xml');
  });

  test('POST text body', async () => {
    log('--- POST text ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'text');
    await fillBody(mainFrame!, 'plain text body content');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'http-post-text');
  });

  test('POST urlencoded body', async () => {
    log('--- POST urlencoded ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'urlencoded');
    await fillBody(mainFrame!, 'key=value&foo=bar');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'http-post-urlencoded');
  });

  test('Request with no body', async () => {
    log('--- No body ---');
    await setMethod(mainFrame!, 'POST');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');
    await screenshot(app.window, 'http-no-body');
  });

  test('404 status code from server', async () => {
    log('--- 404 status ---');
    await setMethod(mainFrame!, 'GET');
    await setUrlAndSend(mainFrame!, mockUrl('/api/status/404'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 404', status);
    expect(status).toBe('404');
    await screenshot(app.window, 'http-404');
  });

  test('500 status code from server', async () => {
    log('--- 500 status ---');
    await setMethod(mainFrame!, 'GET');
    await setUrlAndSend(mainFrame!, mockUrl('/api/status/500'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 500', status);
    expect(status).toBe('500');
    await screenshot(app.window, 'http-500');
  });

  test('Response headers tab shows content', async () => {
    log('--- Response headers tab ---');
    await setMethod(mainFrame!, 'GET');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await clickResponseTab(mainFrame!, 'headers');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    logCheck('Headers tab has content', body.includes('content-type') || body.includes('Content-Type'));
    await screenshot(app.window, 'http-response-headers');
  });

  test('Response logs tab shows sections', async () => {
    log('--- Response logs tab ---');
    await clickResponseTab(mainFrame!, 'logs');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    logCheck('Logs tab has Request section', body.includes('Request'));
    logCheck('Logs tab has Response section', body.includes('Response'));
    await screenshot(app.window, 'http-response-logs');
  });
});
