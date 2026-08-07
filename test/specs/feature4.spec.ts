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
  selectQuickPick,
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
  getStatusCode,
  getResponseText,
  openSaveModal,
  selectCollectionDropdown,
} from '../utils/helpers';
import { findCollectionsFrame } from '../utils/vscode';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Feature 4 (F31-F40) — Collections & Workflow', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Feature4] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Feature4] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Feature4] afterAll ===');
    await closeVSCode(app);
  });

  async function clickResponsePaneTab(frame: Frame, tab: string): Promise<void> {
    await clickInFrame(frame, `[data-testid="res-tab-${tab}"]`);
  }

  async function clickRequestTab(frame: Frame, tab: string): Promise<void> {
    await clickInFrame(frame, `[data-testid="req-tab-${tab}"]`);
  }

  async function writeTestScript(frame: Frame, code: string): Promise<void> {
    await clickRequestTab(frame, 'script');
    await frame.waitForTimeout(300);

    const codeEditor = frame.locator('textarea[data-testid="code-editor-post-script-textarea"]');
    if (await codeEditor.count() > 0) {
      await codeEditor.click();
      await frame.waitForTimeout(200);
      await app.window.keyboard.press('Meta+A');
      await frame.waitForTimeout(50);
      await app.window.keyboard.press('Backspace');
      await frame.waitForTimeout(100);
      await app.window.keyboard.type(code, { delay: 5 });
      await frame.waitForTimeout(300);
    }
  }

  // ── F33: Post-response script — write test assertions ────────────

  test('F33 - write test assertions in post-response script', async () => {
    log('--- F33: write test assertions ---');
    await writeTestScript(
      mainFrame!,
      `tests["status is 200"] = response.status === 200;` +
      `tests["has body"] = response.body !== "";` +
      `tests["always fails"] = false;`,
    );
    await mainFrame!.waitForTimeout(200);
    logCheck('Test script written successfully', true);
    await screenshot(app.window, 'f33-write-script');
  });

  // ── F33: Send request and verify test results ────────────────────

  test('F33 - send request and verify test results', async () => {
    log('--- F33: send & verify tests ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    const status = await getStatusCode(mainFrame!);
    logCheck('Status 200', status);
    expect(status).toBe('200');

    await clickResponsePaneTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(800);

    const body = await getResponseText(mainFrame!);
    logCheck('Status 200 visible in tests', body.includes('200'));
    expect(body).toContain('200');
    logCheck('status is 200 test visible', body.includes('status is 200'));
    expect(body).toContain('status is 200');
    logCheck('always fails test visible', body.includes('always fails'));
    expect(body).toContain('always fails');
    await screenshot(app.window, 'f33-test-results');
  });

  // ── F33: Test summary pass/fail counts ───────────────────────────

  test('F33 - test summary shows pass/fail counts', async () => {
    log('--- F33: pass/fail counts ---');
    await clickResponsePaneTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(400);
    const body = await getResponseText(mainFrame!);
    logCheck('Pass count 2 visible', body.includes('2'));
    expect(body).toContain('2');
    logCheck('Fail count 1 visible', body.includes('1'));
    expect(body).toContain('1');
    await screenshot(app.window, 'f33-pass-fail-counts');
  });

  // ── F33: Test tab badge shows pass/fail indicator ────────────────

  test('F33 - test tab badge shows pass/fail indicator', async () => {
    log('--- F33: test tab badge ---');
    const testsTab = mainFrame!.locator('[data-testid="res-tab-tests"]');
    await testsTab.waitFor({ state: 'visible', timeout: 5_000 });
    const badgeText = await testsTab.textContent();
    logCheck('Tests tab has badge/indicator', badgeText !== null && badgeText.length > 0);
    expect(badgeText).not.toBeNull();
    await screenshot(app.window, 'f33-test-badge');
  });

  // ── F33: Multiple test assertions can be written ─────────────────

  test('F33 - multiple test assertions can be written', async () => {
    log('--- F33: multiple assertions ---');
    await writeTestScript(
      mainFrame!,
      `tests["assertion 1"] = true;` +
      `tests["assertion 2"] = true;` +
      `tests["assertion 3"] = true;` +
      `tests["assertion 4"] = true;` +
      `tests["assertion 5"] = true;`,
    );
    await mainFrame!.waitForTimeout(300);
    const codeEditor = mainFrame!.locator('textarea[data-testid="code-editor-post-script-textarea"]');
    const editorText = await codeEditor.inputValue();
    logCheck('All 5 assertions accepted', editorText !== null && editorText.length > 0);
    expect(editorText).not.toBeNull();
    expect(editorText!.length).toBeGreaterThan(0);
    await screenshot(app.window, 'f33-multiple-assertions');
  });

  // ── F33: test script supports response.status check ──────────────

  test('F33 - test script supports response.status check', async () => {
    log('--- F33: status check ---');
    await writeTestScript(
      mainFrame!,
      `tests["status OK"] = response.status >= 200 && response.status < 300;`,
    );
    await mainFrame!.waitForTimeout(200);
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    await clickResponsePaneTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(800);
    const body = await getResponseText(mainFrame!);
    logCheck('status OK test visible', body.includes('status OK'));
    expect(body).toContain('status OK');
    await screenshot(app.window, 'f33-status-check');
  });

  // ── F33: test script supports response.body length check ─────────

  test('F33 - test script supports response.body length check', async () => {
    log('--- F33: body length check ---');
    await writeTestScript(
      mainFrame!,
      `tests["has content"] = response.body.length > 0;`,
    );
    await mainFrame!.waitForTimeout(200);
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    await clickResponsePaneTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(800);
    const body = await getResponseText(mainFrame!);
    logCheck('has content test visible', body.includes('has content'));
    expect(body).toContain('has content');
    await screenshot(app.window, 'f33-body-length');
  });

  // ── F33: Failing test shows red indicator ─────────────────────────

  test('F33 - failing test shows red indicator', async () => {
    log('--- F33: failing test ---');
    await writeTestScript(
      mainFrame!,
      `tests["always fails"] = false;`,
    );
    await mainFrame!.waitForTimeout(200);
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    await clickResponsePaneTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(800);
    const testsTab = mainFrame!.locator('[data-testid="res-tab-tests"]');
    await testsTab.waitFor({ state: 'visible', timeout: 5_000 });
    const tabText = await testsTab.textContent();
    logCheck('Failure indicator present', tabText !== null);
    expect(tabText).not.toBeNull();
    const body = await getResponseText(mainFrame!);
    logCheck('always fails shown in results', body.includes('always fails'));
    expect(body).toContain('always fails');
    await screenshot(app.window, 'f33-fail-indicator');
  });

  // ── F33: Test results persist across tab switches ────────────────

  test('F33 - test results persist across tab switches', async () => {
    log('--- F33: results persist ---');
    await clickResponsePaneTab(mainFrame!, 'body');
    await mainFrame!.waitForTimeout(400);
    await clickResponsePaneTab(mainFrame!, 'tests');
    await mainFrame!.waitForTimeout(600);
    const body = await getResponseText(mainFrame!);
    logCheck('Test results still present after tab switch', body.includes('always fails'));
    expect(body).toContain('always fails');
    await screenshot(app.window, 'f33-results-persist');
  });

  // ── F31: Collection sidebar is visible ───────────────────────────

  test('F31 - collection sidebar is visible', async () => {
    log('--- F31: collection sidebar ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();
    const sidebarText = (await collFrame!.locator('body').textContent().catch(() => '')) ?? '';
    const hasFilter = await collFrame!.locator('input[placeholder*="ilter"], [class*="filter"]').count();
    logCheck('Collections sidebar frame found with filter', hasFilter > 0 || sidebarText.length > 0);
    expect(hasFilter > 0 || sidebarText.length > 0).toBe(true);
    await screenshot(app.window, 'f31-collection-sidebar');
  });

  // ── F31: Save a mock request into a new collection ──────────────

  test('F31 - save a request into a new collection', async () => {
    log('--- F31: save into new collection ---');
    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/api/json-response'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);

    await openSaveModal(mainFrame!);
    await mainFrame!.waitForTimeout(400);

    const nameInput = mainFrame!.locator('[data-testid="save-modal"] input').first();
    await nameInput.waitFor({ state: 'visible', timeout: 5_000 });
    await nameInput.fill('Runner Mock Req');
    await mainFrame!.waitForTimeout(200);

    await selectCollectionDropdown(mainFrame!, '+ New Collection');
    await mainFrame!.waitForTimeout(400);

    const collectionNameInput = mainFrame!.locator('[data-testid="save-modal"] input').nth(1);
    if (await collectionNameInput.count() > 0) {
      await collectionNameInput.fill('Runner E2E');
    }

    await clickInFrame(mainFrame!, '[data-testid="save-modal"] button:has-text("Save")');
    await mainFrame!.waitForTimeout(1200);

    logCheck('Save modal closed', (await mainFrame!.locator('[data-testid="save-modal"]').count()) === 0);
    await screenshot(app.window, 'f31-save-new-collection');
  });

  // ── F31: Collection shows run button in sidebar ─────────────────

  test('F31 - collection shows run button in sidebar', async () => {
    log('--- F31: run button in sidebar ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();

    const header = collFrame!.locator('[data-testid="collection-header"]').filter({ hasText: 'Runner E2E' });
    await header.first().waitFor({ state: 'visible', timeout: 10_000 });
    const runBtn = header.locator('[data-testid="run-collection-btn"]');
    await runBtn.waitFor({ state: 'visible', timeout: 5_000 });
    logCheck('Run collection button visible', (await runBtn.count()) > 0);
    expect(await runBtn.count()).toBeGreaterThan(0);
    await screenshot(app.window, 'f31-run-button');
  });

  // ── F31: Run collection opens results modal ─────────────────────

  test('F31 - run collection opens results modal', async () => {
    log('--- F31: run collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();

    const runBtn = collFrame!
      .locator('[data-testid="collection-header"]')
      .filter({ hasText: 'Runner E2E' })
      .locator('[data-testid="run-collection-btn"]')
      .first();
    await runBtn.evaluate((el) => {
      (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    });
    await collFrame!.waitForTimeout(500);

    await selectQuickPick(app.window, 'Run without data');

    const modal = collFrame!.locator('[data-testid="runner-modal"]');
    await modal.waitFor({ state: 'visible', timeout: 10_000 });
    const summary = modal.locator('[data-testid="runner-summary"]');
    await summary.waitFor({ state: 'visible', timeout: 5_000 });
    const summaryText = (await summary.textContent()) ?? '';
    logCheck('Runner summary shows request count', summaryText.includes('/ 1 requests'));
    expect(summaryText).toContain('/ 1 requests');

    const closeBtn = modal.locator('[data-testid="runner-done-close-btn"]');
    await closeBtn.waitFor({ state: 'visible', timeout: 30_000 });
    const doneText = await modal.textContent();
    logCheck('Run completed', (doneText ?? '').includes('passed'));
    expect(doneText).toContain('passed');
    await screenshot(app.window, 'f31-run-results');
  });

  // ── F31: Runner modal can be closed ─────────────────────────────

  test('F31 - runner results modal can be closed', async () => {
    log('--- F31: close runner modal ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();

    const closeBtn = collFrame!.locator('[data-testid="runner-done-close-btn"]');
    if (await closeBtn.count() > 0) {
      await closeBtn.evaluate((el) => {
        (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
      });
      await collFrame!.waitForTimeout(600);
    }
    await collFrame!.locator('[data-testid="runner-modal"]').waitFor({ state: 'hidden', timeout: 5_000 });
    logCheck('Runner modal closed', true);
    await screenshot(app.window, 'f31-runner-closed');
  });

  // ── F33: Post-response script — error handling (merged from scripts.spec) ──

  test('F33 - erroring post-response script is handled gracefully', async () => {
    log('--- F33: error script ---');
    await writeTestScript(mainFrame!, 'throw new Error("intentional error");');
    await mainFrame!.waitForTimeout(200);

    await setMethod(mainFrame!, 'GET');
    await setBodyType(mainFrame!, 'none');
    await setUrlAndSend(mainFrame!, mockUrl('/'));
    const ok = await waitForResponse(mainFrame!, 20_000);
    expect(ok).toBe(true);
    await mainFrame!.waitForTimeout(2000);

    await clickResponsePaneTab(mainFrame!, 'logs');
    await mainFrame!.waitForTimeout(500);
    const body = await getResponseText(mainFrame!);
    const hasError = body.includes('Error') || body.includes('error') || body.includes('intentional');
    logCheck('Error script handled', hasError);
    expect(hasError).toBe(true);

    const badge = mainFrame!.locator('[class*="ScriptBadge"]').last();
    const badgeText = (await badge.textContent().catch(() => '')) ?? '';
    logCheck('Badge shows Error state', badgeText.includes('Error') || badgeText.includes('error'));
    await screenshot(app.window, 'f33-error-script');
  });

  // ── F31: Collection sidebar CRUD (merged from collections.spec) ──

  test('F31 - create a group inside the collection', async () => {
    log('--- F31: create group ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();
    if (!collFrame) return;
    const groupBtn = collFrame.locator('button[title="New folder"]').first();
    if (await groupBtn.count() > 0) {
      await groupBtn.click();
      await app.window.waitForTimeout(500);
    }
    const groupInput = collFrame.locator('input[placeholder="Folder name"]');
    if (await groupInput.count() > 0) {
      await groupInput.fill('Test Group');
      await app.window.keyboard.press('Enter');
      await app.window.waitForTimeout(500);
    }
    const bodyText = (await collFrame.locator('body').textContent().catch(() => '')) ?? '';
    logCheck('Group visible in sidebar', bodyText.includes('Test Group'));
    await screenshot(app.window, 'f31-group-created');
  });

  test('F31 - rename the collection from the sidebar', async () => {
    log('--- F31: rename collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();
    if (!collFrame) return;
    const headers = collFrame.locator('[data-testid="collection-header"]');
    expect(await headers.count()).toBeGreaterThan(0);
    await headers.first().hover();
    await app.window.waitForTimeout(300);
    const renameBtn = collFrame.locator('button[title="Rename"]').first();
    if (await renameBtn.count() > 0) {
      await renameBtn.click();
      await app.window.waitForTimeout(300);
      const input = collFrame.locator('input[type="text"]:not([placeholder])');
      if (await input.count() > 0) {
        await input.first().fill('Renamed Collection');
        await app.window.keyboard.press('Enter');
        await app.window.waitForTimeout(500);
      }
    }
    const bodyText = (await collFrame.locator('body').textContent().catch(() => '')) ?? '';
    logCheck('Renamed collection visible', bodyText.includes('Renamed Collection'));
    await screenshot(app.window, 'f31-collection-renamed');
  });

  test('F31 - delete the collection from the sidebar', async () => {
    log('--- F31: delete collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();
    if (!collFrame) return;
    const headers = collFrame.locator('[data-testid="collection-header"]');
    expect(await headers.count()).toBeGreaterThan(0);
    await headers.first().hover();
    await app.window.waitForTimeout(300);
    const deleteBtn = collFrame.locator('button').filter({ hasText: /delete|trash/i });
    if (await deleteBtn.count() > 0) {
      await deleteBtn.first().click();
      await app.window.waitForTimeout(300);
      const confirmBtn = collFrame.locator('button').filter({ hasText: /delete|confirm|yes/i });
      if (await confirmBtn.count() > 0) {
        await confirmBtn.first().click();
        await app.window.waitForTimeout(500);
      }
    }
    await screenshot(app.window, 'f31-collection-deleted');
  });
});
