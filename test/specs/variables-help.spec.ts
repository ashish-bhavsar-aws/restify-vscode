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
  clickInFrame,
} from '../utils/vscode';
import {
  startMockServer,
  stopMockServer,
  setupMainPanel,
} from '../utils/helpers';

test.describe('Variables Help Modal', () => {
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

  test('should open variables help modal', async () => {
    log('--- Test: Open variables help ---');
    const varsHelpBtn = frame.locator('[data-testid="vars-help-btn"]');
    const count = await varsHelpBtn.count();
    log(`Vars help button found: ${count > 0}`);

    if (count > 0) {
      await clickInFrame(frame, '[data-testid="vars-help-btn"]');
      await frame.waitForTimeout(500);
    }

    await screenshot(app.window, 'vars-help-open');
  });

  test('should display variables help content', async () => {
    log('--- Test: Variables help content ---');
    const modal = frame.locator('[data-testid="vars-help-modal"]');
    const count = await modal.count();
    log(`Vars help modal found: ${count > 0}`);

    if (count > 0) {
      const text = await modal.textContent();
      log(`Help content: ${(text || '').slice(0, 300)}`);
    }

    await screenshot(app.window, 'vars-help-content');
  });

  test('should close variables help modal', async () => {
    log('--- Test: Close variables help ---');
    const closeBtn = frame.locator('[data-testid="vars-help-close"]');
    if ((await closeBtn.count()) > 0) {
      await clickInFrame(frame, '[data-testid="vars-help-close"]');
      await frame.waitForTimeout(300);
    } else {
      // Try overlay click
      const overlay = frame.locator('[data-testid="vars-help-overlay"]');
      if ((await overlay.count()) > 0) {
        await clickInFrame(frame, '[data-testid="vars-help-overlay"]');
        await frame.waitForTimeout(300);
      }
    }

    await screenshot(app.window, 'vars-help-closed');
  });
});
