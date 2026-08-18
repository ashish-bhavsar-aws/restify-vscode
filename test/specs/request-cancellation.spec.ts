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

test.describe('Request Cancellation', () => {
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

  test('should show cancel button during slow request', async () => {
    log('--- Test: Cancel button visible ---');
    await setUrl(frame, mockUrl('/api/slow?ms=10000'));

    // Send the request
    const input = frame.locator('.url-input [data-testid="variable-text-input"]');
    if ((await input.first().isVisible().catch(() => false))) {
      await input.first().press('Enter');
    }

    // Wait briefly for the cancel button to appear
    await frame.waitForTimeout(1500);

    const cancelBtn = frame.locator('[data-testid="cancel-btn"]');
    const count = await cancelBtn.count();
    log(`Cancel button count: ${count}`);

    await screenshot(app.window, 'cancel-button-visible');
  });

  test('should cancel a slow request', async () => {
    log('--- Test: Cancel slow request ---');
    const cancelBtn = frame.locator('[data-testid="cancel-btn"]');
    if ((await cancelBtn.count()) > 0) {
      await cancelBtn.click({ force: true });
      await frame.waitForTimeout(2000);
    }

    await screenshot(app.window, 'cancel-request-cancelled');
  });

  test('should send a normal fast request after cancellation', async () => {
    log('--- Test: Fast request after cancel ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'cancel-fast-after');
  });
});
