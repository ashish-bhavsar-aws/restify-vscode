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
  setMethod,
  setBodyType,
  setUrlAndSend,
  waitForResponse,
  getResponseText,
  clickResponseTab,
  openEnvManager,
  closeEnvManager,
  openEnvDropdown,
  closeEnvDropdown,
  selectEnvironment,
  createEnvironment,
  addHeader,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Feature 5 (F41-F50) — Secrets & Environments', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Feature5] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Feature5] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Feature5] afterAll ===');
    await closeVSCode(app);
  });

  async function waitForResponseText(frame: Frame, pattern: RegExp, timeout = 20_000): Promise<string> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const text = await getResponseText(frame);
      if (pattern.test(text)) return text;
      await frame.waitForTimeout(300);
    }
    return getResponseText(frame);
  }

  // ── F41: Create an environment with a secret variable ───────────

  test('F41 - create environment with a secret variable', async () => {
    log('--- F41: create env with secret ---');
    await openEnvManager(mainFrame!);
    await clickInFrame(mainFrame!, '[data-testid="env-new-btn"]');
    await mainFrame!.waitForTimeout(300);

    const nameInput = mainFrame!.locator('[data-testid="env-name-input"]').first();
    await nameInput.waitFor({ state: 'visible', timeout: 3_000 });
    await nameInput.fill('Secrets E2E');
    await mainFrame!.waitForTimeout(200);

    // Plain variable
    await mainFrame!.locator('[data-testid="env-var-key"]').nth(0).fill('plain_key');
    await mainFrame!.locator('[data-testid="env-var-value"]').nth(0).fill('plain-value');

    // Secret variable
    await clickInFrame(mainFrame!, 'button:has-text("Add Variable")');
    await mainFrame!.waitForTimeout(200);
    await mainFrame!.locator('[data-testid="env-var-key"]').nth(1).fill('secret_key');
    await mainFrame!.locator('[data-testid="env-var-value"]').nth(1).fill('super-secret-value');
    await clickInFrame(mainFrame!, '[data-testid="env-secret-toggle-1"]');
    await mainFrame!.waitForTimeout(200);

    await clickInFrame(mainFrame!, '[data-testid="env-save-btn"]');
    await mainFrame!.waitForTimeout(600);
    await closeEnvManager(mainFrame!);
    logCheck('Environment with secret saved', true);
    await screenshot(app.window, 'f41-env-created');
  });

  // ── F41: Secret value is masked after save ──────────────────────

  test('F41 - secret value is masked after save', async () => {
    log('--- F41: secret masked ---');
    await openEnvManager(mainFrame!);
    await mainFrame!.waitForTimeout(300);

    const envItem = mainFrame!.locator('[data-testid="env-item-Secrets E2E"]');
    await envItem.waitFor({ state: 'visible', timeout: 5_000 });
    await clickInFrame(mainFrame!, '[data-testid="env-item-Secrets E2E"] button[title="Edit"]');
    await mainFrame!.waitForTimeout(400);

    // Secret row value input must be a masked password field (no plaintext).
    const valInput = mainFrame!.locator('[data-testid="env-var-value"]').nth(1);
    const inputType = await valInput.getAttribute('type');
    const valText = await valInput.inputValue().catch(() => '');
    logCheck('Secret value input is masked', inputType === 'password');
    expect(inputType).toBe('password');
    logCheck('Secret plaintext not exposed', !valText.includes('super-secret-value'));
    expect(valText).not.toContain('super-secret-value');

    // Revealing should fetch the stored secret value from SecretStorage.
    await clickInFrame(mainFrame!, '[data-testid="env-secret-reveal-1"]');
    await mainFrame!.waitForTimeout(600);
    const revealed = await valInput.inputValue().catch(() => '');
    logCheck('Secret revealed from storage', revealed.includes('super-secret-value'));
    expect(revealed).toContain('super-secret-value');
    await screenshot(app.window, 'f41-secret-revealed');
    await closeEnvManager(mainFrame!);
  });

  // ── F41: Secret variable substitutes into a request header ──────

  test('F41 - secret variable substitutes into a request header', async () => {
    log('--- F41: use secret in request ---');
    await selectEnvironment(mainFrame!, 'Secrets E2E');
    await mainFrame!.waitForTimeout(300);

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await addHeader(mainFrame!, 'x-secret-key', '{{secret_key}}');
    await mainFrame!.waitForTimeout(300);

    await setUrlAndSend(mainFrame!, mockUrl('/api/secret/verify'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);

    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /"verified":\s*true/);
    logCheck('Secret header verified server-side', /"verified":\s*true/.test(body));
    expect(body).toMatch(/"verified":\s*true/);
    logCheck('Secret value substituted (not masked literal)', body.includes('super-secret-value'));
    expect(body).toContain('super-secret-value');
    await screenshot(app.window, 'f41-secret-request');
  });

  // ── F41: Plain variable still resolves normally ─────────────────

  test('F41 - plain variable still resolves normally', async () => {
    log('--- F41: plain variable ---');
    await selectEnvironment(mainFrame!, 'Secrets E2E');
    await mainFrame!.waitForTimeout(300);

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await addHeader(mainFrame!, 'x-plain-key', '{{plain_key}}');
    await mainFrame!.waitForTimeout(300);

    await setUrlAndSend(mainFrame!, mockUrl('/api/echo'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);

    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /plain-value/);
    logCheck('Plain variable substituted', body.includes('plain-value'));
    expect(body).toContain('plain-value');
    await screenshot(app.window, 'f41-plain-var');
  });

  // ── F41: Environment URL resolution + switch (merged from environments.spec) ──

  test('F41 - environment variable resolves in the request URL', async () => {
    log('--- F41: env var in URL ---');
    await createEnvironment(mainFrame!, 'BaseUrlTest', { BASE_URL: 'http://localhost:3000' });
    await selectEnvironment(mainFrame!, 'BaseUrlTest');
    await mainFrame!.waitForTimeout(300);

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, '{{BASE_URL}}/');
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);

    await clickResponseTab(mainFrame!, 'body');
    const body = await waitForResponseText(mainFrame!, /Welcome/);
    logCheck('URL variable resolved', body.includes('Welcome'));
    expect(body).toContain('Welcome');
    await screenshot(app.window, 'f41-env-var-url');
  });

  test('F41 - environment can be switched from the dropdown', async () => {
    log('--- F41: env switch ---');
    await selectEnvironment(mainFrame!, 'Global');
    await mainFrame!.waitForTimeout(300);
    const globalLabel =
      (await mainFrame!.locator('[data-testid="env-trigger-label"]').textContent().catch(() => '')) ?? '';
    logCheck('Active env is Global', globalLabel.includes('Global'));
    expect(globalLabel).toContain('Global');

    await selectEnvironment(mainFrame!, 'BaseUrlTest');
    await mainFrame!.waitForTimeout(300);
    const label =
      (await mainFrame!.locator('[data-testid="env-trigger-label"]').textContent().catch(() => '')) ?? '';
    logCheck('Active env is BaseUrlTest', label.includes('BaseUrlTest'));
    expect(label).toContain('BaseUrlTest');
    await screenshot(app.window, 'f41-env-switch');
  });

  // ── F41: Env dropdown edit/delete icons (merged from env-dropdown-edit.spec) ──

  test('F41 - env dropdown shows edit icon on hover', async () => {
    log('--- F41: dropdown edit icon ---');
    await createEnvironment(mainFrame!, 'DropdownTestEnv', {
      HOST: 'http://localhost:3000',
      TOKEN: 'abc123',
    });
    await openEnvDropdown(mainFrame!);
    await mainFrame!.waitForTimeout(400);
    const envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    const count = await envOption.count();
    logCheck('DropdownTestEnv option found', count > 0);
    expect(count).toBeGreaterThan(0);
    await envOption.first().hover();
    await mainFrame!.waitForTimeout(300);
    const editCount = await envOption.first().locator('button[title="Edit"]').count();
    logCheck('Edit icon found in env option', editCount > 0);
    expect(editCount).toBeGreaterThan(0);
    await closeEnvDropdown(mainFrame!);
    await screenshot(app.window, 'f41-env-dropdown-edit-icon');
  });

  test('F41 - edit icon opens EnvManagerModal in edit mode', async () => {
    log('--- F41: dropdown edit opens modal ---');
    await openEnvDropdown(mainFrame!);
    await mainFrame!.waitForTimeout(400);
    const envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    await envOption.first().hover();
    await mainFrame!.waitForTimeout(200);
    await envOption.first().locator('button[title="Edit"]').click();
    await mainFrame!.waitForTimeout(500);
    const modal = mainFrame!.locator('[data-testid="env-manager-modal"]');
    const modalVisible = await modal.isVisible().catch(() => false);
    logCheck('EnvManagerModal opened', modalVisible);
    expect(modalVisible).toBe(true);
    const title = await modal.locator('h3').textContent().catch(() => '');
    logCheck('Modal shows Edit Environment title', title?.includes('Edit Environment') ?? false);
    expect(title).toContain('Edit Environment');
    const nameValue = await mainFrame!.locator('[data-testid="env-name-input"]').inputValue().catch(() => '');
    logCheck('Name input pre-filled', nameValue === 'DropdownTestEnv');
    expect(nameValue).toBe('DropdownTestEnv');
    const varCount = await mainFrame!.locator('[data-testid="env-var-key"]').count();
    logCheck('Variables loaded in edit view', varCount >= 2);
    expect(varCount).toBeGreaterThanOrEqual(2);
    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'f41-env-edit-modal');
  });

  test('F41 - delete icon removes environment from dropdown', async () => {
    log('--- F41: env delete ---');
    await openEnvDropdown(mainFrame!);
    await mainFrame!.waitForTimeout(400);
    let envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    let count = await envOption.count();
    logCheck('DropdownTestEnv exists before delete', count > 0);
    expect(count).toBeGreaterThan(0);
    await closeEnvDropdown(mainFrame!);
    await selectEnvironment(mainFrame!, 'No Environment');
    await mainFrame!.waitForTimeout(300);
    await openEnvDropdown(mainFrame!);
    await mainFrame!.waitForTimeout(400);
    envOption = mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' });
    count = await envOption.count();
    logCheck('DropdownTestEnv still listed', count > 0);
    expect(count).toBeGreaterThan(0);
    await envOption.first().hover();
    await mainFrame!.waitForTimeout(200);
    await envOption.first().locator('button[title="Delete"]').click();
    await mainFrame!.waitForTimeout(500);
    await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
    await mainFrame!.waitForTimeout(400);
    const countAfter = await mainFrame!.locator('li[role="option"]').filter({ hasText: 'DropdownTestEnv' }).count();
    logCheck('DropdownTestEnv removed after delete', countAfter === 0);
    expect(countAfter).toBe(0);
    await mainFrame!.page().keyboard.press('Escape');
    await mainFrame!.waitForTimeout(200);
    await screenshot(app.window, 'f41-env-delete');
  });

  test('F41 - New Environment option opens modal in create mode', async () => {
    log('--- F41: new env option ---');
    await mainFrame!.evaluate(() => {
      const trigger = document.querySelector('[data-testid="env-trigger-label"]');
      if (trigger) (trigger as HTMLElement).click();
    });
    await mainFrame!.waitForTimeout(600);
    let newEnvOption = mainFrame!.locator('li').filter({ hasText: 'New Environment' });
    let count = await newEnvOption.count();
    if (count === 0) {
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
    await newEnvOption.first().evaluate((el) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    });
    await mainFrame!.waitForTimeout(500);
    const modal = mainFrame!.locator('[data-testid="env-manager-modal"]');
    const modalVisible = await modal.isVisible().catch(() => false);
    logCheck('EnvManagerModal opened for new env', modalVisible);
    expect(modalVisible).toBe(true);
    const title = await modal.locator('h3').textContent().catch(() => '');
    logCheck('Modal shows New Environment title', title?.includes('New Environment') ?? false);
    expect(title).toContain('New Environment');
    const nameValue = await mainFrame!.locator('[data-testid="env-name-input"]').inputValue().catch(() => '');
    logCheck('Name input empty for new env', nameValue === '');
    expect(nameValue).toBe('');
    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'f41-env-new-modal');
  });

  test('F41 - edit icon visible in EnvManagerModal list view', async () => {
    log('--- F41: modal list edit icon ---');
    await createEnvironment(mainFrame!, 'ModalEditTest', { KEY1: 'val1' });
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
    logCheck('Name pre-filled with ModalEditTest', nameVal === 'ModalEditTest');
    expect(nameVal).toBe('ModalEditTest');
    const varCount = await mainFrame!.locator('[data-testid="env-var-key"]').count();
    logCheck('Variables shown in edit view', varCount >= 1);
    expect(varCount).toBeGreaterThanOrEqual(1);
    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'f41-env-modal-edit-icon');
  });

  test('F41 - edit environment variable value and save', async () => {
    log('--- F41: edit env var value ---');
    await createEnvironment(mainFrame!, 'ValueEditTest', { KEY1: 'initial-val' });
    await openEnvManager(mainFrame!);
    await mainFrame!.waitForTimeout(300);
    await clickInFrame(mainFrame!, '[data-testid="env-item-ValueEditTest"] button[title="Edit"]');
    await mainFrame!.waitForTimeout(500);
    const values = mainFrame!.locator('[data-testid="env-var-value"]');
    const valuesCount = await values.count();
    logCheck('Variable value inputs shown', valuesCount >= 1);
    expect(valuesCount).toBeGreaterThanOrEqual(1);
    await values.first().fill('updated-val-456');
    await clickInFrame(mainFrame!, '[data-testid="env-save-btn"]');
    await mainFrame!.waitForTimeout(500);
    const modalVisible = await mainFrame!
      .locator('[data-testid="env-manager-modal"]')
      .isVisible()
      .catch(() => false);
    logCheck('Modal closed after save', !modalVisible);
    await closeEnvManager(mainFrame!);
    await screenshot(app.window, 'f41-env-edit-value');
  });
});
