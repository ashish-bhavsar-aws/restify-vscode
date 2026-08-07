import type { Frame, Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import {
  clickInFrame,
  waitForElement,
  fillVariableInput,
  getVariableInputValue,
  sendRequestViaEnter,
  findMainPanelFrame,
  clickRestifyIcon,
  dismissOnboarding,
  log,
  DIALOG_STUB_FILE,
  type VSCodeApp,
} from './vscode';

// ─── Native-dialog stubbing (e2e) ─────────────────────────────────

export function stubOpenDialog(absPath: string): void {
  fs.writeFileSync(DIALOG_STUB_FILE, JSON.stringify({ open: absPath }));
}

export function stubSaveDialog(absPath: string): void {
  fs.writeFileSync(DIALOG_STUB_FILE, JSON.stringify({ save: absPath }));
}

export function clearDialogStub(): void {
  if (fs.existsSync(DIALOG_STUB_FILE)) fs.unlinkSync(DIALOG_STUB_FILE);
}

const MOCK_SERVER = 'http://localhost:3000';

export function mockUrl(path: string): string {
  return `${MOCK_SERVER}${path}`;
}

// ─── Server Management ────────────────────────────────────────────

let _serverProcess: ReturnType<typeof import('child_process').exec> | null = null;

export async function startMockServer(): Promise<void> {
  try {
    const result = execSync('lsof -ti:3000', { encoding: 'utf-8' }).trim();
    if (result) {
      log('  Mock server already running on port 3000');
      return;
    }
  } catch {
    // Not running
  }

  log('  Starting mock server...');
  const { exec } = await import('child_process');
  _serverProcess = exec('node index.js', {
    cwd: path.resolve(__dirname, '..', '..', 'server'),
  });
  await new Promise((r) => setTimeout(r, 1500));
  log('  Mock server started');
}

export async function stopMockServer(): Promise<void> {
  if (_serverProcess) {
    _serverProcess.kill();
    _serverProcess = null;
    log('  Mock server stopped');
  }
}

// ─── Frame Helpers ────────────────────────────────────────────────

export async function setupMainPanel(
  app: VSCodeApp,
): Promise<Frame> {
  const { window } = app;
  await clickRestifyIcon(window);
  await window.waitForTimeout(2000);
  const frame = await findMainPanelFrame(window);
  if (!frame) throw new Error('Could not find main panel frame');
  // Dismiss any late-appearing onboarding dialogs that block clicks
  await dismissOnboarding(window);
  return frame;
}

// ─── HTTP Method ──────────────────────────────────────────────────

export async function setMethod(
  frame: Frame,
  method: string,
): Promise<void> {
  const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const LABEL_TO_METHOD: Record<string, string> = { 'DEL': 'DELETE', 'OPT': 'OPTIONS' };
  const targetIdx = METHODS.indexOf(method.toUpperCase());
  
  // Get current method from the trigger label
  const currentLabel = (await frame.locator('[data-testid="method-trigger-label"]').textContent() || 'GET').trim();
  const currentMethod = LABEL_TO_METHOD[currentLabel] || currentLabel;
  const currentIdx = METHODS.indexOf(currentMethod);
  
  if (currentIdx === targetIdx) return;
  
  // Focus the trigger and use keyboard to open dropdown
  const trigger = frame.locator('[data-testid="method-trigger"]');
  await trigger.focus();
  await frame.waitForTimeout(100);
  
  // Space opens the dropdown (keyboard handler)
  await trigger.press('Space');
  await frame.waitForTimeout(400);
  
  // Navigate with ArrowDown/ArrowUp
  const diff = targetIdx - currentIdx;
  const key = diff > 0 ? 'ArrowDown' : 'ArrowUp';
  for (let i = 0; i < Math.abs(diff); i++) {
    await trigger.press(key);
    await frame.waitForTimeout(150);
  }
  
  // Enter selects
  await trigger.press('Enter');
  await frame.waitForTimeout(300);
}

// ─── URL Bar ──────────────────────────────────────────────────────

export async function setUrl(
  frame: Frame,
  url: string,
): Promise<void> {
  await fillVariableInput(frame, '.url-input', url);
}

export async function getUrl(frame: Frame): Promise<string> {
  return getVariableInputValue(frame, '.url-input');
}

// ─── Send Request ─────────────────────────────────────────────────

export async function sendRequest(frame: Frame): Promise<void> {
  await sendRequestViaEnter(frame);
}

export async function setUrlAndSend(
  frame: Frame,
  url: string,
): Promise<void> {
  await fillVariableInput(frame, '.url-input', url);
  await frame.waitForTimeout(200);
  // The input should still be visible — just press Enter on it
  const input = frame.locator('.url-input [data-testid="variable-text-input"]');
  if (await input.first().isVisible().catch(() => false)) {
    await input.first().press('Enter');
    log('  Enter pressed on URL input');
  } else {
    // Fallback
    await sendRequestViaEnter(frame);
  }
}

// ─── Wait for Response ────────────────────────────────────────────

export async function waitForResponse(
  frame: Frame,
  timeout = 15_000,
): Promise<boolean> {
  try {
    const statusEl = frame.locator('[data-testid="status-code"]');
    const oldText = await statusEl.textContent().catch(() => '');
    
    // Poll for status change
    const start = Date.now();
    while (Date.now() - start < timeout) {
      await frame.waitForTimeout(300);
      // Check if status-code element disappeared (loading state)
      const count = await statusEl.count();
      if (count === 0) {
        // Wait for it to reappear
        try {
          await frame.waitForSelector('[data-testid="status-code"]', { timeout: timeout - (Date.now() - start) });
          return true;
        } catch { return false; }
      }
      // Check if status text changed
      const newText = await statusEl.textContent().catch(() => '');
      if (newText && newText !== oldText) return true;
    }
    return true; // timeout — assume response came back
  } catch {
    return false;
  }
}

export async function getStatusCode(frame: Frame): Promise<string> {
  const el = frame.locator('[data-testid="status-code"]');
  await el.waitFor({ state: 'visible', timeout: 10_000 });
  return (await el.textContent()) || '';
}

export async function getResponseText(frame: Frame): Promise<string> {
  const pane = frame.locator('#res-pane');
  return (await pane.textContent()) || '';
}

// ─── Request Pane Tabs ────────────────────────────────────────────

export async function clickRequestTab(
  frame: Frame,
  tab: 'params' | 'headers' | 'body' | 'script' | 'auth',
): Promise<void> {
  await clickInFrame(frame, `[data-testid="req-tab-${tab}"]`);
  await frame.waitForTimeout(200);
}

// ─── Response Pane Tabs ───────────────────────────────────────────

export async function clickResponseTab(
  frame: Frame,
  tab: 'body' | 'headers' | 'cookies' | 'tests' | 'logs' | 'raw',
): Promise<void> {
  await clickInFrame(frame, `[data-testid="res-tab-${tab}"]`);
  await frame.waitForTimeout(200);
}

// ─── Body Type Selection ──────────────────────────────────────────

export async function setBodyType(
  frame: Frame,
  bodyType: 'none' | 'json' | 'text' | 'xml' | 'form' | 'urlencoded' | 'graphql',
): Promise<void> {
  await clickRequestTab(frame, 'body');
  await clickInFrame(frame, `[data-testid="body-type-${bodyType}"]`);
  await frame.waitForTimeout(200);
}

// ─── Body Editor ──────────────────────────────────────────────────

export async function fillBody(
  frame: Frame,
  body: string,
): Promise<void> {
  // Ensure we're on the body tab
  await clickRequestTab(frame, 'body');
  await frame.waitForTimeout(300);
  
  // Try finding textarea via selector
  const count = await frame.locator('textarea').count();
  log(`  [fillBody] Found ${count} textarea(s) in frame`);
  
  let textarea = frame.locator('#req-pane textarea').first();
  let found = await textarea.count() > 0;
  if (!found) {
    // Fallback: find any visible textarea in the request pane area
    const allTa = frame.locator('textarea');
    const allCount = await allTa.count();
    log(`  [fillBody] #req-pane textarea not found, trying any textarea (${allCount} total)`);
    // Try the last textarea (body editor is typically the last one)
    if (allCount > 0) {
      textarea = allTa.last();
      found = true;
    }
  }
  
  if (found) {
    log(`  [fillBody] Filling textarea with body...`);
    await textarea.click();
    await frame.waitForTimeout(100);
    await textarea.press('Meta+A');
    await frame.waitForTimeout(50);
    await textarea.fill(body);
    await frame.waitForTimeout(200);
    log(`  [fillBody] Done`);
  } else {
    log(`  [fillBody] WARNING: No textarea found! Body not filled.`);
  }
}

// ─── Headers ──────────────────────────────────────────────────────

export async function addHeader(
  frame: Frame,
  key: string,
  value: string,
): Promise<void> {
  await clickRequestTab(frame, 'headers');
  await frame.waitForTimeout(200);

  await clickInFrame(frame, '[data-testid="kv-add-row"]');
  await frame.waitForTimeout(300);

  const keyInput = frame.locator('[data-testid="kv-key-input"]').first();
  await keyInput.fill(key);
  await frame.waitForTimeout(100);
  await fillVariableInput(frame, '[data-testid="kv-value-wrapper"]', value);
}

// ─── Auth ─────────────────────────────────────────────────────────

export async function setAuthType(
  frame: Frame,
  authType: 'none' | 'bearer' | 'basic' | 'apikey' | 'oauth2',
): Promise<void> {
  await clickRequestTab(frame, 'auth');
  await frame.waitForTimeout(500);

  const labelMap: Record<string, string> = {
    none: 'None',
    bearer: 'Bearer Token',
    basic: 'Basic Auth',
    apikey: 'API Key',
    oauth2: 'OAuth 2.0',
  };
  const searchLabel = labelMap[authType] || authType;

  const trigger = frame.locator('#req-pane [aria-haspopup="listbox"]').first();
  if (await trigger.count() > 0) {
    await trigger.scrollIntoViewIfNeeded();
    await frame.waitForTimeout(100);
    await trigger.click();
    await frame.waitForTimeout(500);

    // Use evaluate to dispatch mouseDown directly on the option element
    // to bypass any pointer interception issues
    const option = frame.locator('#req-pane [role="option"]').filter({ hasText: searchLabel });
    if (await option.count() > 0) {
      await option.first().evaluate((el) => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      });
      await frame.waitForTimeout(500);
    }
  }
}

