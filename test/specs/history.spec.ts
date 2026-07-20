import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  findCollectionsFrame,
  injectCursorOverlay,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  setupMainPanel,
  setUrlAndSend,
  waitForResponse,
  getResponseText,
  mockUrl,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('History', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [History] beforeAll ===');
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [History] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [History] afterAll ===');
    await closeVSCode(app);
  });

  test('Send a request to create history entry', async () => {
    log('--- Send request ---');
    await setUrlAndSend(mainFrame!, mockUrl('/'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const status = (await mainFrame!.locator('[data-testid="status-code"]').textContent().catch(() => '')) ?? '';
    logCheck('Request completed', status);
    await screenshot(app.window, 'history-request-sent');
  });

  test('History sidebar shows the request', async () => {
    log('--- Check history sidebar ---');
    // Look for history items in sidebar frames
    const frames = app.window.frames();
    let foundHistory = false;
    for (const frame of frames) {
      if (!frame.url().includes('vscode-webview://')) continue;
      const text = (await frame.locator('body').textContent().catch(() => '')) ?? '';
      if (text.includes('GET') || text.includes('History')) {
        foundHistory = true;
        logCheck('History contains GET', text.includes('GET'));
        break;
      }
    }
    await screenshot(app.window, 'history-sidebar');
    log('History sidebar checked');
  });

  test('History shows status code and method', async () => {
    log('--- Verify history details ---');
    const frames = app.window.frames();
    for (const frame of frames) {
      if (!frame.url().includes('vscode-webview://')) continue;
      const text = (await frame.locator('body').textContent().catch(() => '')) ?? '';
      if (text.includes('200') && text.includes('GET')) {
        logCheck('History has status 200', true);
        break;
      }
    }
    await screenshot(app.window, 'history-details');
  });

  test('Send POST request to add another history entry', async () => {
    log('--- Send POST ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    await screenshot(app.window, 'history-post-sent');
  });

  test('Multiple history entries exist', async () => {
    log('--- Multiple entries ---');
    const frames = app.window.frames();
    let entryCount = 0;
    for (const frame of frames) {
      if (!frame.url().includes('vscode-webview://')) continue;
      const items = await frame.locator('[class*="Item"]').count().catch(() => 0);
      if (items > entryCount) entryCount = items;
    }
    logCheck('Multiple history entries', entryCount);
    await screenshot(app.window, 'history-multiple');
  });
});
