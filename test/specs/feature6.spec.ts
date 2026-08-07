import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  injectCursorOverlay,
  resetLog,
  log,
  logCheck,
  runCommand,
  findMainPanelFrame,
  findHistoryFrame,
  type VSCodeApp,
} from '../utils/vscode';
import {
  startMockServer,
  mockUrl,
  setupMainPanel,
  setUrl,
  getUrl,
  waitForResponse,
  setUrlAndSend,
  stubOpenDialog,
  stubSaveDialog,
  clearDialogStub,
} from '../utils/helpers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Feature 6 (F51-F60) — .http Files, Codegen, Palette, History Pins', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Feature6] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Feature6] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Feature6] afterAll ===');
    clearDialogStub();
    await closeVSCode(app);
  });

  test('F51 - export the active request to a .http file', async () => {
    log('--- F51: export to .http ---');
    const { window } = app;
    const outPath = path.join(os.tmpdir(), `restify-e2e-${Date.now()}.http`);
    try { fs.unlinkSync(outPath); } catch { /* not present */ }

    await setUrl(mainFrame!, mockUrl('/api/echo'));
    await window.waitForTimeout(300);
    stubSaveDialog(outPath);
    await runCommand(window, 'Restify: Export Request to .http');
    await window.waitForTimeout(1500);

    const exists = fs.existsSync(outPath);
    logCheck('.http file written', exists);
    expect(exists).toBe(true);
    if (exists) {
      const content = fs.readFileSync(outPath, 'utf8');
      logCheck('File contains request URL', content.includes('/api/echo'));
      expect(content).toContain('/api/echo');
    }
    try { fs.unlinkSync(outPath); } catch { /* ignore */ }
    await screenshot(window, 'feature6-f51-export');
  });

  test('F51 - import requests from a .http file', async () => {
    log('--- F51: import from .http ---');
    const { window } = app;
    const inPath = path.join(os.tmpdir(), `restify-e2e-in-${Date.now()}.http`);
    fs.writeFileSync(inPath, `### Ping\nGET ${mockUrl('/api/echo')} HTTP/1.1\nContent-Type: application/json\n\n`);

    stubOpenDialog(inPath);
    await runCommand(window, 'Restify: Open .http File');
    await window.waitForTimeout(2000);

    const frame = await findMainPanelFrame(window);
    logCheck('Main panel frame found after import', frame !== null);
    expect(frame).not.toBeNull();
    if (!frame) { try { fs.unlinkSync(inPath); } catch { /* ignore */ } return; }
    mainFrame = frame;

    const url = await getUrl(frame).catch(() => '');
    logCheck('Imported request URL loaded', url);
    expect(url).toContain('/api/echo');
    try { fs.unlinkSync(inPath); } catch { /* ignore */ }
    await screenshot(window, 'feature6-f51-import');
  });

  test('F57 - pin a history entry and verify it stays on top', async () => {
    log('--- F57: history pins ---');
    const { window } = app;
    await setUrlAndSend(mainFrame!, mockUrl('/api/text'));
    await waitForResponse(mainFrame!, 15_000);
    await window.waitForTimeout(1000);

    const histFrame = await findHistoryFrame(window);
    expect(histFrame).not.toBeNull();
    if (!histFrame) return;

    const items = histFrame.locator('[data-testid="history-item"]');
    const countBefore = await items.count();
    logCheck('History has at least one entry', countBefore);
    expect(countBefore).toBeGreaterThan(0);

    const pinBtn = items.first().locator('[data-testid="history-pin"]');
    await items.first().hover();
    await pinBtn.click();
    await window.waitForTimeout(800);
    const titleAfter = (await pinBtn.getAttribute('title').catch(() => '')) || '';
    logCheck('Pin toggled on', titleAfter.includes('Unpin'));
    expect(titleAfter).toContain('Unpin');

    // Newer request lands above, but the pinned entry must remain first
    await setUrlAndSend(mainFrame!, mockUrl('/api/csv'));
    await waitForResponse(mainFrame!, 15_000);
    await window.waitForTimeout(1000);

    const firstItem = histFrame.locator('[data-testid="history-item"]').first();
    const firstText = (await firstItem.textContent().catch(() => '')) || '';
    logCheck('Pinned entry stays on top', firstText.includes('/api/text'));
    expect(firstText).toContain('/api/text');

    // Unpin restores default ordering
    await firstItem.hover();
    await firstItem.locator('[data-testid="history-pin"]').click();
    await window.waitForTimeout(800);
    const firstTextAfterUnpin = (await histFrame.locator('[data-testid="history-item"]').first().textContent().catch(() => '')) || '';
    logCheck('Pinned entry no longer on top', !firstTextAfterUnpin.includes('/api/text'));
    await screenshot(window, 'feature6-f57-pin');
  });

  test('F57 - fuzzy search filters history entries', async () => {
    log('--- F57: fuzzy search ---');
    const { window } = app;
    const histFrame = await findHistoryFrame(window);
    expect(histFrame).not.toBeNull();
    if (!histFrame) return;

    const searchInput = histFrame.locator('input[placeholder="Filter history..."]');
    await searchInput.fill('/api/text');
    await window.waitForTimeout(800);

    const items = histFrame.locator('[data-testid="history-item"]');
    const count = await items.count();
    const allMatch = await items.evaluateAll((els) =>
      els.every((el) => (el.textContent || '').includes('/api/text')),
    );
    logCheck('Filtered entries all match', count > 0 && allMatch);
    expect(count).toBeGreaterThan(0);
    expect(allMatch).toBe(true);

    await searchInput.fill('');
    await window.waitForTimeout(500);
    await screenshot(window, 'feature6-f57-search');
  });
});
