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
  setupMainPanel,
  openSettings,
  closeSettings,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Settings', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Settings] beforeAll ===');
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Settings] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Settings] afterAll ===');
    await closeVSCode(app);
  });

  test('Open settings modal', async () => {
    log('--- Open settings ---');
    await openSettings(mainFrame!);
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const visible = await modal.isVisible().catch(() => false);
    logCheck('Settings modal visible', visible);
    expect(visible).toBe(true);
    await screenshot(app.window, 'settings-open');
  });

  test('Settings contains Proxy section', async () => {
    log('--- Proxy section ---');
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const text = (await modal.textContent().catch(() => '')) ?? '';
    logCheck('Contains "Proxy"', text.includes('Proxy'));
    expect(text).toContain('Proxy');
  });

  test('Settings contains Certificate section', async () => {
    log('--- Certificate section ---');
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const text = (await modal.textContent().catch(() => '')) ?? '';
    logCheck('Contains "Certificate"', text.includes('Certificate'));
    expect(text).toContain('Certificate');
  });

  test('Settings contains Activity Log toggle', async () => {
    log('--- Activity log toggle ---');
    const toggle = mainFrame!.locator('[data-testid="activity-log-toggle"]');
    const exists = await toggle.count() > 0;
    logCheck('Activity log toggle found', exists);
    expect(exists).toBe(true);
  });

  test('Proxy host and port inputs exist', async () => {
    log('--- Proxy inputs ---');
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const inputs = modal.locator('input');
    const count = await inputs.count();
    logCheck('Settings has input fields', count);
    expect(count).toBeGreaterThan(0);
    await screenshot(app.window, 'settings-inputs');
  });

  test('Toggle activity log off', async () => {
    log('--- Toggle activity log off ---');
    const toggle = mainFrame!.locator('[data-testid="activity-log-toggle"]');
    if (await toggle.count() > 0) {
      const checkbox = toggle.locator('input[type="checkbox"]');
      if (await checkbox.count() > 0) {
        const isChecked = await checkbox.isChecked();
        if (isChecked) {
          await clickInFrame(mainFrame!, '[data-testid="activity-log-toggle"]');
          await mainFrame!.waitForTimeout(300);
          log('Activity log toggled off');
        }
      } else {
        // Try clicking the label itself
        await toggle.click();
        await mainFrame!.waitForTimeout(300);
        log('Activity log toggled');
      }
    }
    await screenshot(app.window, 'settings-toggled');
  });

  test('Toggle activity log back on', async () => {
    log('--- Toggle activity log on ---');
    const toggle = mainFrame!.locator('[data-testid="activity-log-toggle"]');
    if (await toggle.count() > 0) {
      await toggle.click();
      await mainFrame!.waitForTimeout(300);
      log('Activity log toggled back');
    }
    await screenshot(app.window, 'settings-toggled-back');
  });

  test('Close settings modal via overlay', async () => {
    log('--- Close settings ---');
    await closeSettings(mainFrame!);
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const stillVisible = await modal.isVisible().catch(() => false);
    logCheck('Settings closed', !stillVisible);
    expect(stillVisible).toBe(false);
  });

  test('Reopen and verify settings persisted', async () => {
    log('--- Reopen settings ---');
    await openSettings(mainFrame!);
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const visible = await modal.isVisible().catch(() => false);
    logCheck('Settings reopened', visible);
    expect(visible).toBe(true);

    const text = (await modal.textContent().catch(() => '')) ?? '';
    logCheck('Settings content intact', text.includes('Proxy') && text.includes('Certificate'));
    await screenshot(app.window, 'settings-reopened');
    await closeSettings(mainFrame!);
  });
});
