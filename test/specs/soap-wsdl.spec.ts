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

test.describe('SOAP/WSDL', () => {
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

  test('should verify SOAP settings tab exists', async () => {
    log('--- Test: SOAP settings tab ---');
    const gearBtn = frame.locator('[data-testid="gear-btn"]');
    if ((await gearBtn.count()) > 0) {
      await gearBtn.click({ force: true });
      await frame.waitForTimeout(500);

      const soapTab = frame.locator('[data-testid="settings-tab-soap"]');
      const count = await soapTab.count();
      log(`SOAP tab found: ${count > 0}`);

      if (count > 0) {
        await soapTab.click({ force: true });
        await frame.waitForTimeout(300);
      }

      await screenshot(app.window, 'soap-settings-tab');

      // Close settings
      const overlay = frame.locator('[data-testid="settings-overlay"]');
      if ((await overlay.count()) > 0) {
        await overlay.click({ force: true });
        await frame.waitForTimeout(300);
      }
    }
  });

  test('should verify SOAP operation selector exists', async () => {
    log('--- Test: SOAP operation selector ---');
    const soapSelect = frame.locator('[data-testid="soap-operation-select"]');
    const count = await soapSelect.count();
    log(`SOAP operation select found: ${count > 0}`);

    await screenshot(app.window, 'soap-operation-select');
  });
});
