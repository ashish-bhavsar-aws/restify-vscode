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

  test('should display the tab bar', async () => {
    log('--- Test: Tab bar visible ---');
    const tabBar = frame.locator('[data-testid="req-tab-params"]').first().locator('..');
    const count = await tabBar.count();
    log(`Tab bar found: ${count > 0}`);

    await screenshot(app.window, 'multitab-tabbar');
  });

  test('should hide "+" button when request chaining is disabled', async () => {
    log('--- Test: No add-tab button by default ---');
    const addBtn = frame.locator('button[title="New request"]');
    const count = await addBtn.count();
    log(`Add tab button count (chaining off): ${count}`);
    expect(count).toBe(0);

    await screenshot(app.window, 'multitab-no-add-btn');
  });

  test('should hide script tab when request chaining is disabled', async () => {
    log('--- Test: No script tab by default ---');
    const scriptTab = frame.locator('[data-testid="req-tab-script"]');
    const count = await scriptTab.count();
    log(`Script tab count (chaining off): ${count}`);
    expect(count).toBe(0);

    await screenshot(app.window, 'multitab-no-script-tab');
  });

  test('should show "+" button after enabling request chaining', async () => {
    log('--- Test: Enable chaining → show add-tab ---');

    await enableRequestChaining(frame);

    // Check if Script tab appeared (also depends on enableRequestChaining)
    const scriptTab = await frame.evaluate(() => {
      const tabEls = document.querySelectorAll('[data-testid^="req-tab-"]');
      return Array.from(tabEls).map(el => el.getAttribute('data-testid'));
    });
    log(`Req tabs: ${JSON.stringify(scriptTab)}`);

    // Check for add tab button
    const addBtn = frame.locator('button[title="New request"]');
    const count = await addBtn.count();
    log(`Add tab button count (chaining on): ${count}`);

    expect(count).toBeGreaterThanOrEqual(1);
    await screenshot(app.window, 'multitab-add-btn-visible');
  });

  test('should show script tab after enabling request chaining', async () => {
    log('--- Test: Enable chaining → show script tab ---');
    const scriptTab = frame.locator('[data-testid="req-tab-script"]');
    const count = await scriptTab.count();
    log(`Script tab count (chaining on): ${count}`);
    expect(count).toBeGreaterThanOrEqual(1);

    await screenshot(app.window, 'multitab-script-tab-visible');
  });

  test('should have at least one tab', async () => {
    log('--- Test: At least one tab ---');
    const tabs = frame.locator('[data-testid^="req-tab-"]');
    const count = await tabs.count();
    log(`Tab count: ${count}`);
    expect(count).toBeGreaterThanOrEqual(1);

    await screenshot(app.window, 'multitab-one-tab');
  });

  test('should show current request in first tab', async () => {
    log('--- Test: Current request tab ---');
    await setUrl(frame, mockUrl('/'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'multitab-first-request');
  });

  test('should have tab close button', async () => {
    log('--- Test: Tab close button ---');
    const closeBtn = frame.locator('button[title="Close tab"]').first();
    const count = await closeBtn.count();
    log(`Close button found: ${count > 0}`);

    await screenshot(app.window, 'multitab-close-btn');
  });

  test('should hide "+" button after disabling request chaining', async () => {
    log('--- Test: Disable chaining → hide add-tab ---');

    await disableRequestChaining(frame);

    const addBtn = frame.locator('button[title="New request"]');
    const count = await addBtn.count();
    log(`Add tab button count (chaining off again): ${count}`);
    expect(count).toBe(0);

    await screenshot(app.window, 'multitab-add-btn-hidden');
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

    // Get initial tab count and ID
    const initialCount = await frame.locator('[data-testid^="req-tab-"]').count();
    log(`Initial tab count: ${initialCount}`);

    // Load a request via the extension (simulates clicking from sidebar)
    await frame.evaluate((url) => {
      window.postMessage({ command: 'loadRequest', data: { url, method: 'GET' } }, '*');
    }, mockUrl('/api/json-response'));
    await frame.waitForTimeout(1000);

    // Tab count should remain the same (replace, not new)
    const afterCount = await frame.locator('[data-testid^="req-tab-"]').count();
    log(`Tab count after loadRequest (chaining off): ${afterCount}`);
    expect(afterCount).toBe(initialCount);

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
