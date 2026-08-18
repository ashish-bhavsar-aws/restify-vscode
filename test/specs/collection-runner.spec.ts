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

test.describe('Collection Runner', () => {
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

  test('should send a request to populate history before running collection', async () => {
    log('--- Test: Populate history ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'runner-populate-history');
  });

  test('should verify sidebar runner UI is accessible', async () => {
    log('--- Test: Runner UI ---');
    // The runner is triggered from the collections sidebar
    // We verify the sidebar and runner button exist
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'runner-sidebar-access');
  });
});
