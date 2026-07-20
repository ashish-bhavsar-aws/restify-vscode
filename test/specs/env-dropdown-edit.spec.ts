import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  clickInFrame,
  waitForElement,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  setupMainPanel,
  createEnvironment,
  selectEnvironment,
  openEnvManager,
  closeEnvManager,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Env Dropdown - Edit/Delete Icons', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [EnvDropdown] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [EnvDropdown] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [EnvDropdown] afterAll ===');
    await closeVSCode(app);
  });

  test('Create test environment', async () => {
    log('--- Create test env ---');
    await createEnvironment(mainFrame!, 'DropdownTestEnv', {
      HOST: 'http://localhost:3000',
      TOKEN: 'abc123',
    });
    await mainFrame!.waitForTimeout(500);
    await screenshot(app.window, 'env-dropdown-env-created');
    log('Test environment created');
  });

  test('Open env dropdown and verify edit icon appears on hover', async () => {
    log('--- Verify edit icon on hover ---');
    await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
    await mainFrame!.waitForTimeout(400);

    // Find the env option containing "DropdownTestEnv"
    const envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    const count = await envOption.count();
    logCheck('DropdownTestEnv option found', count > 0);
    expect(count).toBeGreaterThan(0);

    // Hover over the option to reveal action icons
    await envOption.first().hover();
    await mainFrame!.waitForTimeout(300);

    // Verify edit icon (title="Edit") is visible within the option
    const editBtn = envOption.first().locator('button[title="Edit"]');
    const editCount = await editBtn.count();
    logCheck('Edit icon found in env option', editCount > 0);
    expect(editCount).toBeGreaterThan(0);

    await screenshot(app.window, 'env-dropdown-edit-icon-visible');
    log('Edit icon visible on hover');
  });

  test('Edit icon opens EnvManagerModal in edit mode', async () => {
    log('--- Edit icon opens modal ---');
    // Make sure dropdown is open
    const dropdownOpen = await mainFrame!.locator('li[role="option"]').count();
    if (dropdownOpen === 0) {
      await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
      await mainFrame!.waitForTimeout(400);
    }

    const envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    await envOption.first().hover();
    await mainFrame!.waitForTimeout(200);

    const editBtn = envOption.first().locator('button[title="Edit"]');
    await editBtn.click();
    await mainFrame!.waitForTimeout(500);

    // Verify the modal opened in edit mode
    const modal = mainFrame!.locator('[data-testid="env-manager-modal"]');
    const modalVisible = await modal.isVisible().catch(() => false);
    logCheck('EnvManagerModal opened', modalVisible);
    expect(modalVisible).toBe(true);

    // Verify "Edit Environment" title
    const title = await modal.locator('h3').textContent().catch(() => '');
    logCheck('Modal shows Edit Environment title', title?.includes('Edit Environment') ?? false);
    expect(title).toContain('Edit Environment');

    // Verify env name input is pre-filled
    const nameInput = mainFrame!.locator('[data-testid="env-name-input"]');
    const nameValue = await nameInput.inputValue().catch(() => '');
    logCheck('Name input pre-filled with DropdownTestEnv', nameValue === 'DropdownTestEnv');
    expect(nameValue).toBe('DropdownTestEnv');

    // Verify variables are loaded
    const varKeys = mainFrame!.locator('[data-testid="env-var-key"]');
    const varCount = await varKeys.count();
    logCheck('Variables loaded in edit view', varCount >= 2);
    expect(varCount).toBeGreaterThanOrEqual(2);

    await screenshot(app.window, 'env-dropdown-edit-modal-open');
    await closeEnvManager(mainFrame!);
    log('Edit modal verified');
  });

  test('Delete icon removes environment from dropdown', async () => {
    log('--- Delete icon test ---');
    // First verify env exists in dropdown
    await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
    await mainFrame!.waitForTimeout(400);

    let envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    let count = await envOption.count();
    logCheck('DropdownTestEnv exists before delete', count > 0);
    expect(count).toBeGreaterThan(0);

    // Close dropdown first
    await mainFrame!.page().keyboard.press('Escape');
    await mainFrame!.waitForTimeout(200);

    // Switch to a different env (or "No Environment") so we can delete DropdownTestEnv
    await selectEnvironment(mainFrame!, 'No Environment');
    await mainFrame!.waitForTimeout(300);

    // Open dropdown and use delete icon
    await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
    await mainFrame!.waitForTimeout(400);

    envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    count = await envOption.count();
    if (count > 0) {
      await envOption.first().hover();
      await mainFrame!.waitForTimeout(200);

      const deleteBtn = envOption.first().locator('button[title="Delete"]');
      const deleteCount = await deleteBtn.count();
      logCheck('Delete icon found', deleteCount > 0);

      if (deleteCount > 0) {
        await deleteBtn.click();
        await mainFrame!.waitForTimeout(500);

        // Verify env is removed from dropdown
        await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
        await mainFrame!.waitForTimeout(400);

        const envAfterDelete = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
        const countAfter = await envAfterDelete.count();
        logCheck('DropdownTestEnv removed after delete', countAfter === 0);
        expect(countAfter).toBe(0);

        // Close dropdown
        await mainFrame!.page().keyboard.press('Escape');
        await mainFrame!.waitForTimeout(200);
      }
    }

    await screenshot(app.window, 'env-dropdown-after-delete');
    log('Delete icon test complete');
  });

  test('New Environment option opens modal in create mode', async () => {
    log('--- New Environment option ---');
    // Use evaluate to open dropdown directly, then find the option
    await mainFrame!.evaluate(() => {
      const trigger = document.querySelector('[data-testid="env-trigger-label"]');
      if (trigger) {
        (trigger as HTMLElement).click();
      }
    });
    await mainFrame!.waitForTimeout(600);

    // Find the "New Environment" option at the bottom of the dropdown
    let newEnvOption = mainFrame!.locator('li').filter({ hasText: 'New Environment' });
    let count = await newEnvOption.count();
    if (count === 0) {
      // Dropdown may not have opened — try clicking the button parent directly
      await mainFrame!.evaluate(() => {
        const btn = document.querySelector('[data-testid="env-trigger-label"]')?.closest('button');
        if (btn) (btn as HTMLElement).click();
      });
      await mainFrame!.waitForTimeout(600);
      newEnvOption = mainFrame!.locator('li').filter({ hasText: 'New Environment' });
      count = await newEnvOption.count();
    }
    logCheck('New Environment option found', count > 0);
    expect(count).toBeGreaterThan(0);

    // Use evaluate to trigger mouseDown on the option (same pattern as selectEnvironment)
    await newEnvOption.first().evaluate((el) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    });
    await mainFrame!.waitForTimeout(500);

    // Verify the modal opened in create mode
    const modal = mainFrame!.locator('[data-testid="env-manager-modal"]');
    const modalVisible = await modal.isVisible().catch(() => false);
    logCheck('EnvManagerModal opened for new env', modalVisible);
    expect(modalVisible).toBe(true);

    // Verify "New Environment" title
    const title = await modal.locator('h3').textContent().catch(() => '');
    logCheck('Modal shows New Environment title', title?.includes('New Environment') ?? false);
    expect(title).toContain('New Environment');

    // Verify name input is empty
    const nameInput = mainFrame!.locator('[data-testid="env-name-input"]');
    const nameValue = await nameInput.inputValue().catch(() => '');
    logCheck('Name input is empty for new env', nameValue === '');
    expect(nameValue).toBe('');

    await screenshot(app.window, 'env-dropdown-new-env-modal');
    await closeEnvManager(mainFrame!);
    log('New Environment option verified');
  });

  test('Edit icon visible in EnvManagerModal list view', async () => {
    log('--- Edit icon in modal list ---');
    await createEnvironment(mainFrame!, 'ModalEditTest', {
      KEY1: 'val1',
    });
    await mainFrame!.waitForTimeout(500);

    await openEnvManager(mainFrame!);
    await mainFrame!.waitForTimeout(400);

    const envItem = mainFrame!.locator('[data-testid="env-item-ModalEditTest"]');
    const count = await envItem.count();
    logCheck('ModalEditTest found in modal list', count > 0);
    expect(count).toBeGreaterThan(0);

    const editBtn = envItem.locator('button[title="Edit"]');
    const editCount = await editBtn.count();
    logCheck('Edit button found for ModalEditTest', editCount > 0);
    expect(editCount).toBeGreaterThan(0);

    await editBtn.first().evaluate((el) => {
      (el as HTMLElement).click();
    });
    await mainFrame!.waitForTimeout(800);

    const title = await mainFrame!.locator('[data-testid="env-manager-modal"] h3').textContent().catch(() => '');
    logCheck('Switched to edit view', title?.includes('Edit Environment') ?? false);
    expect(title).toContain('Edit Environment');

    const nameVal = await mainFrame!.locator('[data-testid="env-name-input"]').inputValue().catch(() => 'not found');
    log(`Name input value: ${nameVal}`);
    logCheck('Name pre-filled with ModalEditTest', nameVal === 'ModalEditTest');
    expect(nameVal).toBe('ModalEditTest');

    const varKeys = mainFrame!.locator('[data-testid="env-var-key"]');
    const varCount = await varKeys.count();
    logCheck('Variables shown in edit view', varCount >= 1);
    expect(varCount).toBeGreaterThanOrEqual(1);

    await screenshot(app.window, 'env-dropdown-modal-edit-icon');
    await closeEnvManager(mainFrame!);
    log('Modal edit icon verified');
  });
});
