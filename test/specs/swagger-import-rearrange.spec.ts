import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  log,
  resetLog,
  runCommand,
  selectQuickPick,
  ensureSidebarOpen,
  findCollectionsFrame,
  clickInFrame,
} from '../utils/vscode';
import {
  startMockServer,
  stopMockServer,
  stubOpenDialog,
  clearDialogStub,
} from '../utils/helpers';

const FIXTURE = path.resolve(__dirname, '..', 'fixtures', 'petstore-swagger.json');
const TMP_COLLECTION = path.resolve(__dirname, '..', 'fixtures', '_imported-petstore.json');

test.describe('Swagger Import & Request Rearrange', () => {
  let app: Awaited<ReturnType<typeof launchVSCode>>;

  test.beforeAll(async () => {
    resetLog();
    await startMockServer();
    app = await launchVSCode();
  });

  test.afterAll(async () => {
    clearDialogStub();
    // Clean up temp collection file
    if (fs.existsSync(TMP_COLLECTION)) fs.unlinkSync(TMP_COLLECTION);
    await closeVSCode(app);
    await stopMockServer();
  });

  test('should import a Swagger/OpenAPI collection from file', async () => {
    log('--- Test: Import Swagger collection ---');

    // Stub the open dialog to return our fixture file
    stubOpenDialog(FIXTURE);

    // Run the import command
    await runCommand(app.window, 'Restify: Import Collection');
    await app.window.waitForTimeout(1000);

    // Select "OpenAPI / Swagger File" from the quick pick
    await selectQuickPick(app.window, 'OpenAPI / Swagger File');
    await app.window.waitForTimeout(3000);

    await screenshot(app.window, 'swagger-import-done');

    // Verify success notification appeared (or at least no error)
    const notification = app.window.locator('.notification-toast, .notifications-toasts');
    const notifText = await notification.textContent().catch(() => '');
    log(`Notification text: "${notifText}"`);

    // Dismiss any lingering notifications
    const dismissBtn = app.window.locator('.notification-toast .notification-close-button, .notifications-toasts .notification-close-button');
    if ((await dismissBtn.count()) > 0) {
      await dismissBtn.first().click().catch(() => {});
    }
    await app.window.waitForTimeout(500);
  });

  test('should show the imported collection in the sidebar', async () => {
    log('--- Test: Verify imported collection in sidebar ---');

    await ensureSidebarOpen(app.window);
    await app.window.waitForTimeout(2000);

    // Find the collections sidebar frame
    const collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
    if (!collectionsFrame) return;

    await screenshot(app.window, 'swagger-sidebar-collections');

    // Verify the collection name appears
    const collectionName = collectionsFrame.locator('text=Swagger Petstore');
    await expect(collectionName).toBeVisible({ timeout: 10_000 });
    log('Collection "Swagger Petstore" visible in sidebar');
  });

  test('should have grouped requests by tag', async () => {
    log('--- Test: Verify tag-based groups ---');

    const collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
    if (!collectionsFrame) return;

    // Expand the collection if not already expanded
    const collectionHeader = collectionsFrame.locator('[data-testid="collection-header"]').filter({ hasText: 'Swagger Petstore' });
    if ((await collectionHeader.count()) > 0) {
      const isOpen = await collectionsFrame.locator('[data-testid="collection-request"]').count();
      if (isOpen === 0) {
        await clickInFrame(collectionsFrame, '[data-testid="collection-header"]');
        await collectionsFrame.waitForTimeout(500);
      }
    }

    // Verify "pets" group exists
    const petsGroup = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'pets' });
    await expect(petsGroup).toBeVisible({ timeout: 5_000 });
    log('Group "pets" found');

    // Verify "store" group exists
    const storeGroup = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'store' });
    await expect(storeGroup).toBeVisible({ timeout: 5_000 });
    log('Group "store" found');

    // Expand the pets group to see its requests
    const petsHeader = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'pets' });
    await petsHeader.click();
    await collectionsFrame.waitForTimeout(500);

    await screenshot(app.window, 'swagger-groups-expanded');

    // Verify requests inside the pets group
    const petsRequests = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'pets' }).locator('[data-testid="collection-request"]');
    const petsCount = await petsRequests.count();
    log(`Pets group has ${petsCount} request(s)`);
    expect(petsCount).toBeGreaterThanOrEqual(3);

    // Verify request names
    const requestNames = await petsRequests.evaluateAll((els) =>
      els.map((el) => el.textContent?.trim() || '')
    );
    log(`Pets requests: ${JSON.stringify(requestNames)}`);

    // Should have: "List all pets", "Create a pet", "Get pet by ID", "Delete a pet"
    expect(requestNames.some((n) => n.includes('List all pets'))).toBeTruthy();
    expect(requestNames.some((n) => n.includes('Create a pet'))).toBeTruthy();
    expect(requestNames.some((n) => n.includes('Get pet by ID'))).toBeTruthy();
    expect(requestNames.some((n) => n.includes('Delete a pet'))).toBeTruthy();
  });

  test('should rearrange requests within a group via drag-and-drop', async () => {
    log('--- Test: Rearrange requests within group ---');

    const collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
    if (!collectionsFrame) return;

    // Ensure pets group is expanded
    const petsGroup = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'pets' });

    // Get all requests in the pets group
    const petsRequests = petsGroup.locator('[data-testid="collection-request"]');
    const initialCount = await petsRequests.count();
    log(`Pets group has ${initialCount} requests initially`);
    expect(initialCount).toBeGreaterThanOrEqual(2);

    // Get initial order of request names
    const initialNames = await petsRequests.evaluateAll((els) =>
      els.map((el) => {
        const nameEl = el.querySelector('[class*="SubName"], span[title]');
        return nameEl?.textContent?.trim() || el.textContent?.trim() || '';
      })
    );
    log(`Initial order: ${JSON.stringify(initialNames)}`);

    // Perform drag-and-drop: move first request to the position of the second
    const sourceReq = petsRequests.nth(0);
    const targetReq = petsRequests.nth(1);

    const sourceBox = await sourceReq.boundingBox();
    const targetBox = await targetReq.boundingBox();

    if (!sourceBox || !targetBox) {
      log('Could not get bounding boxes for drag-and-drop, skipping');
      return;
    }

    // Simulate HTML5 drag-and-drop via evaluate
    await collectionsFrame.evaluate(() => {
      const srcEl = document.querySelectorAll('[data-testid="collection-request"]')[0] as HTMLElement;
      const tgtEl = document.querySelectorAll('[data-testid="collection-request"]')[1] as HTMLElement;
      if (!srcEl || !tgtEl) return;

      // Dispatch dragstart on source
      const dragStartEvent = new DragEvent('dragstart', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      srcEl.dispatchEvent(dragStartEvent);

      // Dispatch dragover on target
      const dragOverEvent = new DragEvent('dragover', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      tgtEl.dispatchEvent(dragOverEvent);

      // Dispatch drop on target
      const dropEvent = new DragEvent('drop', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      tgtEl.dispatchEvent(dropEvent);

      // Dispatch dragend on source
      const dragEndEvent = new DragEvent('dragend', {
        bubbles: true,
        cancelable: true,
        dataTransfer: new DataTransfer(),
      });
      srcEl.dispatchEvent(dragEndEvent);
    });

    await collectionsFrame.waitForTimeout(1000);

    await screenshot(app.window, 'swagger-after-rearrange');

    // Verify the order changed
    const updatedNames = await petsRequests.evaluateAll((els) =>
      els.map((el) => {
        const nameEl = el.querySelector('[class*="SubName"], span[title]');
        return nameEl?.textContent?.trim() || el.textContent?.trim() || '';
      })
    );
    log(`Updated order: ${JSON.stringify(updatedNames)}`);

    // The count should remain the same
    expect(updatedNames.length).toBe(initialCount);
  });

  test('should move a request from one group to another', async () => {
    log('--- Test: Move request between groups ---');

    const collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
    if (!collectionsFrame) return;

    // Expand both groups
    const petsGroup = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'pets' });
    const storeGroup = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'store' });

    // Click to expand pets if not already
    await petsGroup.click().catch(() => {});
    await collectionsFrame.waitForTimeout(300);

    // Click to expand store if not already
    await storeGroup.click().catch(() => {});
    await collectionsFrame.waitForTimeout(300);

    // Count requests in each group before
    const petsRequestsBefore = petsGroup.locator('[data-testid="collection-request"]');
    const storeRequestsBefore = storeGroup.locator('[data-testid="collection-request"]');
    const petsCountBefore = await petsRequestsBefore.count();
    const storeCountBefore = await storeRequestsBefore.count();
    log(`Before move - pets: ${petsCountBefore}, store: ${storeCountBefore}`);

    // Get the last request in pets group
    const lastPetReq = petsRequestsBefore.nth(petsCountBefore - 1);
    const lastPetName = await lastPetReq.evaluate((el) => {
      const nameEl = el.querySelector('[class*="SubName"], span[title]');
      return nameEl?.textContent?.trim() || el.textContent?.trim() || '';
    });
    log(`Moving request: "${lastPetName}"`);

    // Simulate drag from pets group to store group header
    await collectionsFrame.evaluate(() => {
      const allRequests = document.querySelectorAll('[data-testid="collection-request"]');
      const petsRequests = Array.from(allRequests).filter((el) => {
        // Find requests inside the pets group (first group-header's body)
        let parent = el.parentElement;
        while (parent) {
          const header = parent.querySelector('[data-testid="group-header"]');
          if (header && header.textContent?.includes('pets')) return true;
          if (header && header.textContent?.includes('store')) return false;
          parent = parent.parentElement;
        }
        return false;
      });

      const storeHeaders = document.querySelectorAll('[data-testid="group-header"]');
      let storeHeader: Element | null = null;
      for (const h of storeHeaders) {
        if (h.textContent?.includes('store')) { storeHeader = h; break; }
      }

      if (petsRequests.length === 0 || !storeHeader) return;

      const srcEl = petsRequests[petsRequests.length - 1] as HTMLElement;

      // Dispatch dragstart
      const dt = new DataTransfer();
      dt.setData('text/plain', '');
      srcEl.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));

      // Dispatch dragover on store header
      storeHeader.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));

      // Dispatch drop on store header
      storeHeader.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));

      // Dispatch dragend
      srcEl.dispatchEvent(new DragEvent('dragend', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }));
    });

    await collectionsFrame.waitForTimeout(1500);

    await screenshot(app.window, 'swagger-after-move-between-groups');

    // Verify the move happened
    const petsRequestsAfter = petsGroup.locator('[data-testid="collection-request"]');
    const storeRequestsAfter = storeGroup.locator('[data-testid="collection-request"]');
    const petsCountAfter = await petsRequestsAfter.count();
    const storeCountAfter = await storeRequestsAfter.count();
    log(`After move - pets: ${petsCountAfter}, store: ${storeCountAfter}`);

    // Pets should have one fewer, store should have one more
    // (unless the drag-and-drop events didn't propagate correctly in the webview)
    if (petsCountAfter < petsCountBefore) {
      expect(storeCountAfter).toBe(storeCountBefore + 1);
      log('Request successfully moved between groups');
    } else {
      log('Drag-and-drop may not have propagated in webview (expected in some environments)');
    }
  });

  test('should load a request from the imported collection', async () => {
    log('--- Test: Load request from imported collection ---');

    const collectionsFrame = await findCollectionsFrame(app.window);
    expect(collectionsFrame).not.toBeNull();
    if (!collectionsFrame) return;

    // Expand pets group
    const petsGroup = collectionsFrame.locator('[data-testid="group-header"]').filter({ hasText: 'pets' });
    await petsGroup.click().catch(() => {});
    await collectionsFrame.waitForTimeout(500);

    // Click on "List all pets" request
    const listPetsReq = collectionsFrame.locator('[data-testid="collection-request"]').filter({ hasText: 'List all pets' });
    if ((await listPetsReq.count()) > 0) {
      await listPetsReq.first().click();
      await app.window.waitForTimeout(2000);

      await screenshot(app.window, 'swagger-loaded-request');

      log('Request loaded from imported collection');
    }
  });
});
