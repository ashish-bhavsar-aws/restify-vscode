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
  setupMainPanel,
  setUrl,
  sendRequest,
  waitForResponse,
  getStatusCode,
  openEnvManager,
  closeEnvManager,
  createEnvironment,
  deleteEnvironment,
  selectEnvironment,
} from '../utils/helpers';

test.describe('Environments and Variables', () => {
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
    log('--- Test: Open environment manager ---');
    await openEnvManager(frame);
    await frame.waitForTimeout(500);

    const modal = frame.locator('[data-testid="env-manager-modal"]');
    const count = await modal.count();
    expect(count).toBeGreaterThan(0);

    await screenshot(app.window, 'env-manager-open');
  });

  test('should create a new environment with variables', async () => {
    log('--- Test: Create environment ---');
    await createEnvironment(frame, 'Test Environment', {
      baseUrl: 'http://localhost:3000',
      apiKey: 'test-api-key-123',
    });
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'env-created');
  });

  test('should select an environment from dropdown', async () => {
    log('--- Test: Select environment ---');
    await selectEnvironment(frame, 'Test Environment');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'env-selected');
  });

  test('should send request using environment variable', async () => {
    log('--- Test: Request with env variable ---');
    await setUrl(frame, '{{baseUrl}}/');
    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20000);
    expect(gotResponse).toBeTruthy();

    const status = await getStatusCode(frame);
    expect(status).toContain('200');

    await screenshot(app.window, 'env-request-variable');
  });

  test('should open environment manager and verify created env', async () => {
    log('--- Test: Verify environment in manager ---');
    await openEnvManager(frame);
    await frame.waitForTimeout(500);

    const modal = frame.locator('[data-testid="env-manager-modal"]');
    const text = await modal.textContent();
    expect(text).toContain('Test Environment');

    await screenshot(app.window, 'env-manager-verify');

    await closeEnvManager(frame);
  });

  test('should clean up test environment', async () => {
    log('--- Test: Delete environment ---');
    await deleteEnvironment(frame, 'Test Environment');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'env-deleted');
  });
});
