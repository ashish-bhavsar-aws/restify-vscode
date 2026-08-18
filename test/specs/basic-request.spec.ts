import { test, expect } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  log,
  resetLog,
} from '../utils/vscode';
import {
  startMockServer,
  stopMockServer,
  mockUrl,
  setupMainPanel,
  setUrl,
  sendRequest,
  waitForResponse,
  getStatusCode,
  getResponseText,
  clickResponseTab,
  setMethod,
} from '../utils/helpers';

test.describe('Basic HTTP Requests', () => {
  let app: Awaited<ReturnType<typeof launchVSCode>>;
  let frame: Frame;

  test.beforeAll(async () => {
    resetLog();
    await startMockServer();
    app = await launchVSCode();
    frame = await setupMainPanel(app);
  });

  test.afterAll(async () => {
    await closeVSCode(app);
    await stopMockServer();
  });

  test('should send a GET request and receive 200 response', async () => {
    log('--- Test: GET request ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    log(`Status code: ${status}`);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    log(`Response body preview: ${body.slice(0, 100)}`);
    expect(body).toContain('Welcome to Restify Test Server');

    await screenshot(app.window, 'basic-get-request');
  });

  test('should send GET request to JSON endpoint and display response', async () => {
    log('--- Test: GET JSON endpoint ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('Alice');
    expect(body).toContain('Bob');

    await screenshot(app.window, 'basic-json-response');
  });

  test('should display response headers', async () => {
    log('--- Test: Response headers tab ---');
    await clickResponseTab(frame, 'headers');
    await frame.waitForTimeout(500);

    const headerPane = frame.locator('#res-pane');
    const text = await headerPane.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'basic-response-headers');
  });

  test('should handle different HTTP status codes', async () => {
    log('--- Test: Status code 404 ---');
    await setUrl(frame, mockUrl('/api/status/404'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    log(`Status code: ${status}`);
    expect(status).toContain('404');

    await screenshot(app.window, 'basic-status-404');
  });

  test('should handle status code 500', async () => {
    log('--- Test: Status code 500 ---');
    await setUrl(frame, mockUrl('/api/status/500'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    log(`Status code: ${status}`);
    expect(status).toContain('500');

    await screenshot(app.window, 'basic-status-500');
  });

  test('should send PUT request', async () => {
    log('--- Test: PUT request ---');
    await setMethod(frame, 'PUT');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await clickResponseTab(frame, 'raw');
    const body = await getResponseText(frame);
    expect(body).toContain('PUT');

    await screenshot(app.window, 'basic-put-request');
  });

  test('should send DELETE request', async () => {
    log('--- Test: DELETE request ---');
    await setMethod(frame, 'DELETE');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'basic-delete-request');
  });
});
