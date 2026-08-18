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
} from '../utils/helpers';

test.describe('Redirects', () => {
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

  test('should follow 302 redirect', async () => {
    log('--- Test: Follow redirect ---');
    await setUrl(frame, mockUrl('/api/redirect'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    const body = await getResponseText(frame);
    expect(body).toContain('redirected');

    await screenshot(app.window, 'redirect-followed');
  });

  test('should handle redirect response content', async () => {
    log('--- Test: Redirect content ---');
    const body = await getResponseText(frame);
    expect(body).toContain('/api/redirect');

    await screenshot(app.window, 'redirect-content');
  });
});
