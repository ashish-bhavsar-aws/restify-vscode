import { test, expect } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  ensureSidebarOpen,
  findHistoryFrame,
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

test.describe('History Sidebar', () => {
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

  test('should send request and populate history', async () => {
    log('--- Test: Send request to populate history ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'history-first-request');
  });

  test('should send second request to build history', async () => {
    log('--- Test: Send second request ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'history-second-request');
  });

  test('should send third request', async () => {
    log('--- Test: Send third request ---');
    await setUrl(frame, mockUrl('/api/text'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'history-third-request');
  });

  test('should open sidebar and view history', async () => {
    log('--- Test: View history in sidebar ---');
    await ensureSidebarOpen(app.window);
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'history-sidebar-view');
  });

  test('should find history sidebar frame', async () => {
    log('--- Test: Find history frame ---');
    const historyFrame = await findHistoryFrame(app.window, 15000);
    if (historyFrame) {
      const text = await historyFrame.locator('body').textContent().catch(() => '');
      log(`History frame content: ${(text || '').slice(0, 200)}`);
    }

    await screenshot(app.window, 'history-frame');
  });
});
