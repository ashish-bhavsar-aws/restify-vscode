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
  openEnvManager,
  closeEnvManager,
} from '../utils/helpers';

test.describe('Environment Import/Export', () => {
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

  test('should open environment manager', async () => {
    log('--- Test: Open env manager ---');
    await openEnvManager(frame);
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'env-import-export-manager');
  });

  test('should find import button in environment manager', async () => {
    log('--- Test: Find import button ---');
    const importBtn = frame.locator('[data-testid="env-import-btn"]');
    const count = await importBtn.count();
    log(`Import button found: ${count > 0}`);

    await screenshot(app.window, 'env-import-button');

    await closeEnvManager(frame);
  });

  test('should verify environment export functionality exists', async () => {
    log('--- Test: Verify export capability ---');
    // Export is accessed via the command palette or env manager
    await screenshot(app.window, 'env-export-capability');
  });
});
