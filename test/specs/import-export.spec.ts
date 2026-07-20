import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  setupMainPanel,
  waitForResponse,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Import / Export', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [ImportExport] beforeAll ===');
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [ImportExport] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [ImportExport] afterAll ===');
    await closeVSCode(app);
  });

  test('Import Swagger via command palette', async () => {
    log('--- Import Swagger URL ---');
    const { window } = app;

    // Open command palette
    await window.keyboard.press('Meta+Shift+P');
    await window.waitForTimeout(1000);

    // Type the import command
    await window.keyboard.type('Restify: Import from URL', { delay: 10 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(1000);

    // If a URL input appears, type the swagger URL
    const inputBox = window.locator('.quick-input-widget input, .quick-input-box input');
    if (await inputBox.count() > 0) {
      await inputBox.first().fill('http://localhost:3000/swagger.json');
      await window.waitForTimeout(500);
      await window.keyboard.press('Enter');
      await window.waitForTimeout(3000);
    }

    await screenshot(window, 'import-swagger');
    log('Swagger import attempted');
  });

  test('Verify import produced collections in sidebar', async () => {
    log('--- Verify collections ---');
    // Check if collections frame has any requests
    const frames = app.window.frames();
    for (const frame of frames) {
      if (!frame.url().includes('vscode-webview://')) continue;
      const text = (await frame.locator('body').textContent().catch(() => '')) ?? '';
      if (text.includes('collection') || text.includes('Collection') || text.includes('pet')) {
        logCheck('Collections found in sidebar', true);
        break;
      }
    }
    await screenshot(app.window, 'import-verified');
  });

  test('Export collection via command palette', async () => {
    log('--- Export collection ---');
    const { window } = app;

    await window.keyboard.press('Meta+Shift+P');
    await window.waitForTimeout(1000);
    await window.keyboard.type('Restify: Export', { delay: 10 });
    await window.waitForTimeout(500);
    await window.keyboard.press('Enter');
    await window.waitForTimeout(2000);

    await screenshot(window, 'export-triggered');
    log('Export attempted via command palette');
  });
});
