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

test.describe('Response Beautify Toolbar', () => {
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

  test('should send JSON request for beautify testing', async () => {
    log('--- Test: JSON for beautify ---');
    await setUrl(frame, mockUrl('/api/json-response'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'beautify-json-loaded');
  });

  test('should toggle word wrap', async () => {
    log('--- Test: Toggle word wrap ---');
    const wrapBtn = frame.locator('[data-testid="viewer-wrap-btn"]');
    const count = await wrapBtn.count();
    log(`Wrap button found: ${count > 0}`);

    if (count > 0) {
      await wrapBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'beautify-word-wrap');
  });

  test('should toggle line numbers', async () => {
    log('--- Test: Toggle line numbers ---');
    const lineNumBtn = frame.locator('[data-testid="viewer-line-numbers-btn"]');
    if ((await lineNumBtn.count()) > 0) {
      await lineNumBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'beautify-line-numbers');
  });

  test('should change font size', async () => {
    log('--- Test: Change font size ---');
    const fontSizeLabel = frame.locator('[data-testid="viewer-font-size"]');
    const initialSize = await fontSizeLabel.textContent().catch(() => '');
    log(`Initial font size: ${initialSize}`);

    const incBtn = frame.locator('[data-testid="viewer-font-inc-btn"]');
    if ((await incBtn.count()) > 0) {
      await incBtn.click({ force: true });
      await incBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    const newSize = await fontSizeLabel.textContent().catch(() => '');
    log(`New font size: ${newSize}`);

    await screenshot(app.window, 'beautify-font-size');
  });

  test('should collapse all JSON nodes', async () => {
    log('--- Test: Collapse all ---');
    const collapseBtn = frame.locator('[data-testid="viewer-collapse-all-btn"]');
    if ((await collapseBtn.count()) > 0) {
      await collapseBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'beautify-collapsed');
  });

  test('should expand all JSON nodes', async () => {
    log('--- Test: Expand all ---');
    const expandBtn = frame.locator('[data-testid="viewer-expand-all-btn"]');
    if ((await expandBtn.count()) > 0) {
      await expandBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'beautify-expanded');
  });
});