async function clickDisplayAndFill(frame: Frame, displayIndex: number, value: string): Promise<void> {
  if (displayIndex === 0) {
    const input = frame.locator('#req-pane [data-testid="variable-text-input"]').first();
    if (await input.count() > 0) {
      await input.fill(value);
      await input.evaluate((el) => (el as HTMLElement).blur());
      await frame.waitForTimeout(300);
      return;
    }
  }

  const displays = frame.locator('#req-pane [data-testid="variable-text-display"]');
  const count = await displays.count();
  if (count <= displayIndex) return;

  await displays.nth(displayIndex).scrollIntoViewIfNeeded();
  await frame.waitForTimeout(100);
  // Use onMouseUp via evaluate to trigger the React handler
  await displays.nth(displayIndex).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const event = new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      button: 0,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    });
    el.dispatchEvent(event);
  });
  await frame.waitForTimeout(500);

  const inputs = frame.locator('#req-pane [data-testid="variable-text-input"]');
  const inputCount = await inputs.count();
  if (inputCount > 0) {
    const target = displayIndex === 0 ? inputs.first() : inputs.last();
    await target.click();
    await frame.waitForTimeout(100);
    await target.fill(value);
    await frame.waitForTimeout(100);
    await target.evaluate((el) => (el as HTMLElement).blur());
    await frame.waitForTimeout(300);
  }
}

