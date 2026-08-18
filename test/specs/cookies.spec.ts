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
  clickResponseTab,
} from '../utils/helpers';

test.describe('Cookies', () => {
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

  test('should set cookie via API endpoint', async () => {
    log('--- Test: Set cookie ---');
    await setUrl(frame, mockUrl('/api/cookie/set?name=session&value=abc123'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'cookies-set');
  });

  test('should check cookies tab in response', async () => {
    log('--- Test: Check cookies tab ---');
    await clickResponseTab(frame, 'cookies');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'cookies-tab-view');
  });

  test('should send request to cookie check endpoint', async () => {
    log('--- Test: Cookie check endpoint ---');
    await setUrl(frame, mockUrl('/api/cookie/check'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'cookies-check');
  });
});
