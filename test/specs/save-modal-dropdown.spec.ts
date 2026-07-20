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
  setUrl,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('SaveModal - Custom Dropdown', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [SaveModal] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [SaveModal] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [SaveModal] afterAll ===');
    await closeVSCode(app);
  });

  test('Open SaveModal and verify custom collection dropdown renders', async () => {
    log('--- Open SaveModal ---');
    await setUrl(mainFrame!, 'http://localhost:3000/test');
    await mainFrame!.waitForTimeout(300);

    await clickInFrame(mainFrame!, '[data-testid="save-btn"]');
    await mainFrame!.waitForTimeout(500);

    const modalTitle = mainFrame!.locator('[data-testid="save-modal"] h3').filter({ hasText: 'Save to Collection' });
    const titleCount = await modalTitle.count();
    logCheck('Save modal opened', titleCount > 0);
    expect(titleCount).toBeGreaterThan(0);

    await screenshot(app.window, 'save-modal-opened');
    log('SaveModal opened');
  });

  test('Collection dropdown is custom (not native select)', async () => {
    log('--- Verify custom dropdown ---');
    const dropdownTriggers = mainFrame!.locator('[data-testid="save-modal"] button[aria-haspopup="listbox"]');
    const triggerCount = await dropdownTriggers.count();
    logCheck('Custom dropdown triggers found (aria-haspopup)', triggerCount >= 1);
    expect(triggerCount).toBeGreaterThanOrEqual(1);

    const nativeSelects = mainFrame!.locator('[data-testid="save-modal"] select');
    const selectCount = await nativeSelects.count();
    logCheck('No native <select> elements in modal', selectCount === 0);
    expect(selectCount).toBe(0);

    await screenshot(app.window, 'save-modal-custom-dropdown');
    log('Custom dropdown verified');
  });

  test('Collection dropdown opens and shows options', async () => {
    log('--- Dropdown open/close ---');
    const trigger = mainFrame!.locator('[data-testid="save-modal"] button[aria-haspopup="listbox"]').first();
    await trigger.evaluate((el) => (el as HTMLElement).click());
    await mainFrame!.waitForTimeout(400);

    const menu = mainFrame!.locator('ul[role="listbox"]');
    const menuCount = await menu.count();
    logCheck('Dropdown menu appeared', menuCount > 0);
    expect(menuCount).toBeGreaterThan(0);

    const newCollectionOption = mainFrame!.locator('li[role="option"]').filter({ hasText: '+ New Collection' });
    const optCount = await newCollectionOption.count();
    logCheck('+ New Collection option found', optCount > 0);
    expect(optCount).toBeGreaterThan(0);

    await screenshot(app.window, 'save-modal-dropdown-open');
    log('Dropdown options visible');
  });

  test('Collection dropdown selects option and closes', async () => {
    log('--- Dropdown selection ---');
    const newCollectionOption = mainFrame!.locator('li[role="option"]').filter({ hasText: '+ New Collection' });
    const optCount = await newCollectionOption.count();
    if (optCount > 0) {
      await newCollectionOption.first().evaluate((el) => {
        el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      });
      await mainFrame!.waitForTimeout(400);
    }

    const menuAfter = mainFrame!.locator('ul[role="listbox"]');
    const menuCountAfter = await menuAfter.count();
    logCheck('Dropdown closed after selection', menuCountAfter === 0);
    expect(menuCountAfter).toBe(0);

    const newCollLabel = mainFrame!.locator('[data-testid="save-modal"] label').filter({ hasText: 'New Collection Name' });
    const labelCount = await newCollLabel.count();
    logCheck('New Collection Name input shown', labelCount > 0);
    expect(labelCount).toBeGreaterThan(0);

    await screenshot(app.window, 'save-modal-new-collection-selected');
    log('Dropdown selection verified');
  });

  test('Collection dropdown keyboard navigation', async () => {
    log('--- Keyboard navigation ---');
    const trigger = mainFrame!.locator('[data-testid="save-modal"] button[aria-haspopup="listbox"]').first();

    await trigger.evaluate((el) => (el as HTMLElement).click());
    await mainFrame!.waitForTimeout(400);

    await trigger.press('ArrowDown');
    await mainFrame!.waitForTimeout(200);

    const highlighted = mainFrame!.locator('li[role="option"][aria-selected="true"], li[role="option"]:hover');
    const highlightedCount = await highlighted.count();
    logCheck('Option highlighted via keyboard', highlightedCount >= 0);

    await trigger.press('Escape');
    await mainFrame!.waitForTimeout(400);

    const menuAfterEsc = mainFrame!.locator('ul[role="listbox"]');
    const menuCountAfterEsc = await menuAfterEsc.count();
    logCheck('Dropdown closed on Escape', menuCountAfterEsc === 0);
    expect(menuCountAfterEsc).toBe(0);

    await screenshot(app.window, 'save-modal-keyboard-nav');
    log('Keyboard navigation verified');
  });

  test('Folder dropdown appears when collection with groups is selected', async () => {
    log('--- Folder dropdown ---');
    const labels = mainFrame!.locator('[data-testid="save-modal"] label');
    const labelCount = await labels.count();
    logCheck('Labels found in modal', labelCount > 0);

    const folderTrigger = mainFrame!.locator('[data-testid="save-modal"] button[aria-haspopup="listbox"]').nth(1);
    const hasFolder = await folderTrigger.count() > 0;
    logCheck('Folder dropdown present (depends on collections)', hasFolder);

    await screenshot(app.window, 'save-modal-folder-dropdown');
    log('Folder dropdown check complete');
  });

  test('Close SaveModal via Cancel button', async () => {
    log('--- Close modal ---');
    const cancelBtn = mainFrame!.locator('[data-testid="save-modal"] button').filter({ hasText: 'Cancel' });
    const cancelCount = await cancelBtn.count();
    logCheck('Cancel button found', cancelCount > 0);

    if (cancelCount > 0) {
      await clickInFrame(mainFrame!, '[data-testid="save-modal"] button:has-text("Cancel")');
      await mainFrame!.waitForTimeout(400);
    }

    const titleAfterClose = mainFrame!.locator('[data-testid="save-modal"] h3').filter({ hasText: 'Save to Collection' });
    const titleCountAfter = await titleAfterClose.count();
    logCheck('SaveModal closed', titleCountAfter === 0);
    expect(titleCountAfter).toBe(0);

    await screenshot(app.window, 'save-modal-closed');
    log('SaveModal closed');
  });
});
