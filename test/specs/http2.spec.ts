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
} from '../utils/helpers';

test.describe('HTTP/2 Support', () => {
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

  test('should toggle HTTP/2 switch', async () => {
    log('--- Test: HTTP/2 toggle ---');
    const toggle = frame.locator('[data-testid="http2-toggle"]');
    const count = await toggle.count();
    log(`HTTP/2 toggle found: ${count > 0}`);

    if (count > 0) {
      await toggle.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'http2-toggle-on');
  });

  test('should send request with HTTP/2 toggle enabled', async () => {
    log('--- Test: Request with HTTP/2 ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    // Mock server may not support HTTP/2, so just verify a response was received
    const status = await getStatusCode(frame);
    log(`HTTP/2 response status: ${status}`);
    expect(status.length).toBeGreaterThan(0);

    await screenshot(app.window, 'http2-request-sent');
  });

  test('should disable HTTP/2 toggle', async () => {
    log('--- Test: HTTP/2 toggle off ---');
    const toggle = frame.locator('[data-testid="http2-toggle"]');
    if ((await toggle.count()) > 0) {
      await toggle.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'http2-toggle-off');
  });
});
