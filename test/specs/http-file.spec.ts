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

test.describe('.http File Support', () => {
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

  test('should open .http file via command palette', async () => {
    log('--- Test: Open .http file ---');
    await runCommand(app.window, 'Restify: Open .http File');
    await app.window.waitForTimeout(2000);

    await screenshot(app.window, 'http-file-open-command');
  });

  test('should display .http file prompt', async () => {
    log('--- Test: .http file prompt ---');
    const quickInput = app.window.locator('.quick-input-widget:visible');
    const count = await quickInput.count();
    log(`Quick input visible: ${count > 0}`);

    await screenshot(app.window, 'http-file-prompt');

    if (count > 0) {
      await app.window.keyboard.press('Escape');
      await app.window.waitForTimeout(500);
    }
  });

  test('should export request to .http via command palette', async () => {
    log('--- Test: Export to .http ---');
    await runCommand(app.window, 'Restify: Export Request to .http');
    await app.window.waitForTimeout(2000);

    await screenshot(app.window, 'http-file-export-command');
  });

  test('should display export prompt', async () => {
    log('--- Test: Export prompt ---');
    const quickInput = app.window.locator('.quick-input-widget:visible');
    const count = await quickInput.count();
    log(`Quick input visible: ${count > 0}`);

    await screenshot(app.window, 'http-file-export-prompt');

    if (count > 0) {
      await app.window.keyboard.press('Escape');
      await app.window.waitForTimeout(500);
    }
  });
});