export async function fillBearerToken(
  frame: Frame,
  token: string,
): Promise<void> {
  await setAuthType(frame, 'bearer');
  await frame.waitForTimeout(500);
  await clickDisplayAndFill(frame, 0, token);
}

export async function fillAuthField(
  frame: Frame,
  displayIndex: number,
  value: string,
): Promise<void> {
  await clickDisplayAndFill(frame, displayIndex, value);
}

export async function fillBasicAuth(
  frame: Frame,
  username: string,
  password: string,
): Promise<void> {
  await setAuthType(frame, 'basic');
  await frame.waitForTimeout(500);
  await clickDisplayAndFill(frame, 0, username);
  // Scroll second display into view before clicking
  const displays = frame.locator('#req-pane [data-testid="variable-text-display"]');
  if (await displays.count() >= 2) {
    await displays.nth(1).scrollIntoViewIfNeeded();
    await frame.waitForTimeout(200);
  }
  await clickDisplayAndFill(frame, 1, password);
}

export async function fillApiKeyAuth(
  frame: Frame,
  keyName: string,
  keyValue: string,
  addTo: 'header' | 'query' = 'header',
): Promise<void> {
  await setAuthType(frame, 'apikey');
  await frame.waitForTimeout(500);
  await clickDisplayAndFill(frame, 0, keyName);
  // Scroll second display into view before clicking
  const displays = frame.locator('#req-pane [data-testid="variable-text-display"]');
  if (await displays.count() >= 2) {
    await displays.nth(1).scrollIntoViewIfNeeded();
    await frame.waitForTimeout(200);
  }
  await clickDisplayAndFill(frame, 1, keyValue);
  if (addTo === 'query') {
    const addToTrigger = frame.locator('#req-pane [aria-haspopup="listbox"]').last();
    if (await addToTrigger.count() > 0) {
      await addToTrigger.click();
      await frame.waitForTimeout(300);
      const queryOption = frame.locator('[role="option"]').filter({ hasText: /query/i });
      if (await queryOption.count() > 0) {
        await queryOption.first().click();
      }
    }
  }
}

