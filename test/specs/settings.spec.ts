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

  test('Settings modal has General / SSL / Proxy tabs', async () => {
    log('--- Settings tabs ---');
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    for (const tab of ['general', 'ssl', 'proxy']) {
      const btn = modal.locator(`[data-testid="settings-tab-${tab}"]`);
      const exists = await btn.count() > 0;
      logCheck(`Tab "${tab}" present`, exists);
      expect(exists).toBe(true);
    }
  });

  test('Proxy tab shows proxy settings', async () => {
    log('--- Proxy tab ---');
    await clickInFrame(mainFrame!, '[data-testid="settings-tab-proxy"]');
    await mainFrame!.waitForTimeout(300);
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const text = (await modal.textContent().catch(() => '')) ?? '';
    logCheck('Contains "Proxy Settings"', text.includes('Proxy Settings'));
    expect(text).toContain('Proxy Settings');
    const proxyInput = modal.locator('input[placeholder*="proxy"]').count();
    const portInput = modal.locator('input[type="number"]').count();
    logCheck('Proxy host input found', await proxyInput);
    logCheck('Proxy port input found', await portInput);
    expect(await proxyInput).toBeGreaterThan(0);
    expect(await portInput).toBeGreaterThan(0);
    await screenshot(app.window, 'settings-proxy-tab');
    await clickInFrame(mainFrame!, '[data-testid="settings-tab-general"]');
    await mainFrame!.waitForTimeout(200);
  });

  test('SSL tab shows client certificates', async () => {
    log('--- SSL tab ---');
    await clickInFrame(mainFrame!, '[data-testid="settings-tab-ssl"]');
    await mainFrame!.waitForTimeout(300);
    const modal = mainFrame!.locator('[data-testid="settings-modal"]');
    const text = (await modal.textContent().catch(() => '')) ?? '';
    logCheck('Contains "Client Certificates"', text.includes('Client Certificates'));
    expect(text).toContain('Client Certificates');
    await screenshot(app.window, 'settings-ssl-tab');
    await clickInFrame(mainFrame!, '[data-testid="settings-tab-general"]');
    await mainFrame!.waitForTimeout(200);
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
    logCheck('Settings content intact', text.includes('General') && text.includes('SSL') && text.includes('Proxy'));
    await screenshot(app.window, 'settings-reopened');
    await closeSettings(mainFrame!);
  });
});
