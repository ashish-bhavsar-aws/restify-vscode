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
  clickRequestTab,
  addHeader,
  clickResponseTab,
} from '../utils/helpers';

test.describe('Headers Management', () => {
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

  test('should open headers tab', async () => {
    log('--- Test: Open headers tab ---');
    await clickRequestTab(frame, 'headers');
    await frame.waitForTimeout(500);

    const headersPane = frame.locator('#req-pane');
    const text = await headersPane.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'headers-tab');
  });

  test('should add a custom header and send request', async () => {
    log('--- Test: Add custom header ---');
    await addHeader(frame, 'X-Custom-Header', 'custom-value-123');
    await setUrl(frame, mockUrl('/api/echo'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('x-custom-header');
    expect(body).toContain('custom-value-123');

    await screenshot(app.window, 'headers-custom-sent');
  });

  test('should view response headers', async () => {
    log('--- Test: View response headers ---');
    await clickResponseTab(frame, 'headers');
    await frame.waitForTimeout(500);

    const headerPane = frame.locator('#res-pane');
    const text = await headerPane.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'headers-response-view');
  });

  test('should add multiple headers', async () => {
    log('--- Test: Add multiple headers ---');
    await addHeader(frame, 'X-Request-Id', 'req-001');
    await addHeader(frame, 'Accept', 'application/json');
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'headers-multiple');
  });
});
