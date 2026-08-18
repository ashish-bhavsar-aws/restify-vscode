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
  openSettings,
  closeSettings,
} from '../utils/helpers';

test.describe('Interceptors and Retry Settings', () => {
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

  test('should open settings and navigate to interceptors tab', async () => {
    log('--- Test: Interceptors settings tab ---');
    await openSettings(frame);
    await frame.waitForTimeout(500);

    // Click on the interceptors tab
    const interceptorsTab = frame.locator('[data-testid="settings-tab-interceptors"]');
    if ((await interceptorsTab.count()) > 0) {
      await interceptorsTab.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'interceptors-settings-tab');
  });

  test('should display retry settings', async () => {
    log('--- Test: Retry settings ---');
    const retryToggle = frame.locator('[data-testid="interceptor-retry-toggle"]');
    const count = await retryToggle.count();
    log(`Retry toggle found: ${count > 0}`);

    await screenshot(app.window, 'interceptors-retry-settings');
  });

  test('should toggle retry on', async () => {
    log('--- Test: Toggle retry ---');
    const retryToggle = frame.locator('[data-testid="interceptor-retry-toggle"]');
    if ((await retryToggle.count()) > 0) {
      const isChecked = await retryToggle.isChecked().catch(() => false);
      if (!isChecked) {
        await retryToggle.click({ force: true });
        await frame.waitForTimeout(200);
      }
    }

    await screenshot(app.window, 'interceptors-retry-on');
  });

  test('should configure retry attempts', async () => {
    log('--- Test: Configure retry attempts ---');
    const attemptsInput = frame.locator('[data-testid="interceptor-retry-attempts"]');
    if ((await attemptsInput.count()) > 0) {
      await attemptsInput.fill('3');
      await frame.waitForTimeout(200);
    }

    await screenshot(app.window, 'interceptors-retry-attempts');
  });

  test('should toggle logging interceptor', async () => {
    log('--- Test: Logging interceptor ---');
    const loggingToggle = frame.locator('[data-testid="interceptor-logging-toggle"]');
    if ((await loggingToggle.count()) > 0) {
      const isChecked = await loggingToggle.isChecked().catch(() => false);
      if (!isChecked) {
        await loggingToggle.click({ force: true });
        await frame.waitForTimeout(200);
      }
    }

    await screenshot(app.window, 'interceptors-logging-on');
  });

  test('should display response cache settings', async () => {
    log('--- Test: Response cache settings ---');
    const cacheToggle = frame.locator('[data-testid="response-cache-toggle"]');
    const count = await cacheToggle.count();
    log(`Cache toggle found: ${count > 0}`);

    await screenshot(app.window, 'interceptors-cache-settings');
  });

  test('should close settings', async () => {
    log('--- Test: Close settings ---');
    await closeSettings(frame);
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'interceptors-settings-closed');
  });
});
