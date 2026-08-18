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
  openSettings,
  closeSettings,
  clickRequestTab,
  clickResponseTab,
  setMethod,
} from '../utils/helpers';

test.describe('Settings and Tabs', () => {
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

  test('should open settings modal', async () => {
    log('--- Test: Open settings ---');
    await openSettings(frame);
    await frame.waitForTimeout(500);

    const modal = frame.locator('[data-testid="settings-modal"]');
    const count = await modal.count();
    expect(count).toBeGreaterThan(0);

    await screenshot(app.window, 'settings-modal-open');
  });

  test('should display settings content', async () => {
    log('--- Test: Settings content ---');
    const modal = frame.locator('[data-testid="settings-modal"]');
    const text = await modal.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'settings-content');
  });

  test('should close settings modal', async () => {
    log('--- Test: Close settings ---');
    await closeSettings(frame);
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'settings-modal-closed');
  });

  test('should navigate request pane tabs', async () => {
    log('--- Test: Navigate request tabs ---');
    await clickRequestTab(frame, 'params');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'tab-params');

    await clickRequestTab(frame, 'headers');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'tab-headers');

    await clickRequestTab(frame, 'body');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'tab-body');

    await clickRequestTab(frame, 'auth');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'tab-auth');

    const scriptTab = frame.locator('[data-testid="req-tab-script"]');
    if ((await scriptTab.count()) > 0) {
      await clickRequestTab(frame, 'script');
      await frame.waitForTimeout(300);
      await screenshot(app.window, 'tab-script');
    }
  });

  test('should navigate response pane tabs after sending request', async () => {
    log('--- Test: Navigate response tabs ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await clickResponseTab(frame, 'body');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'res-tab-body');

    await clickResponseTab(frame, 'headers');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'res-tab-headers');

    await clickResponseTab(frame, 'cookies');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'res-tab-cookies');

    await clickResponseTab(frame, 'raw');
    await frame.waitForTimeout(300);
    await screenshot(app.window, 'res-tab-raw');
  });

  test('should switch HTTP methods via dropdown', async () => {
    log('--- Test: Switch HTTP methods ---');
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
    for (const method of methods) {
      await setMethod(frame, method);
      await frame.waitForTimeout(200);
    }

    await screenshot(app.window, 'method-switched');
  });
});
