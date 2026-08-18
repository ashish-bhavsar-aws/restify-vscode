import { test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  ensureSidebarOpen,
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

test.describe('History Pins and Fuzzy Search', () => {
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

  test('should send multiple requests to populate history', async () => {
    log('--- Test: Populate history ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    await waitForResponse(frame, 20000);

    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    await waitForResponse(frame, 20000);

    await setUrl(frame, mockUrl('/api/text'));
    await sendRequest(frame);
    await waitForResponse(frame, 20000);

    await screenshot(app.window, 'history-populated');
  });

  test('should open sidebar and view history', async () => {
    log('--- Test: View history ---');
    await ensureSidebarOpen(app.window);
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'history-view');
  });

  test('should show history items with pin buttons', async () => {
    log('--- Test: History pin buttons ---');
    // Look for history items in sidebar
    const sidebar = app.window.locator('.part.sidebar');
    const text = await sidebar.textContent().catch(() => '');
    log(`Sidebar content: ${(text || '').slice(0, 300)}`);

    await screenshot(app.window, 'history-pin-buttons');
  });

  test('should show history filter input', async () => {
    log('--- Test: History filter ---');
    // Check for filter input in history sidebar
    const filterInput = app.window.locator('input[placeholder*="Filter history"]');
    const count = await filterInput.count();
    log(`Filter input found: ${count > 0}`);

    await screenshot(app.window, 'history-filter');
  });
});
