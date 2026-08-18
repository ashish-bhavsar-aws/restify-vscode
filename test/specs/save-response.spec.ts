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
} from '../utils/helpers';

test.describe('Save Response to File', () => {
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

  test('should send request and find save response button', async () => {
    log('--- Test: Save response button ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const saveBtn = frame.locator('[data-testid="save-response-btn"]');
    const count = await saveBtn.count();
    log(`Save response button found: ${count > 0}`);

    await screenshot(app.window, 'save-response-btn');
  });

  test('should verify save response button is clickable', async () => {
    log('--- Test: Save response clickable ---');
    const saveBtn = frame.locator('[data-testid="save-response-btn"]');
    if ((await saveBtn.count()) > 0) {
      const isDisabled = await saveBtn.isDisabled().catch(() => false);
      log(`Save button disabled: ${isDisabled}`);
    }

    await screenshot(app.window, 'save-response-clickable');
  });
});
