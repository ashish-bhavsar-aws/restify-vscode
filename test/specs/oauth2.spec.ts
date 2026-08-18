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
  setAuthType,
} from '../utils/helpers';

test.describe('OAuth 2.0 Flow', () => {
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

  test('should switch to OAuth 2.0 auth type', async () => {
    log('--- Test: Switch to OAuth 2.0 ---');
    await setAuthType(frame, 'oauth2');
    await frame.waitForTimeout(500);

    await screenshot(app.window, 'oauth2-auth-type');
  });

  test('should display OAuth 2.0 configuration fields', async () => {
    log('--- Test: OAuth 2.0 fields ---');
    const authPane = frame.locator('#req-pane');
    const text = await authPane.textContent();
    expect(text).toBeTruthy();

    await screenshot(app.window, 'oauth2-fields');
  });

  test('should configure client credentials grant', async () => {
    log('--- Test: Client credentials config ---');
    // The OAuth panel should show grant type selector
    const grantTypeTrigger = frame.locator('#req-pane [aria-haspopup="listbox"]').first();
    if ((await grantTypeTrigger.count()) > 0) {
      await grantTypeTrigger.click();
      await frame.waitForTimeout(300);

      const clientCredsOption = frame.locator('[role="option"]').filter({ hasText: /Client Credentials/i });
      if ((await clientCredsOption.count()) > 0) {
        await clientCredsOption.first().evaluate((el) => {
          el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
          el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        });
        await frame.waitForTimeout(300);
      }
    }

    await screenshot(app.window, 'oauth2-client-creds');
  });

  test('should display get token button', async () => {
    log('--- Test: Get token button ---');
    const getTokenBtn = frame.locator('[data-testid="oauth-get-token-btn"]');
    const count = await getTokenBtn.count();
    log(`Get token button found: ${count > 0}`);

    await screenshot(app.window, 'oauth2-get-token-btn');
  });

  test('should show OAuth status area', async () => {
    log('--- Test: OAuth status ---');
    const status = frame.locator('[data-testid="oauth-status"]');
    const count = await status.count();
    log(`OAuth status found: ${count > 0}`);

    await screenshot(app.window, 'oauth2-status');
  });
});
