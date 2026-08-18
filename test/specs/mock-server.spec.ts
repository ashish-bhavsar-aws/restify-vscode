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

test.describe('Mock Server', () => {
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

  test('should open start mock server via command palette', async () => {
    log('--- Test: Start mock server command ---');
    await runCommand(app.window, 'Restify: Start Mock Server');
    await app.window.waitForTimeout(2000);

    await screenshot(app.window, 'mock-server-command');
  });

  test('should display mock server prompt or notification', async () => {
    log('--- Test: Mock server prompt ---');
    // The command may show a quick pick for collection selection
    const quickInput = app.window.locator('.quick-input-widget:visible');
    const count = await quickInput.count();
    log(`Quick input visible: ${count > 0}`);

    await screenshot(app.window, 'mock-server-prompt');

    // Dismiss if visible
    if (count > 0) {
      await app.window.keyboard.press('Escape');
      await app.window.waitForTimeout(500);
    }
  });

  test('should open stop mock server via command palette', async () => {
    log('--- Test: Stop mock server command ---');
    await runCommand(app.window, 'Restify: Stop Mock Server');
    await app.window.waitForTimeout(1000);

    await screenshot(app.window, 'mock-server-stop');
  });
});
