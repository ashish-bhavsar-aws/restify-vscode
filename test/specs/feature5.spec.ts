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
  selectEnvironment,
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
});
