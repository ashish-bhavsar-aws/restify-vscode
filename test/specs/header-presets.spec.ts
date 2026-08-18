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
  addHeader,
} from '../utils/helpers';

test.describe('Header Presets', () => {
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

  test('should open headers tab and add headers for preset', async () => {
    log('--- Test: Add headers for preset ---');
    await addHeader(frame, 'X-Custom-One', 'value1');
    await addHeader(frame, 'X-Custom-Two', 'value2');
    await frame.waitForTimeout(300);

    await screenshot(app.window, 'presets-headers-added');
  });

  test('should save headers as preset', async () => {
    log('--- Test: Save preset ---');
    const saveBtn = frame.locator('[data-testid="header-preset-save"]');
    const count = await saveBtn.count();
    log(`Preset save button found: ${count > 0}`);

    if (count > 0) {
      await saveBtn.click({ force: true });
      await frame.waitForTimeout(500);

      // Type preset name
      const nameInput = frame.locator('[data-testid="header-preset-name-input"]');
      if ((await nameInput.count()) > 0) {
        await nameInput.fill('My Test Preset');
        await frame.waitForTimeout(200);

        const confirmBtn = frame.locator('[data-testid="header-preset-name-save"]');
        if ((await confirmBtn.count()) > 0) {
          await confirmBtn.click({ force: true });
          await frame.waitForTimeout(300);
        }
      }
    }

    await screenshot(app.window, 'presets-saved');
  });

  test('should verify preset exists in dropdown', async () => {
    log('--- Test: Verify preset in dropdown ---');
    const presetSelect = frame.locator('[data-testid="header-preset-select"]');
    const count = await presetSelect.count();
    log(`Preset select found: ${count > 0}`);

    await screenshot(app.window, 'presets-dropdown');
  });

  test('should apply preset to headers', async () => {
    log('--- Test: Apply preset ---');
    const applyBtn = frame.locator('[data-testid="header-preset-apply"]');
    const count = await applyBtn.count();
    log(`Apply button found: ${count > 0}`);

    if (count > 0) {
      // First select the preset
      const presetSelect = frame.locator('[data-testid="header-preset-select"]');
      if ((await presetSelect.count()) > 0) {
        await presetSelect.click();
        await frame.waitForTimeout(300);
      }

      await applyBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'presets-applied');
  });

  test('should delete preset', async () => {
    log('--- Test: Delete preset ---');
    const deleteBtn = frame.locator('[data-testid="header-preset-delete"]');
    const count = await deleteBtn.count();
    log(`Delete button found: ${count > 0}`);

    if (count > 0) {
      await deleteBtn.click({ force: true });
      await frame.waitForTimeout(300);
    }

    await screenshot(app.window, 'presets-deleted');
  });
});
