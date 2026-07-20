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
  clickRequestTab,
  clickResponseTab,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

const SIMPLE_SCRIPT = `log('Hello from script!');
var status = extract('$.status');
log('Status: ' + status);
extract('$.user.name', 'userName');
log('Extracted: ' + variables.userName);`;

test.describe('Post-Response Scripts', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Scripts] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Scripts] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Scripts] afterAll ===');
    await closeVSCode(app);
  });

  test('Navigate to script tab', async () => {
    log('--- Script tab ---');
    await clickRequestTab(mainFrame!, 'script');
    await mainFrame!.waitForTimeout(500);
    const body = (await mainFrame!.locator('[data-testid^="req-tab-script"]').textContent().catch(() => '')) ?? '';
    logCheck('Script tab active', body.length > 0);
    await screenshot(app.window, 'script-tab');
  });

  test('Script editor textarea exists', async () => {
    log('--- Script editor ---');
    const codeEditor = mainFrame!.locator('.monaco-editor, textarea, [role="textbox"]').first();
    const exists = (await codeEditor.count()) > 0;
    logCheck('Code editor found', exists);
    await screenshot(app.window, 'script-editor');
  });

  test('Write a post-response script', async () => {
    log('--- Write script ---');

    // Click inside the editor
    const codeEditor = mainFrame!.locator('.monaco-editor, textarea, [role="textbox"]').first();
    if (await codeEditor.count() > 0) {
      await codeEditor.click();
      await mainFrame!.waitForTimeout(200);
    }

    // Try clicking a line in the editor to focus
    const line = mainFrame!.locator('.view-line').first();
    if (await line.count() > 0) {
      await line.click();
      await mainFrame!.waitForTimeout(200);
    }

    // Type the script using page keyboard
    await app.window.keyboard.type(SIMPLE_SCRIPT, { delay: 10 });
    await mainFrame!.waitForTimeout(500);
    await screenshot(app.window, 'script-written');
    log('Script written');
  });

  test('Send request to trigger script execution', async () => {
    log('--- Send with script ---');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);

    // Wait for script to execute
    await mainFrame!.waitForTimeout(3000);
    await screenshot(app.window, 'script-executed');
    log('Script execution triggered');
  });

  test('Script logs appear in response', async () => {
    log('--- Check script logs ---');
    // Navigate to logs tab
    await clickResponseTab(mainFrame!, 'logs');
    await mainFrame!.waitForTimeout(500);

    const body = await getResponseText(mainFrame!);
    const hasScriptLog = body.includes('Hello from script') || body.includes('Script') || body.includes('Status:');
    logCheck('Script logs present', hasScriptLog);
    await screenshot(app.window, 'script-logs');
  });

  test('Script execution badge visible', async () => {
    log('--- Script badge ---');
    const badge = mainFrame!.locator('[class*="ScriptBadge"], [class*="Executed"]');
    const count = await badge.count();
    logCheck('Script badge found', count > 0);
    await screenshot(app.window, 'script-badge');
  });

  test('Error script handles errors gracefully', async () => {
    log('--- Error script ---');
    // Write a bad script
    await clickRequestTab(mainFrame!, 'script');
    await mainFrame!.waitForTimeout(300);

    const codeEditor = mainFrame!.locator('.monaco-editor, textarea, [role="textbox"]').first();
    if (await codeEditor.count() > 0) {
      await codeEditor.click();
      await mainFrame!.waitForTimeout(200);

      // Select all and clear
      await app.window.keyboard.press('Meta+A');
      await mainFrame!.waitForTimeout(100);
      await app.window.keyboard.press('Backspace');
      await mainFrame!.waitForTimeout(100);

      // Type error script
      await app.window.keyboard.type('throw new Error("intentional error");', { delay: 10 });
      await mainFrame!.waitForTimeout(300);
    }

    await setUrlAndSend(mainFrame!, mockUrl('/'));
    const ok = await waitForResponse(mainFrame!, 15_000);
    expect(ok).toBe(true);

    // Wait for script to fail
    await mainFrame!.waitForTimeout(2000);

    // Check logs tab for error
    await clickResponseTab(mainFrame!, 'logs');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    const hasError = body.includes('Error') || body.includes('error') || body.includes('intentional');
    logCheck('Error script handled', hasError);
    await screenshot(app.window, 'script-error');
  });

  test('Script success badge shows error state', async () => {
    log('--- Error badge ---');
    const badge = mainFrame!.locator('[class*="ScriptBadge"]').last();
    const text = (await badge.textContent().catch(() => '')) ?? '';
    logCheck('Badge shows Error', text.includes('Error') || text.includes('error'));
    await screenshot(app.window, 'script-error-badge');
  });
});
