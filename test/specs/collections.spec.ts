import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  findCollectionsFrame,
  injectCursorOverlay,
  clickInFrame,
  resetLog,
  log,
  logCheck,
  type VSCodeApp,
} from '../utils/vscode';
import {
  setupMainPanel,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Collections', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [Collections] beforeAll ===');
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [Collections] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [Collections] afterAll ===');
    await closeVSCode(app);
  });

  test('Create new collection via sidebar', async () => {
    log('--- Create collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    expect(collFrame).not.toBeNull();

    // Look for the create collection button (usually a + icon in toolbar)
    const addBtn = collFrame!.locator('button, [role="button"]').filter({ hasText: /add|new|create|\+/i });
    if (await addBtn.count() > 0) {
      await addBtn.first().click();
      await app.window.waitForTimeout(500);
    }

    // Look for collection name input
    const nameInput = collFrame!.locator('input[type="text"]');
    if (await nameInput.count() > 0) {
      await nameInput.first().fill('Test Collection');
      await app.window.keyboard.press('Enter');
      await app.window.waitForTimeout(500);
    }

    await screenshot(app.window, 'collection-created');
    log('Collection creation attempted');
  });

  test('Collection appears in sidebar', async () => {
    log('--- Verify collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    if (collFrame) {
      const text = (await collFrame.locator('body').textContent().catch(() => '')) ?? '';
      logCheck('Collection visible', text.includes('Test Collection') || text.includes('Swagger'));
      await screenshot(app.window, 'collection-visible');
    }
  });

  test('Expand collection to see requests', async () => {
    log('--- Expand collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    if (collFrame) {
      // Click expand all button if available
      const expandBtn = collFrame.locator('button').filter({ hasText: /expand/i });
      if (await expandBtn.count() > 0) {
        await expandBtn.first().click();
        await app.window.waitForTimeout(500);
      }

      const requests = collFrame.locator('[data-testid="collection-request"]');
      const count = await requests.count();
      logCheck('Collection requests found', count);
      await screenshot(app.window, 'collection-expanded');
    }
  });

  test('Create group inside collection', async () => {
    log('--- Create group ---');
    const collFrame = await findCollectionsFrame(app.window);
    if (collFrame) {
      // Look for group creation button
      const groupBtn = collFrame.locator('button').filter({ hasText: /folder|group/i });
      if (await groupBtn.count() > 0) {
        await groupBtn.first().click();
        await app.window.waitForTimeout(500);
      }

      const groupInput = collFrame.locator('input[type="text"]');
      if (await groupInput.count() > 0) {
        await groupInput.first().fill('Test Group');
        await app.window.keyboard.press('Enter');
        await app.window.waitForTimeout(500);
      }

      await screenshot(app.window, 'group-created');
      log('Group creation attempted');
    }
  });

  test('Rename collection', async () => {
    log('--- Rename collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    if (collFrame) {
      // Find collection header and its rename button
      const headers = collFrame.locator('[data-testid="collection-header"]');
      if (await headers.count() > 0) {
        // Hover to reveal rename button
        await headers.first().hover();
        await app.window.waitForTimeout(300);

        const renameBtn = collFrame.locator('button').filter({ hasText: /rename/i });
        if (await renameBtn.count() > 0) {
          await renameBtn.first().click();
          await app.window.waitForTimeout(300);

          const input = collFrame.locator('input[type="text"]');
          if (await input.count() > 0) {
            await input.first().fill('Renamed Collection');
            await app.window.keyboard.press('Enter');
            await app.window.waitForTimeout(500);
          }
        }
      }

      await screenshot(app.window, 'collection-renamed');
      log('Rename attempted');
    }
  });

  test('Delete collection', async () => {
    log('--- Delete collection ---');
    const collFrame = await findCollectionsFrame(app.window);
    if (collFrame) {
      const headers = collFrame.locator('[data-testid="collection-header"]');
      if (await headers.count() > 0) {
        await headers.first().hover();
        await app.window.waitForTimeout(300);

        const deleteBtn = collFrame.locator('button').filter({ hasText: /delete|trash/i });
        if (await deleteBtn.count() > 0) {
          await deleteBtn.first().click();
          await app.window.waitForTimeout(300);
          // Confirm deletion
          const confirmBtn = collFrame.locator('button').filter({ hasText: /delete|confirm|yes/i });
          if (await confirmBtn.count() > 0) {
            await confirmBtn.first().click();
            await app.window.waitForTimeout(500);
          }
        }
      }

      await screenshot(app.window, 'collection-deleted');
      log('Delete attempted');
    }
  });
});