// ─── Environment Manager ──────────────────────────────────────────

export async function openEnvManager(frame: Frame): Promise<void> {
  await clickInFrame(frame, '[data-testid="manage-env-btn"]');
  await waitForElement(frame, '[data-testid="env-manager-modal"]', 5_000);
}

export async function closeEnvManager(frame: Frame): Promise<void> {
  const closeBtn = frame.locator('[data-testid="env-modal-close"]');
  if (await closeBtn.count() > 0) {
    await clickInFrame(frame, '[data-testid="env-modal-close"]');
    await frame.waitForTimeout(200);
  }
  const overlay = frame.locator('[data-testid="env-manager-overlay"]');
  if (await overlay.count() > 0) {
    await clickInFrame(frame, '[data-testid="env-manager-overlay"]');
    await frame.waitForTimeout(200);
  }
}

export async function createEnvironment(
  frame: Frame,
  name: string,
  variables: Record<string, string>,
): Promise<void> {
  await openEnvManager(frame);
  await clickInFrame(frame, '[data-testid="env-new-btn"]');
  await frame.waitForTimeout(300);

  const nameInput = frame.locator('[data-testid="env-name-input"]').first();
  await nameInput.waitFor({ state: 'visible', timeout: 3_000 });
  await nameInput.fill(name);

  let idx = 0;
  for (const [key, value] of Object.entries(variables)) {
    if (idx > 0) {
      const addVarBtn = frame.locator('button').filter({ hasText: /Add Variable/i });
      if (await addVarBtn.count() > 0) {
        await clickInFrame(frame, 'button:has-text("Add Variable")');
        await frame.waitForTimeout(200);
      }
    }
    const keys = frame.locator('[data-testid="env-var-key"]');
    const values = frame.locator('[data-testid="env-var-value"]');
    await keys.nth(idx).fill(key);
    await values.nth(idx).fill(value);
    idx++;
  }

  await clickInFrame(frame, '[data-testid="env-save-btn"]');
  await frame.waitForTimeout(500);
  await closeEnvManager(frame);
}

export async function deleteEnvironment(
  frame: Frame,
  name: string,
): Promise<void> {
  await openEnvManager(frame);
  await frame.waitForTimeout(300);

  const envItem = frame.locator('div').filter({ hasText: new RegExp(`^${name}`) }).first();
  const deleteBtn = envItem.locator('button').last();
  if (await deleteBtn.count() > 0) {
    await deleteBtn.click();
    await frame.waitForTimeout(300);
    // Confirm deletion if dialog appears
    const confirmBtn = frame.locator('button').filter({ hasText: /delete|confirm|ok/i });
    if (await confirmBtn.count() > 0) {
      await confirmBtn.first().click();
      await frame.waitForTimeout(300);
    }
  }
  await closeEnvManager(frame);
}

export async function openEnvDropdown(frame: Frame, timeoutMs = 5_000): Promise<void> {
  const triggerBtn = frame.locator('button:has([data-testid="env-trigger-label"])');
  if ((await triggerBtn.count().catch(() => 0)) === 0) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const expanded = await triggerBtn.getAttribute('aria-expanded').catch(() => null);
    if (expanded === 'true') return;
    await clickInFrame(frame, '[data-testid="env-trigger-label"]');
    await frame.waitForTimeout(300);
    const nowExpanded = await triggerBtn.getAttribute('aria-expanded').catch(() => null);
    if (nowExpanded === 'true') return;
    await frame.waitForTimeout(300);
  }
}

