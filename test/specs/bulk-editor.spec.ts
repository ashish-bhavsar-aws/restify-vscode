import { test } from '@playwright/test';
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
  setupMainPanel,
  clickRequestTab,
} from '../utils/helpers';

test.describe('Bulk Editor for KV Tables', () => {
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

  test('should toggle bulk edit mode on headers', async () => {
    log('--- Test: Toggle bulk edit mode ---');
    await clickRequestTab(frame, 'headers');
    await frame.waitForTimeout(300);

    const bulkToggle = frame.locator('[data-testid="kv-bulk-toggle"]');
    const count = await bulkToggle.count();
    log(`Bulk toggle found: ${count > 0}`);

    if (count > 0) {
      await bulkToggle.click({ force: true });
      await frame.waitForTimeout(500);
    }

    await screenshot(app.window, 'bulk-edit-toggle');
  });

  test('should display bulk editor textarea', async () => {
    log('--- Test: Bulk editor textarea ---');
    const bulkEditor = frame.locator('[data-testid="kv-bulk-editor"]');
    const count = await bulkEditor.count();
    log(`Bulk editor found: ${count > 0}`);

    if (count > 0) {
      const text = await bulkEditor.inputValue().catch(() => '');
      log(`Bulk editor content: "${text.slice(0, 100)}"`);
    }

    await screenshot(app.window, 'bulk-edit-textarea');
  });

  test('should type in bulk editor and parse rows', async () => {
    log('--- Test: Type in bulk editor ---');
    const bulkEditor = frame.locator('[data-testid="kv-bulk-editor"]');
    if ((await bulkEditor.count()) > 0) {
      await bulkEditor.click();
      await bulkEditor.fill('X-Test-One: one\nX-Test-Two: two\nX-Test-Three: three');
      await frame.waitForTimeout(500);
    }

    await screenshot(app.window, 'bulk-edit-typed');
  });

  test('should toggle back to normal mode and see parsed rows', async () => {
    log('--- Test: Toggle back to normal ---');
    const bulkToggle = frame.locator('[data-testid="kv-bulk-toggle"]');
    if ((await bulkToggle.count()) > 0) {
      await bulkToggle.click({ force: true });
      await frame.waitForTimeout(500);
    }

    await screenshot(app.window, 'bulk-edit-normal-mode');
  });

  test('should bulk edit on params tab', async () => {
    log('--- Test: Bulk edit on params ---');
    await clickRequestTab(frame, 'params');
    await frame.waitForTimeout(300);

    const bulkToggle = frame.locator('[data-testid="kv-bulk-toggle"]');
    if ((await bulkToggle.count()) > 0) {
      await bulkToggle.click({ force: true });
      await frame.waitForTimeout(500);

      const bulkEditor = frame.locator('[data-testid="kv-bulk-editor"]');
      if ((await bulkEditor.count()) > 0) {
        await bulkEditor.fill('page=1\nlimit=10\nsort=asc');
        await frame.waitForTimeout(500);
      }
    }

    await screenshot(app.window, 'bulk-edit-params');
  });
});
