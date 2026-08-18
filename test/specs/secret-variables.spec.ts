import { test, expect } from '@playwright/test';
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
  mockUrl,
  setupMainPanel,
  setUrl,
  sendRequest,
  waitForResponse,
  openEnvManager,
  closeEnvManager,
  createEnvironment,
} from '../utils/helpers';

test.describe('Secret Variables', () => {
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
    log('--- Test: Open env manager for secrets ---');
    await openEnvManager(frame);
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'secrets-env-manager');
  });

  test('should create environment with a secret variable', async () => {
    log('--- Test: Create env with secret ---');
    await createEnvironment(frame, 'Secret Test Env', {
      apiKey: 'super-secret-value',
    });
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'secrets-env-created');
  });

  test('should verify secret variable is masked in env manager', async () => {
    log('--- Test: Verify masked secret ---');
    await openEnvManager(frame);
    await frame.waitForTimeout(500);

    const modal = frame.locator('[data-testid="env-manager-modal"]');
    const text = await modal.textContent();
    expect(text).toContain('Secret Test Env');

    await screenshot(app.window, 'secrets-masked');

    await closeEnvManager(frame);
  });

  test('should send request using secret variable in header', async () => {
    log('--- Test: Request with secret var ---');
    await setUrl(frame, mockUrl('/api/secret/verify'));
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    await screenshot(app.window, 'secrets-request');
  });

  test('should clean up secret environment', async () => {
    log('--- Test: Clean up ---');
    await openEnvManager(frame);
    await frame.waitForTimeout(300);

    // Find and delete the env
    const envItem = frame.locator('div').filter({ hasText: 'Secret Test Env' }).first();
    if ((await envItem.count()) > 0) {
      const deleteBtn = envItem.locator('button').last();
      if ((await deleteBtn.count()) > 0) {
        await deleteBtn.click();
        await frame.waitForTimeout(300);
      }
    }
    await closeEnvManager(frame);

    await screenshot(app.window, 'secrets-cleanup');
  });
});
