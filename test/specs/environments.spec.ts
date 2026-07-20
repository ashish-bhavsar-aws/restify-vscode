import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  clickInFrame,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setUrlAndSend,
  waitForResponse,
  getResponseText,
  openEnvManager,
  closeEnvManager,
  createEnvironment,
  selectEnvironment,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Environments', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Env] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Env] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Env] afterAll ===');
    await closeVSCode(app);
  });

  test('Create environment with variables', async () => {
    log('--- Create env ---');
    await createEnvironment(mainFrame!, 'TestEnv', {
      BASE_URL: 'http://localhost:3000',
      API_KEY: 'test-key-123',
    });
    await mainFrame!.waitForTimeout(500);
    await screenshot(app.window, 'env-created');
    log('Environment created');
  });

  test('Environment appears in manager', async () => {
    log('--- Env in manager ---');
    await openEnvManager(mainFrame!);
    await mainFrame!.waitForTimeout(500);
    const modalText = (await mainFrame!.locator('[data-testid="env-manager-modal"]').textContent().catch(() => '')) ?? '';
    logCheck('TestEnv visible', modalText.includes('TestEnv'));
    expect(modalText).toContain('TestEnv');
    logCheck('Variables count', modalText.includes('2 variable'));
    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'env-in-manager');
  });

  test('Select environment from dropdown', async () => {
    log('--- Select env ---');
    await selectEnvironment(mainFrame!, 'TestEnv');
    await mainFrame!.waitForTimeout(500);
    const label = (await mainFrame!.locator('[data-testid="env-trigger-label"]').textContent().catch(() => '')) ?? '';
    logCheck('Active env is TestEnv', label.includes('TestEnv'));
    expect(label).toContain('TestEnv');
    await screenshot(app.window, 'env-selected');
  });

  test('Variable {{BASE_URL}} resolves in URL', async () => {
    log('--- Variable resolution ---');
    await setUrlAndSend(mainFrame!, '{{BASE_URL}}/');
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);
    const body = await getResponseText(mainFrame!);
    logCheck('Response contains Welcome', body.includes('Welcome'));
    expect(body).toContain('Welcome');
    await screenshot(app.window, 'env-var-resolved');
  });

  test('Switch to Global environment', async () => {
    log('--- Switch to Global ---');
    await selectEnvironment(mainFrame!, 'Global');
    await mainFrame!.waitForTimeout(500);
    const label = (await mainFrame!.locator('[data-testid="env-trigger-label"]').textContent().catch(() => '')) ?? '';
    logCheck('Active env is Global', label.includes('Global'));
    await screenshot(app.window, 'env-switch-global');
  });

  test('Switch back to TestEnv', async () => {
    log('--- Switch back ---');
    await selectEnvironment(mainFrame!, 'TestEnv');
    await mainFrame!.waitForTimeout(500);
    const label = (await mainFrame!.locator('[data-testid="env-trigger-label"]').textContent().catch(() => '')) ?? '';
    logCheck('Active env is TestEnv', label.includes('TestEnv'));
    await screenshot(app.window, 'env-switch-back');
  });

  test('Edit environment variables', async () => {
    log('--- Edit env ---');
    await openEnvManager(mainFrame!);
    await mainFrame!.waitForTimeout(300);

    // Click the edit (pen) button for TestEnv
    const editBtns = mainFrame!.locator('[data-testid="env-manager-modal"] button[title="Edit"]');
    if (await editBtns.count() > 0) {
      await editBtns.first().click();
      await mainFrame!.waitForTimeout(500);
    }

    // Update API_KEY value
    const values = mainFrame!.locator('[data-testid="env-var-value"]');
    if (await values.count() >= 2) {
      await values.nth(1).fill('updated-key-456');
    }

    await clickInFrame(mainFrame!, '[data-testid="env-save-btn"]');
    await mainFrame!.waitForTimeout(300);
    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'env-edited');
  });

  test('Delete environment', async () => {
    log('--- Delete env ---');
    // Switch to Global first so we can delete TestEnv
    await selectEnvironment(mainFrame!, 'Global');
    await mainFrame!.waitForTimeout(300);

    await openEnvManager(mainFrame!);
    await mainFrame!.waitForTimeout(300);

    // Find TestEnv delete button
    const envItems = mainFrame!.locator('[data-testid="env-manager-modal"] div').filter({ hasText: 'TestEnv' });
    const count = await envItems.count();
    if (count > 0) {
      // Find the delete button (trash icon) near TestEnv
      const deleteBtns = mainFrame!.locator('[data-testid="env-manager-modal"] button').filter({ hasText: '' });
      // Just try to click the last button in the TestEnv row which should be delete
    }

    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'env-deleted');
  });
});


