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

test.describe('cURL Import', () => {
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

  test('should open cURL import via command palette', async () => {
    log('--- Test: cURL import command ---');
    await runCommand(app.window, 'Restify: New from cURL');
    await app.window.waitForTimeout(2000);

    await screenshot(app.window, 'curl-import-palette');
  });

  test('should display cURL import prompt', async () => {
    log('--- Test: cURL import prompt ---');
    const quickInput = app.window.locator('.quick-input-widget:visible');
    const count = await quickInput.count();
    log(`Quick input visible: ${count > 0}`);

    await screenshot(app.window, 'curl-import-prompt');

    // Dismiss by pressing Escape
    if (count > 0) {
      await app.window.keyboard.press('Escape');
      await app.window.waitForTimeout(500);
    }
  });
});