export async function closeEnvDropdown(frame: Frame): Promise<void> {
  const triggerBtn = frame.locator('button:has([data-testid="env-trigger-label"])');
  if ((await triggerBtn.count().catch(() => 0)) === 0) return;
  const expanded = await triggerBtn.getAttribute('aria-expanded').catch(() => null);
  if (expanded === 'true') {
    await clickInFrame(frame, '[data-testid="env-trigger-label"]');
    await frame.waitForTimeout(300);
  }
}

export async function selectEnvironment(
  frame: Frame,
  name: string,
): Promise<void> {
  await openEnvDropdown(frame);
  const option = frame.locator('li').filter({ hasText: name });
  if (await option.count() > 0) {
    await option.first().click();
    await frame.waitForTimeout(300);
  }
}

// ─── Codegen Modal ────────────────────────────────────────────────

export async function openCodegen(frame: Frame): Promise<void> {
  await clickInFrame(frame, '[data-testid="codegen-btn"]');
  await waitForElement(frame, '[data-testid="codegen-modal"]', 5_000);
}

export async function closeCodegen(frame: Frame): Promise<void> {
  const overlay = frame.locator('[data-testid="codegen-overlay"]');
  if (await overlay.count() > 0) {
    await clickInFrame(frame, '[data-testid="codegen-overlay"]');
    await frame.waitForTimeout(200);
  }
}

// ─── Settings Modal ───────────────────────────────────────────────

export async function openSettings(frame: Frame): Promise<void> {
  await clickInFrame(frame, '[data-testid="gear-btn"]');
  await waitForElement(frame, '[data-testid="settings-modal"]', 5_000);
}

export async function closeSettings(frame: Frame): Promise<void> {
  const overlay = frame.locator('[data-testid="settings-overlay"]');
  if (await overlay.count() > 0) {
    await clickInFrame(frame, '[data-testid="settings-overlay"]');
    await frame.waitForTimeout(200);
  }
}

// ─── Quick Request Helper ─────────────────────────────────────────

export async function quickRequest(
  frame: Frame,
  url: string,
  method = 'GET',
): Promise<string> {
  if (method !== 'GET') {
    await setMethod(frame, method);
  }
  await setUrlAndSend(frame, url);
  const gotResponse = await waitForResponse(frame, 20_000);
  if (!gotResponse) return '';
  return getResponseText(frame);
}

// ─── Sidebar Helpers ──────────────────────────────────────────────

export async function getSidebarText(page: Page): Promise<string> {
  const frames = await page.frames();
  for (const f of frames) {
    if (!f.url().includes('vscode-webview://')) continue;
    const text = await f.locator('body').textContent().catch(() => '');
    if (text && (text.includes('History') || text.includes('Collections'))) {
      return text;
    }
  }
  return '';
}

// ─── Save Modal Helpers ──────────────────────────────────────────

export async function openSaveModal(frame: Frame): Promise<void> {
  const saveBtn = frame.locator('button').filter({ hasText: 'Save' });
  if (await saveBtn.count() > 0) {
    await saveBtn.first().click();
    await waitForElement(frame, 'h3:has-text("Save to Collection")', 5_000);
  }
}

export async function closeSaveModal(frame: Frame): Promise<void> {
  const cancelBtn = frame.locator('button').filter({ hasText: 'Cancel' });
  if (await cancelBtn.count() > 0) {
    await cancelBtn.first().click();
    await frame.waitForTimeout(300);
  }
}

export async function selectCollectionDropdown(
  frame: Frame,
  label: string,
): Promise<void> {
  // Click the first custom dropdown trigger (collection)
  const trigger = frame.locator('button[aria-haspopup="listbox"]').first();
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate((el) => {
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: 5, clientY: 5 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });
  await frame.waitForTimeout(300);

  const option = frame.locator('li[role="option"]').filter({ hasText: label });
  if (await option.count() > 0) {
    await option.first().evaluate((el) => {
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    });
    await frame.waitForTimeout(300);
  }
}

export async function selectFolderDropdown(
  frame: Frame,
  label: string,
): Promise<void> {
  // Click the second custom dropdown trigger (folder)
  const trigger = frame.locator('button[aria-haspopup="listbox"]').nth(1);
  if (await trigger.count() > 0) {
    await trigger.click();
    await frame.waitForTimeout(300);

    const option = frame.locator('li[role="option"]').filter({ hasText: label });
    if (await option.count() > 0) {
      await option.first().click();
      await frame.waitForTimeout(300);
    }
  }
}
