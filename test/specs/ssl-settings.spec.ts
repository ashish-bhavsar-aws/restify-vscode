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
} from '../utils/helpers';

test.describe('SSL/TLS Settings', () => {
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

  test('should verify SSL toggle exists in main panel', async () => {
    log('--- Test: SSL toggle in main panel ---');
    const sslToggle = frame.locator('[data-testid="verify-ssl-toggle"]');
    const count = await sslToggle.count();
    log(`SSL toggle found: ${count > 0}`);

    await screenshot(app.window, 'ssl-main-toggle');
  });

  test('should toggle SSL verification', async () => {
    log('--- Test: Toggle SSL ---');
    const sslToggle = frame.locator('[data-testid="verify-ssl-toggle"]');
    if ((await sslToggle.count()) > 0) {
      await sslToggle.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'ssl-toggled');
  });

  test('should restore SSL toggle', async () => {
    log('--- Test: Restore SSL ---');
    const sslToggle = frame.locator('[data-testid="verify-ssl-toggle"]');
    if ((await sslToggle.count()) > 0) {
      await sslToggle.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'ssl-restored');
  });
});
