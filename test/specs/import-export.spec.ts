import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  clickRestifyIcon,
  findCollectionsFrame,
  clickWithCursor,
  selectQuickPick,
  typeInQuickInput,
  confirmQuickInput,
  dismissNotification,
  logCheck,
  logError,
  type VSCodeApp,
} from '../utils/vscode';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let collectionsFrame: Frame | null = null;

test.describe('Import / Export', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    await clickRestifyIcon(app.window);
    await app.window.waitForTimeout(3000);
    collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
  });

  test.afterAll(async () => {
    await closeVSCode(app);
  });

  test('Import Swagger Petstore collection via URL', async () => {
    const { window } = app;

    const sidebar = window.locator('.part.sidebar');
    const importBtn = sidebar.locator('.codicon-cloud-download, button[title*="Import"]').first();
    const impCount = await importBtn.count().catch(() => 0);
    logCheck('Import button in sidebar', impCount);
    expect(impCount).toBeGreaterThan(0);

    await clickWithCursor(importBtn, { force: true });
    await window.waitForTimeout(800);
    await selectQuickPick(window, 'Swagger URL');
    await typeInQuickInput(window, 'https://petstore.swagger.io/v2/swagger.json');
    await confirmQuickInput(window);

    try {
      await window.waitForFunction(() => {
        const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
        for (const toast of toasts) {
          if (toast.textContent?.includes('Imported')) return true;
        }
        return false;
      }, { timeout: 30_000 });
      logCheck('Import success notification', true);
    } catch {
      logError('Timed out waiting for import success notification');
      throw new Error('Import success notification did not appear');
    }
    await dismissNotification(window);
    await screenshot(window, 'import-swagger-imported');
  });

  test('Verify imported collection appears in sidebar', async () => {
    const frame = collectionsFrame;
    if (!frame) throw new Error('No collections frame');
    const text = (await frame.locator('body').textContent().catch(() => '')) || '';
    logCheck('Collection visible in sidebar', /Petstore|Swagger/i.test(text));
    expect(text).toMatch(/Petstore|Swagger/i);
    await screenshot(app.window, 'import-verified');
  });

  test('Export all collections via sidebar toolbar', async () => {
    const { window } = app;
    const frame = collectionsFrame;
    if (!frame) throw new Error('No collections frame');

    const exportAll = frame.locator('button[title="Export all collections"]');
    const eaCount = await exportAll.count().catch(() => 0);
    logCheck('Export-all toolbar button', eaCount);
    expect(eaCount).toBeGreaterThan(0);

    await clickWithCursor(exportAll.first(), { force: true });

    const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
    await inputBox.first().waitFor({ state: 'visible', timeout: 10_000 });
    logCheck('Filename input box visible', true);

    await typeInQuickInput(window, 'export-test.json');
    await confirmQuickInput(window);

    try {
      await window.waitForFunction(() => {
        const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
        for (const toast of toasts) {
          if (toast.textContent?.includes('Exported')) return true;
        }
        return false;
      }, { timeout: 15_000 });
      logCheck('Export success notification', true);
    } catch {
      logError('Timed out waiting for export success notification');
      throw new Error('Export success notification did not appear');
    }
    await dismissNotification(window);
    await screenshot(window, 'export-triggered');
  });
});
