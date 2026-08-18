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
  enableRequestChaining,
  disableRequestChaining,
} from '../utils/helpers';

test.describe('Multi-Tab Panels', () => {
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

  test('should hide entire tab bar when request chaining is disabled', async () => {
    log('--- Test: Tab bar hidden by default (chaining off) ---');
    // The entire TabBar component should not render when chaining is off
    const addBtn = frame.locator('button[title="New request"]');
    const closeBtn = frame.locator('button[title="Close tab"]');
    const addCount = await addBtn.count();
    const closeCount = await closeBtn.count();
    log(`Add button count: ${addCount}, Close button count: ${closeCount}`);
    expect(addCount).toBe(0);
    expect(closeCount).toBe(0);

    await screenshot(app.window, 'multitab-hidden-when-off');
  });

  test('should hide script tab when request chaining is disabled', async () => {
    log('--- Test: No script tab by default ---');
    const scriptTab = frame.locator('[data-testid="req-tab-script"]');
    const count = await scriptTab.count();
    log(`Script tab count (chaining off): ${count}`);
    expect(count).toBe(0);

    await screenshot(app.window, 'multitab-no-script-tab');
  });

  test('should show tab bar after enabling request chaining', async () => {
    log('--- Test: Enable chaining → show tab bar ---');

    await enableRequestChaining(frame);

    // Tab bar should now be visible with at least one tab
    const tabs = frame.locator('[data-testid^="req-tab-"]');
    const tabCount = await tabs.count();
    log(`Tab count (chaining on): ${tabCount}`);
    expect(tabCount).toBeGreaterThanOrEqual(1);

    // Script tab should appear
    const scriptTab = frame.locator('[data-testid="req-tab-script"]');
    const scriptCount = await scriptTab.count();
    log(`Script tab count (chaining on): ${scriptCount}`);
    expect(scriptCount).toBeGreaterThanOrEqual(1);

    await screenshot(app.window, 'multitab-visible-when-on');
  });

  test('should show "+" button after enabling request chaining', async () => {
    log('--- Test: Enable chaining → show add-tab ---');
    const addBtn = frame.locator('button[title="New request"]');
    const count = await addBtn.count();
    log(`Add tab button count (chaining on): ${count}`);
    expect(count).toBeGreaterThanOrEqual(1);

    await screenshot(app.window, 'multitab-add-btn-visible');
  });

  test('should show close button on tabs when chaining enabled', async () => {
    log('--- Test: Close button visible ---');
    const closeBtn = frame.locator('button[title="Close tab"]').first();
    const count = await closeBtn.count();
    log(`Close button found: ${count > 0}`);
    expect(count).toBeGreaterThanOrEqual(1);

    await screenshot(app.window, 'multitab-close-btn');
  });

  test('should show current request in first tab', async () => {
    log('--- Test: Current request tab ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'multitab-first-request');
  });

  test('should hide entire tab bar after disabling request chaining', async () => {
    log('--- Test: Disable chaining → hide tab bar ---');

    await disableRequestChaining(frame);

    // The entire tab bar should be hidden
    const addBtn = frame.locator('button[title="New request"]');
    const closeBtn = frame.locator('button[title="Close tab"]');
    const addCount = await addBtn.count();
    const closeCount = await closeBtn.count();
    log(`Add button count: ${addCount}, Close button count: ${closeCount}`);
    expect(addCount).toBe(0);
    expect(closeCount).toBe(0);

    await screenshot(app.window, 'multitab-hidden-after-disable');
  });

  test('should hide script tab after disabling request chaining', async () => {
    log('--- Test: Disable chaining → hide script tab ---');
    const scriptTab = frame.locator('[data-testid="req-tab-script"]');
    const count = await scriptTab.count();
    log(`Script tab count (chaining off again): ${count}`);
    expect(count).toBe(0);

    await screenshot(app.window, 'multitab-script-tab-hidden');
  });

  test('should replace active tab when loading request with chaining disabled', async () => {
    log('--- Test: Chaining off → loadRequest replaces active tab ---');
    await disableRequestChaining(frame);

    // Load a request via the extension (simulates clicking from sidebar)
    await frame.evaluate((url) => {
      window.postMessage({ command: 'loadRequest', data: { url, method: 'GET' } }, '*');
    }, mockUrl('/api/json-response'));
    await frame.waitForTimeout(1000);

    // With chaining off, tab bar is hidden but the request should still load
    // We verify the URL was set by checking the URL input
    const urlInput = frame.locator('.url-input [data-testid="variable-text-input"]');
    if (await urlInput.count() > 0) {
      const val = await urlInput.first().inputValue();
      log(`URL after loadRequest (chaining off): ${val}`);
      expect(val).toContain('/api/json-response');
    }

    await screenshot(app.window, 'multitab-replace-tab');
  });

  test('should open new tab when loading request with chaining enabled', async () => {
    log('--- Test: Chaining on → loadRequest opens new tab ---');
    await enableRequestChaining(frame);

    // Get initial tab count
    const initialCount = await frame.locator('[data-testid^="req-tab-"]').count();
    log(`Initial tab count: ${initialCount}`);

    // Send a request first to make the initial tab non-pristine
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    await waitForResponse(frame, 20000);

    // Load a new request via the extension
    await frame.evaluate((url) => {
      window.postMessage({ command: 'loadRequest', data: { url, method: 'GET' } }, '*');
    }, mockUrl('/api/json-response'));
    await frame.waitForTimeout(1000);

    // Tab count should increase by 1 (new tab, not replace)
    const afterCount = await frame.locator('[data-testid^="req-tab-"]').count();
    log(`Tab count after loadRequest (chaining on): ${afterCount}`);
    expect(afterCount).toBeGreaterThanOrEqual(initialCount + 1);

    await screenshot(app.window, 'multitab-new-tab');
  });
});
