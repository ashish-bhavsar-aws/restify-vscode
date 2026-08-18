import { test } from '@playwright/test';
import type { Frame } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  runCommand,
  log,
  resetLog,
} from '../utils/vscode';
import {
  startMockServer,
  stopMockServer,
  setupMainPanel,
} from '../utils/helpers';

test.describe('Command Palette Actions', () => {
  let app: Awaited<ReturnType<typeof launchVSCode>>;
  let _frame: Frame;

  test.beforeAll(async () => {
    resetLog();
    await startMockServer();
    app = await launchVSCode();
    _frame = await setupMainPanel(app);
  });

  test.afterAll(async () => {
    await closeVSCode(app);
    await stopMockServer();
  });

  test('should run "Restify: Send Request" command', async () => {
    log('--- Test: Send Request command ---');
    await runCommand(app.window, 'Restify: Send Request');
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'palette-send-request');
  });

  test('should run "Restify: New Request" command', async () => {
    log('--- Test: New Request command ---');
    await runCommand(app.window, 'Restify: New Request');
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'palette-new-request');
  });

  test('should run "Restify: Import Collection" command', async () => {
    log('--- Test: Import Collection command ---');
    await runCommand(app.window, 'Restify: Import Collection');
    await app.window.waitForTimeout(2000);

    await screenshot(app.window, 'palette-import-collection');

    // Dismiss any prompt
    const quickInput = app.window.locator('.quick-input-widget:visible');
    if ((await quickInput.count()) > 0) {
      await app.window.keyboard.press('Escape');
      await app.window.waitForTimeout(500);
    }
  });

  test('should run "Restify: Search in Collections" command', async () => {
    log('--- Test: Search Collections command ---');
    await runCommand(app.window, 'Restify: Search in Collections');
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'palette-search-collections');

    const quickInput = app.window.locator('.quick-input-widget:visible');
    if ((await quickInput.count()) > 0) {
      await app.window.keyboard.press('Escape');
      await app.window.waitForTimeout(500);
    }
  });

  test('should run "Restify: Show HTTP Log" command', async () => {
    log('--- Test: Show HTTP Log command ---');
    await runCommand(app.window, 'Restify: Show HTTP Log');
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'palette-show-http-log');
  });

  test('should run "Restify: Open Environments" command', async () => {
    log('--- Test: Open Environments command ---');
    await runCommand(app.window, 'Restify: Open Environments');
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'palette-open-environments');
  });
});
