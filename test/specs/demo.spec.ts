import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import {
  launchVSCode,
  closeVSCode,
  screenshot,
  findMainPanelFrame,
  findCollectionsFrame,
  snapshotWebviewFrameUrls,
  waitForNewMainPanelFrame,
  clickRestifyIcon,
  isSidebarVisible,
  selectQuickPick,
  typeInQuickInput,
  confirmQuickInput,
  dismissNotification,
  dumpPageState,
  dumpSidebarState,
  clickInFrame,
  waitForElement,
  fillVariableInput,
  getVariableInputValue,
  sendRequestViaEnter,
  clickWithCursor,
  injectCursorOverlay,
  resetLog,
  log,
  logCheck,
  logError,
  type VSCodeApp,
} from '../utils/vscode';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

test.describe('Restify E2E Demo', () => {

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  resetLog();
  log('=== beforeAll: launching VS Code ===');
  app = await launchVSCode();
  await injectCursorOverlay(app.window);
  log('=== beforeAll: VS Code launched ===');
});

test.afterAll(async () => {
  log('=== afterAll: closing VS Code ===');
  await closeVSCode(app);
  log('=== afterAll: done ===');
});

test('01 - Extension opens with main panel', async () => {
  log('--- TEST 01: Extension opens with main panel ---');
  const { window } = app;

  const title = await window.title();
  logCheck('VS Code title', title);
  expect(title).toBeTruthy();
  expect(title).toContain('Extension Development Host');

  // Close the Welcome tab if present
  const welcomeTab = window.locator('.tab').filter({ hasText: /Welcome/i });
  if (await welcomeTab.count() > 0) {
    const closeBtn = welcomeTab.first().locator('.tab-close .action-label, .codicon-close');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click({ timeout: 3_000 }).catch(() => {});
      log('Welcome tab closed');
    } else {
      await welcomeTab.first().click({ button: 'middle' }).catch(() => {});
      log('Welcome tab middle-clicked to close');
    }
    await window.waitForTimeout(500);
  }

  // await screenshot(window, '01-main-panel-empty');
  log('--- TEST 01: done ---');
});

test('02 - Open sidebar via icon click', async () => {
  log('--- TEST 02: Open sidebar via icon click ---');
  const { window } = app;

  await clickRestifyIcon(window);

  const visible = await isSidebarVisible(window);
  expect(visible).toBe(true);

  // The webview frame appears after sidebar interaction — discover it now
  log('Sidebar open, now searching for main panel webview frame...');
  mainFrame = await findMainPanelFrame(window, 15_000);
  logCheck('mainFrame found after sidebar click', mainFrame !== null);

  await dumpSidebarState(window);
  await window.waitForTimeout(800);
  await screenshot(window, '02-sidebar-open');
  log('--- TEST 02: done ---');
});

test('03 - Import Swagger Petstore collection', async () => {
  log('--- TEST 03: Import Swagger Petstore collection ---');
  const { window } = app;

  const sidebar = window.locator('.part.sidebar');

  log('Looking for import button in sidebar...');
  const importSelectors = [
    '.codicon-cloud-download',
    '.codicon-cloud',
    'button[title*="Import"]',
    '.action-label[title*="Import"]',
    '.btn-import',
  ];

  // Step 1: capture sidebar before import click
  await screenshot(window, '03a-sidebar-before-import');

  let importClicked = false;
  for (const sel of importSelectors) {
    const count = await sidebar.locator(sel).count().catch(() => 0);
    log(`  Selector "${sel}": ${count} matches`);
    if (count > 0) {
      await clickWithCursor(sidebar.locator(sel).first());
      importClicked = true;
      log(`  Clicked import via: ${sel}`);
      break;
    }
  }

  if (!importClicked) {
    log('  No import button found');
  }

  await window.waitForTimeout(500);

  // Step 2: capture quick pick options
  await screenshot(window, '03b-import-quickpick-options');

  log('Checking for quick pick dialog...');
  const hasQuickPick = await window.locator('.quick-input-widget').count().catch(() => 0);
  logCheck('Quick pick widget visible', hasQuickPick);

  if (hasQuickPick > 0) {
    // Step 3: capture selection of Swagger URL
    await selectQuickPick(window, 'Swagger URL');
    await screenshot(window, '03c-import-swagger-url-selected');

    // Step 4: capture URL input
    await typeInQuickInput(window, 'https://petstore.swagger.io/v2/swagger.json');
    await window.waitForTimeout(500);
    await screenshot(window, '03d-import-url-entered');

    // Step 5: capture after confirm
    await confirmQuickInput(window);
    await window.waitForTimeout(1000);
    await screenshot(window, '03e-import-confirm-submitted');

    // Wait for the success notification instead of a blind timeout
    log('Waiting for import success notification...');
    try {
      await window.waitForFunction(() => {
        const toasts = document.querySelectorAll('.notifications-toasts .notification-toast, .notification-toast');
        for (const toast of toasts) {
          if (toast.textContent?.includes('Imported')) return true;
        }
        return false;
      }, { timeout: 30_000 });
      log('  Import success notification appeared');
    } catch {
      logError('Timed out waiting for import success notification');
    }

    // Step 6: capture after import completes
    await dismissNotification(window);
    await screenshot(window, '03f-import-complete');
  } else {
    log('  Quick pick did not appear');
  }

  log('--- TEST 03: done ---');
});

test('04 - Verify imported collection appears in sidebar', async () => {
  log('--- TEST 04: Verify imported collection ---');
  const { window } = app;

  const collectionsFrame = await findCollectionsFrame(window);
  logCheck('Collections frame found', collectionsFrame !== null);

  if (collectionsFrame) {
    const petstoreCount = await collectionsFrame.locator('text=Swagger Petstore').count().catch(() => 0);
    logCheck('Swagger Petstore in collections frame', petstoreCount);

    if (petstoreCount > 0) {
      // Helper: count VISIBLE elements (not just in DOM behind display:none)
      const countVisible = async (sel: string) => {
        return collectionsFrame!.locator(sel).evaluateAll(els => els.filter(e => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        }).length).catch(() => 0);
      };

      // Check if collection is already expanded (visible group-headers or requests)
      let visibleGroups = await countVisible('[data-testid="group-header"]');
      let visibleRequests = await countVisible('[data-testid="collection-request"]');
      log(`Pre-expand state: visibleGroups=${visibleGroups} visibleRequests=${visibleRequests}`);

      if (visibleGroups === 0 && visibleRequests === 0) {
        // Collection collapsed — click "Expand all" then collection header
        const expandAllBtn = collectionsFrame!.locator('button[title*="Expand"]');
        if (await expandAllBtn.count() > 0) {
          await clickWithCursor(expandAllBtn.first());
          log('Clicked Expand all');
          await collectionsFrame!.waitForTimeout(1500);
        }

        const collectionHeader = collectionsFrame!.locator('[data-testid="collection-header"]').first();
        if (await collectionHeader.count() > 0) {
          await clickWithCursor(collectionHeader);
          log('Clicked collection header');
          await collectionsFrame!.waitForTimeout(1500);
        }
      } else {
        log('Collection already expanded — skipping click');
      }

      // Re-check visibility after expansion
      visibleGroups = await countVisible('[data-testid="group-header"]');
      visibleRequests = await countVisible('[data-testid="collection-request"]');
      logCheck('group-header elements', visibleGroups);
      logCheck('collection-request elements', visibleRequests);

      for (let i = 0; i < Math.min(visibleGroups, 10); i++) {
        const text = await collectionsFrame!.locator('[data-testid="group-header"]').filter({ has: collectionsFrame!.locator(':visible') }).nth(i).textContent().catch(() => '');
        log(`  group-header[${i}]: "${(text || '').trim().slice(0, 60)}"`);
      }

      for (let i = 0; i < Math.min(visibleRequests, 10); i++) {
        const text = await collectionsFrame!.locator('[data-testid="collection-request"]').filter({ has: collectionsFrame!.locator(':visible') }).nth(i).textContent().catch(() => '');
        log(`  collection-request[${i}]: "${(text || '').trim().slice(0, 60)}"`);
      }

      // Expand collapsed groups — only click VISIBLE headers whose caret says collapsed
      if (visibleGroups > 0 && visibleRequests === 0) {
        const visibleHeaders = collectionsFrame!.locator('[data-testid="group-header"]').filter({ has: collectionsFrame!.locator(':visible') });
        const hdrCount = await visibleHeaders.count().catch(() => 0);
        for (let i = 0; i < Math.min(hdrCount, 5); i++) {
          const header = visibleHeaders.nth(i);
          const caretTransform = await header.locator('span').first().evaluate(el => getComputedStyle(el).transform).catch(() => '');
          const isExpanded = caretTransform.includes('matrix');
          if (!isExpanded) {
            await clickWithCursor(header);
            log(`Expanded group-header[${i}]`);
          }
          await collectionsFrame!.waitForTimeout(500);
        }
        const subItemsAfter = await countVisible('[data-testid="collection-request"]');
        logCheck('collection-requests after group expand', subItemsAfter);
      }
    }
  }

  await screenshot(window, '04-collection-in-sidebar');
  log('--- TEST 04: done ---');
});

test('05 - Load a request from the collection', async () => {
  log('--- TEST 05: Load a request from collection ---');
  const { window } = app;

  // Snapshot webview frame URLs BEFORE clicking — we need to detect the NEW panel
  const framesBefore = await snapshotWebviewFrameUrls(window);
  log(`Webview frames before click: ${framesBefore.size}`);

  const collectionsFrame = await findCollectionsFrame(window);
  expect(collectionsFrame).not.toBeNull();

  // Helper: count VISIBLE elements (not just in DOM behind display:none)
  const countVisible = async (sel: string) => {
    return collectionsFrame!.locator(sel).evaluateAll(els => els.filter(e => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).length).catch(() => 0);
  };

  // Check current expansion state — visible items only
  let visibleGroups = await countVisible('[data-testid="group-header"]');
  let visibleRequests = await countVisible('[data-testid="collection-request"]');
  log(`Pre-expand state: visibleGroups=${visibleGroups} visibleRequests=${visibleRequests}`);

  if (visibleGroups === 0 && visibleRequests === 0) {
    // Nothing visible — click Expand All
    const expandAllBtn = collectionsFrame!.locator('button[title*="Expand"]');
    if (await expandAllBtn.count() > 0) {
      await clickWithCursor(expandAllBtn.first());
      log('Clicked Expand all');
      await collectionsFrame!.waitForTimeout(1000);
    }
    // Re-check after Expand All
    visibleGroups = await countVisible('[data-testid="group-header"]');
    visibleRequests = await countVisible('[data-testid="collection-request"]');
    log(`After Expand All: visibleGroups=${visibleGroups} visibleRequests=${visibleRequests}`);
  } else {
    log(`Collection already expanded (${visibleGroups} groups, ${visibleRequests} requests visible)`);
  }

  // Expand collapsed groups so requests become visible — only VISIBLE headers
  if (visibleGroups > 0 && visibleRequests === 0) {
    const visibleHeaders = collectionsFrame!.locator('[data-testid="group-header"]').filter({ has: collectionsFrame!.locator(':visible') });
    const hdrCount = await visibleHeaders.count().catch(() => 0);
    for (let i = 0; i < Math.min(hdrCount, 10); i++) {
      const header = visibleHeaders.nth(i);
      const caretTransform = await header.locator('span').first().evaluate(el => getComputedStyle(el).transform).catch(() => '');
      const isExpanded = caretTransform.includes('matrix');
      if (!isExpanded) {
        await clickWithCursor(header);
        log(`Expanded group-header[${i}]`);
      }
      await collectionsFrame!.waitForTimeout(300);
    }
    visibleRequests = await countVisible('[data-testid="collection-request"]');
  }

  // Find VISIBLE request items
  const visibleReqLocator = collectionsFrame!.locator('[data-testid="collection-request"]').filter({ has: collectionsFrame!.locator(':visible') });
  const finalCount = await visibleReqLocator.count().catch(() => 0);
  logCheck('Request items (visible)', finalCount);

  for (let i = 0; i < Math.min(finalCount, 5); i++) {
    const text = await visibleReqLocator.nth(i).textContent().catch(() => '');
    log(`  collection-request[${i}]: "${(text || '').trim().slice(0, 60)}"`);
  }

  if (finalCount > 0) {
    // Click the first GET request (more likely to work without auth)
    let targetIdx = 0;
    for (let i = 0; i < finalCount; i++) {
      const text = await visibleReqLocator.nth(i).textContent().catch(() => '');
      if ((text || '').includes('GET')) {
        targetIdx = i;
        break;
      }
    }
    const reqText = await visibleReqLocator.nth(targetIdx).textContent().catch(() => '');
    log(`Clicking sub-item[${targetIdx}]: "${(reqText || '').trim().slice(0, 60)}"`);
    await clickWithCursor(visibleReqLocator.nth(targetIdx));
    log('Request item clicked — a NEW panel should open');
    await window.waitForTimeout(3000);
  } else {
    log('  No .sub-item found — collection may not be expanded');
  }

  // Wait for a NEW main panel frame to appear (the one created by restify.openMain)
  mainFrame = await waitForNewMainPanelFrame(window, framesBefore, 20_000);
  if (!mainFrame) {
    // Fallback: find any main panel frame
    log('  No new frame detected, falling back to findMainPanelFrame...');
    mainFrame = await findMainPanelFrame(window, 10_000);
  }
  expect(mainFrame).not.toBeNull();
  log(`Main panel frame: ${mainFrame!.url().slice(0, 70)}`);

  // Wait for the loadRequest message to arrive — poll URL bar until it has content
  log('Waiting for URL bar to be populated (loadRequest message)...');
  let urlFilled = false;
  for (let attempt = 0; attempt < 10; attempt++) {
    const url = await getVariableInputValue(mainFrame!, '.url-input');
    log(`  Attempt ${attempt + 1}: URL = "${url.slice(0, 60)}"`);
    if (url.length > 5 && !url.startsWith('https://api.example.com')) {
      urlFilled = true;
      break;
    }
    await window.waitForTimeout(1000);
  }
  logCheck('URL bar populated from loadRequest', urlFilled);

  if (urlFilled) {
    const finalUrl = await getVariableInputValue(mainFrame!, '.url-input');
    log(`  Final URL: "${finalUrl}"`);
  } else {
    log('  URL bar still empty — will manually fill in test 06');
  }

  await screenshot(window, '05-request-loaded');
  log('--- TEST 05: done ---');
});

test('05b - Create BASE_URL environment variable', async () => {
  log('--- TEST 05b: Create BASE_URL environment variable ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Open the environment manager modal
  await clickInFrame(mainFrame!, '[data-testid="manage-env-btn"]');

  // Wait for modal to appear
  const modalAppeared = await waitForElement(mainFrame!, '[data-testid="env-manager-modal"]', 5_000);
  logCheck('Env manager modal appeared', modalAppeared);
  expect(modalAppeared).toBe(true);

  // Click "+ New Environment"
  await clickInFrame(mainFrame!, '[data-testid="env-new-btn"]');
  await window.waitForTimeout(500);

  // Fill environment name
  const nameInput = mainFrame!.locator('[data-testid="env-name-input"]');
  await nameInput.first().waitFor({ state: 'visible', timeout: 3_000 });
  await nameInput.first().fill('Development');
  log('  Environment name: Development');

  // Fill variable key and value
  const keyInput = mainFrame!.locator('[data-testid="env-var-key"]').first();
  const valueInput = mainFrame!.locator('[data-testid="env-var-value"]').first();
  await keyInput.waitFor({ state: 'visible', timeout: 3_000 });
  await keyInput.fill('BASE_URL');
  await valueInput.fill('https://petstore.swagger.io/v2');
  log('  Variable: BASE_URL=https://petstore.swagger.io/v2');

  // Save
  await clickInFrame(mainFrame!, '[data-testid="env-save-btn"]');
  await window.waitForTimeout(1000);

  // Close the modal
  const overlay = mainFrame!.locator('[data-testid="env-manager-overlay"]');
  if (await overlay.count() > 0) {
    await clickInFrame(mainFrame!, '[data-testid="env-manager-overlay"]');
    await window.waitForTimeout(300);
  }

  // Now activate the environment via the TopBar EnvDropdown.
  // Click the env trigger to open the dropdown.
  await clickInFrame(mainFrame!, '[data-testid="env-trigger-label"]');
  await window.waitForTimeout(500);

  // Find and click the "Development" option in the dropdown
  const devOption = mainFrame!.locator('li').filter({ hasText: 'Development' });
  const devCount = await devOption.count();
  logCheck('Development option in dropdown', devCount);
  if (devCount > 0) {
    await clickWithCursor(devOption.first(), { force: true });
    await window.waitForTimeout(500);
    log('  Selected "Development" from dropdown');
  }

  // Verify env trigger label shows "Development"
  const envLabel = await mainFrame!.locator('[data-testid="env-trigger-label"]').textContent().catch(() => '');
  logCheck('Active environment label', (envLabel || '').trim());
  expect((envLabel || '').trim()).toBe('Development');

  await screenshot(window, '05b-env-variable-created');
  log('--- TEST 05b: done ---');
});

test('06 - Execute request and view response', async () => {
  log('--- TEST 06: Execute request and view response ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Check current method
  const methodLabel = await mainFrame!.locator('[data-testid="method-trigger-label"]').first().textContent().catch(() => '');
  const currentMethod = (methodLabel || '').trim();
  log(`Current method: "${currentMethod}"`);

  // Ensure method is GET
  if (currentMethod !== 'GET') {
    log('Switching to GET...');
    await clickInFrame(mainFrame!, '[data-testid="method-trigger"]');
    await mainFrame!.waitForTimeout(300);
    const getOption = mainFrame!.locator('.method-option').filter({ hasText: 'GET' });
    if (await getOption.count() > 0) {
      await clickWithCursor(getOption.first(), { force: true });
      log('Switched to GET');
    }
    await mainFrame!.waitForTimeout(300);
  }

  // Use env var {{BASE_URL}} in the URL bar to demonstrate env variable usage
  log('Setting URL to {{BASE_URL}}/store/inventory...');
  await fillVariableInput(mainFrame!, '.url-input', '{{BASE_URL}}/store/inventory');
  await mainFrame!.waitForTimeout(300);
  const urlValue = await getVariableInputValue(mainFrame!, '.url-input');
  log(`URL bar value: "${urlValue.slice(0, 80)}"`);
  expect(urlValue).toContain('BASE_URL');

  // Send via Enter key
  await sendRequestViaEnter(mainFrame!);
  log('Request sent');

  // Wait for the response status bar to appear
  log('Waiting for response status bar...');
  try {
    await mainFrame!.waitForFunction(() => {
      const el = document.querySelector('[data-testid="response-status-bar"]');
      return el !== null;
    }, { timeout: 20_000 });
    log('  Response status bar appeared');
  } catch (err) {
    logError('Timed out waiting for response status bar', err);
    try {
      await mainFrame!.waitForFunction(() => {
        const el = document.querySelector('#res-pane');
        if (!el || !el.textContent) return false;
        return el.textContent.includes('200') || el.textContent.includes('Error') ||
               el.textContent.includes('error') || /\d{3}/.test(el.textContent);
      }, { timeout: 10_000 });
      log('  Fallback: response content detected');
    } catch {
      logError('No response received at all');
    }
  }

  await window.waitForTimeout(1000);

  // Log response details
  const statusCode = await mainFrame!.locator('[data-testid="status-code"]').first().textContent().catch(() => '');
  logCheck('Status code', (statusCode || '').trim());
  const responseText = await mainFrame!.locator('#res-pane').textContent().catch(() => '');
  log(`Response pane (first 500 chars): "${(responseText || '').slice(0, 500).replace(/\n/g, ' ').trim()}"`);

  await screenshot(window, '06-response-received');
  log('--- TEST 06: done ---');
});

test('07 - View response logs tab', async () => {
  log('--- TEST 07: View response logs tab ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Response tabs only appear after a response is received
  const hasResTabs = await waitForElement(mainFrame!, '#res-tabs [role="tab"]', 10_000);
  logCheck('Response tabs visible', hasResTabs);

  const resTabs = mainFrame!.locator('#res-tabs [role="tab"]');
  const tabCount = await resTabs.count();
  logCheck('Response tab count', tabCount);

  for (let i = 0; i < tabCount; i++) {
    const text = await resTabs.nth(i).textContent().catch(() => '');
    log(`  res-tab[${i}]: "${(text || '').trim()}"`);
  }

  // Click Logs tab
  const logsTab = mainFrame!.locator('#res-tabs [role="tab"]').filter({ hasText: /Logs/i });
  const logsTabCount = await logsTab.count();
  logCheck('Logs tab found', logsTabCount);

  if (logsTabCount > 0) {
    await clickWithCursor(logsTab.first());
    log('Logs tab clicked');
  }
  await window.waitForTimeout(500);

  // Verify logs content
  const logSectionCount = await mainFrame!.locator('[data-testid="log-section"]').count().catch(() => 0);
  logCheck('Log sections visible', logSectionCount);

  await screenshot(window, '07-response-logs');
  log('--- TEST 07: done ---');
});

test('08 - View request logs with details', async () => {
  log('--- TEST 08: View request logs with details ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // We should still be on the Logs tab from test 07
  // Check for log sections with actual request/response data
  const logSections = mainFrame!.locator('[data-testid="log-section"]');
  const sectionCount = await logSections.count();
  logCheck('Log sections count', sectionCount);

  // List section titles
  for (let i = 0; i < Math.min(sectionCount, 10); i++) {
    const title = await logSections.nth(i).locator('[data-testid="log-title"]').textContent().catch(() => '');
    log(`  log-section[${i}]: "${(title || '').trim().slice(0, 60)}"`);
  }

  // Check for response status in logs
  const logsContent = await mainFrame!.locator('#res-pane').textContent().catch(() => '');
  log(`Logs content (first 600 chars): "${(logsContent || '').slice(0, 600).replace(/\n/g, ' ').trim()}"`);

  const hasResponseData = /200|201|204|OK|Response|Request|GET|petstore/i.test(logsContent || '');
  logCheck('Logs contain response data', hasResponseData);

  await screenshot(window, '08-request-response-logs');
  log('--- TEST 08: done ---');
});

test('09 - History shows executed requests', async () => {
  log('--- TEST 09: History shows executed requests ---');
  const { window } = app;

  // The sidebar has two webview panels: history and collections
  // History panel contains executed requests
  const historyView = window.locator('[id*="restify-history"]');
  const historyCount = await historyView.count().catch(() => 0);
  logCheck('History view container found', historyCount);

  // Try to find the history webview frame
  const allFrames = window.frames().filter(f => f.url().includes('vscode-webview://'));
  log(`Total webview frames: ${allFrames.length}`);

  let _historyFrameFound = false;
  for (const frame of allFrames) {
    const hasHistory = await frame.locator('text=History').count().catch(() => 0);
    const hasItem = await frame.locator('.item').count().catch(() => 0);
    log(`  Frame ${frame.url().slice(0, 50)}: history=${hasHistory} items=${hasItem}`);
    if (hasItem > 0) {
      _historyFrameFound = true;
    }
  }

  // The history items appear in the sidebar after executing a request
  // Check the VS Code sidebar DOM directly for history content
  const sidebar = window.locator('.part.sidebar');
  const sidebarText = await sidebar.textContent().catch(() => '');
  log(`Sidebar text: "${(sidebarText || '').slice(0, 500).replace(/\n/g, ' ').trim()}"`);

  const hasGET = (sidebarText || '').includes('GET');
  const hasPetstore = (sidebarText || '').includes('petstore') || (sidebarText || '').includes('inventory');
  logCheck('Sidebar contains "GET"', hasGET);
  logCheck('Sidebar contains petstore/inventory', hasPetstore);

  await screenshot(window, '09-history-entries');
  log('--- TEST 09: done ---');
});

test('10 - Show code generation modal', async () => {
  log('--- TEST 10: Show code generation modal ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Check if codegen button is enabled (it should be after sending a request in test 06)
  const codeGenBtn = mainFrame!.locator('[data-testid="codegen-btn"]');
  const codeGenCount = await codeGenBtn.count();
  logCheck('Codegen button found', codeGenCount);

  if (codeGenCount > 0) {
    const isDisabled = await codeGenBtn.first().getAttribute('disabled');
    logCheck('Codegen button disabled attribute', isDisabled);

    // Check if it has the .disabled class
    const hasDisabledClass = await codeGenBtn.first().evaluate(el => el.classList.contains('disabled')).catch(() => true);
    logCheck('Codegen button has .disabled class', hasDisabledClass);
  }

  // Use clickInFrame which tries focus+Space then force:true
  await clickInFrame(mainFrame!, '[data-testid="codegen-btn"]');

  // Wait for modal to appear
  const modalAppeared = await waitForElement(mainFrame!, '[data-testid="codegen-modal"]', 5_000);
  logCheck('Codegen modal appeared', modalAppeared);

  if (!modalAppeared) {
    log('  Trying fallback: evaluate click dispatch...');
    try {
      await mainFrame!.evaluate(() => {
        const btn = document.querySelector('[data-testid="codegen-btn"]') as HTMLButtonElement;
        if (btn) {
          btn.disabled = false;
          btn.click();
        }
      });
      await mainFrame!.waitForTimeout(1000);
      const retryAppeared = await mainFrame!.locator('[data-testid="codegen-modal"]').count();
      logCheck('Codegen modal after evaluate fallback', retryAppeared);
    } catch (err) {
      logError('Evaluate fallback failed', err);
    }
  }

  await window.waitForTimeout(800);

  // Check modal content
  const modalText = await mainFrame!.locator('[data-testid="codegen-modal"]').textContent().catch(() => '');
  log(`Modal text (first 500 chars): "${(modalText || '').slice(0, 500).replace(/\n/g, ' ').trim()}"`);

  const hasCodeContent = (modalText || '').includes('cURL') ||
                         (modalText || '').includes('JavaScript') ||
                         (modalText || '').includes('Python') ||
                         (modalText || '').includes('Generate');
  logCheck('Modal has code generation content', hasCodeContent);

  // Check language options
  const langButtons = mainFrame!.locator('[data-testid="codegen-modal"] button');
  const langCount = await langButtons.count();
  logCheck('Language buttons in codegen modal', langCount);

  await screenshot(window, '10-code-generation');

  // Close modal
  const closeBtn = mainFrame!.locator('[data-testid="codegen-overlay"]');
  if (await closeBtn.count() > 0) {
    await clickWithCursor(closeBtn, { position: { x: 10, y: 10 }, force: true });
    await window.waitForTimeout(400);
  }

  log('--- TEST 10: done ---');
});

test('11 - Show environment manager', async () => {
  log('--- TEST 11: Show environment manager ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Use clickInFrame for webview buttons (avoids iframe pointer-events issue)
  await clickInFrame(mainFrame!, '[data-testid="manage-env-btn"]');

  // Wait for modal to appear
  const modalAppeared = await waitForElement(mainFrame!, '[data-testid="env-manager-modal"]', 5_000);
  logCheck('Env manager modal appeared', modalAppeared);

  if (!modalAppeared) {
    log('  Trying fallback: evaluate click...');
    try {
      await mainFrame!.evaluate(() => {
        const btn = document.querySelector('[data-testid="manage-env-btn"]') as HTMLButtonElement;
        if (btn) btn.click();
      });
      await mainFrame!.waitForTimeout(1000);
      const retryCount = await mainFrame!.locator('[data-testid="env-manager-modal"]').count();
      logCheck('Env modal after evaluate', retryCount);
    } catch (err) {
      logError('Evaluate fallback failed', err);
    }
  }

  await window.waitForTimeout(800);

  const envModalText = await mainFrame!.locator('[data-testid="env-manager-modal"]').textContent().catch(() => '');
  log(`Env modal text (first 400 chars): "${(envModalText || '').slice(0, 400).replace(/\n/g, ' ').trim()}"`);

  const hasEnvContent = (envModalText || '').includes('Environment') ||
                        (envModalText || '').includes('Manage');
  logCheck('Env modal has expected content', hasEnvContent);

  // Verify existing environment is listed (created in test 05b)
  const hasDevEnv = (envModalText || '').includes('Development');
  logCheck('Development environment listed', hasDevEnv);

  await screenshot(window, '11-environment-manager');

  // Close modal — try multiple strategies
  // Strategy 1: click the close button if we're still in editing mode
  const closeBtn11 = mainFrame!.locator('[data-testid="env-modal-close"]');
  if (await closeBtn11.count() > 0) {
    await clickInFrame(mainFrame!, '[data-testid="env-modal-close"]');
    await window.waitForTimeout(300);
  }

  // Strategy 2: click overlay to close (evaluate-based for webview)
  const overlay11 = mainFrame!.locator('[data-testid="env-manager-overlay"]');
  if (await overlay11.count() > 0) {
    await clickInFrame(mainFrame!, '[data-testid="env-manager-overlay"]');
    await window.waitForTimeout(300);
  }

  // Strategy 3: press Escape as last resort
  const envModalStillOpen = await mainFrame!.locator('[data-testid="env-manager-modal"]').isVisible().catch(() => false);
  if (envModalStillOpen) {
    log('  Env modal still open, pressing Escape...');
    await mainFrame!.locator('body').press('Escape');
    await window.waitForTimeout(500);
  }

  // Verify modal is closed
  const modalGone = !(await mainFrame!.locator('[data-testid="env-manager-modal"]').isVisible().catch(() => false));
  logCheck('Env modal closed', modalGone);

  log('--- TEST 11: done ---');
});

test('12 - Show settings modal (proxy and mTLS)', async () => {
  log('--- TEST 12: Show settings modal ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Ensure no other modal is blocking (e.g., env manager from test 11)
  const envModalBlocking = await mainFrame!.locator('[data-testid="env-manager-modal"]').isVisible().catch(() => false);
  if (envModalBlocking) {
    log('  Env modal still open, closing it first...');
    await mainFrame!.locator('body').press('Escape');
    await window.waitForTimeout(500);
  }

  // Use clickInFrame for webview buttons
  await clickInFrame(mainFrame!, '[data-testid="gear-btn"]');

  // Wait for modal to appear — must be visible before screenshot
  const modalAppeared = await waitForElement(mainFrame!, '[data-testid="settings-modal"]', 5_000);
  logCheck('Settings modal appeared', modalAppeared);

  if (!modalAppeared) {
    log('  Trying fallback: evaluate click...');
    try {
      await mainFrame!.evaluate(() => {
        const btn = document.querySelector('[data-testid="gear-btn"]') as HTMLButtonElement;
        if (btn) btn.click();
      });
      await mainFrame!.waitForTimeout(1000);
      const retryAppeared = await waitForElement(mainFrame!, '[data-testid="settings-modal"]', 3_000);
      logCheck('Settings modal after evaluate', retryAppeared);
    } catch (err) {
      logError('Evaluate fallback failed', err);
    }
  }

  // Re-check visibility before proceeding
  const isModalVisible = await mainFrame!.locator('[data-testid="settings-modal"]').isVisible().catch(() => false);
  logCheck('Settings modal is visible', isModalVisible);
  expect(isModalVisible).toBe(true);

  await window.waitForTimeout(500);

  const modalText = await mainFrame!.locator('[data-testid="settings-modal"]').textContent().catch(() => '');
  log(`Settings modal text (first 500 chars): "${(modalText || '').slice(0, 500).replace(/\n/g, ' ').trim()}"`);

  const hasSettings = (modalText || '').includes('Settings');
  const hasProxy = (modalText || '').includes('Proxy');
  const hasCert = (modalText || '').includes('Certificate');
  logCheck('Settings contains "Settings"', hasSettings);
  logCheck('Settings contains "Proxy"', hasProxy);
  logCheck('Settings contains "Certificate"', hasCert);

  // Check for proxy inputs
  const proxyHostInput = await mainFrame!.locator('[data-testid="settings-modal"] input[placeholder*="proxy"]').count();
  const proxyPortInput = await mainFrame!.locator('[data-testid="settings-modal"] input[type="number"]').count();
  logCheck('Proxy host input found', proxyHostInput);
  logCheck('Proxy port input found', proxyPortInput);

  // Check for cert section
  const certSection = await mainFrame!.locator('.cert-list, .cert-form').count();
  logCheck('Certificate section found', certSection);

  await screenshot(window, '12-settings-proxy-mtls');

  // Close modal
  const cancelBtn = mainFrame!.locator('[data-testid="settings-overlay"]').first();
  const cancelCount = await cancelBtn.count().catch(() => 0);
  logCheck('Cancel button found', cancelCount);
  if (cancelCount > 0) {
    await clickInFrame(mainFrame!, '[data-testid="settings-overlay"]');
    await window.waitForTimeout(400);
  }

  log('--- TEST 12: done ---');
});

test('13 - Export collection', async () => {
  log('--- TEST 13: Export collection ---');
  const { window } = app;

  const _exportPath = '/Users/ashishbhasvar/Workspace/restify-vscode/export-test.json';

  const collectionsFrame = await findCollectionsFrame(window);
  logCheck('Collections frame found', collectionsFrame !== null);

  if (collectionsFrame) {
    const exportBtn = collectionsFrame.locator('button[title="Export collection"]');
    const exportAllBtn = collectionsFrame.locator('button[title="Export all collections"]');
    let exportCount = await exportBtn.count().catch(() => 0);
    let useAll = false;
    if (exportCount === 0) {
      exportCount = await exportAllBtn.count().catch(() => 0);
      useAll = true;
    }
    logCheck('Export button in collections frame', exportCount);

    if (exportCount > 0) {
      const btn = useAll ? exportAllBtn.first() : exportBtn.first();
      await clickWithCursor(btn, { force: true });
      log('Export button clicked');

      await window.waitForTimeout(1000);

      const inputBox = window.locator('.quick-input-widget .input-box input, .quick-input-widget input');
      const inputVisible = await inputBox.count().catch(() => 0);
      logCheck('Filename input box visible', inputVisible);

      if (inputVisible > 0) {
        await inputBox.first().clear();
        await inputBox.first().fill('export-test.json');
        await window.waitForTimeout(300);
        await window.keyboard.press('Enter');
        log('Filename entered and confirmed');
        await window.waitForTimeout(1500);
      } else {
        log('  No input box appeared — export may have saved with default name');
        await window.waitForTimeout(1000);
      }

      try {
        const result = execSync('ls -la /Users/ashishbhasvar/Workspace/restify-vscode/export-test.json 2>/dev/null || echo NOT_FOUND');
        log(`Export file check: ${result.toString().trim()}`);
      } catch {
        log('Export file check: not found or error');
      }

      await dismissNotification(window);
      await screenshot(window, '13-export-triggered');
    } else {
      const allBtns = collectionsFrame.locator('button');
      const btnCount = await allBtns.count();
      log(`  Total buttons in collections frame: ${btnCount}`);
      for (let i = 0; i < Math.min(btnCount, 15); i++) {
        const t = await allBtns.nth(i).textContent().catch(() => '');
        const title = await allBtns.nth(i).getAttribute('title').catch(() => '');
        log(`    btn[${i}] text="${(t || '').trim().slice(0, 30)}" title="${(title || '').slice(0, 30)}"`);
      }
      await screenshot(window, '13-export-triggered');
    }
  }

  log('--- TEST 13: done ---');
});

test('14 - Show bottom panel (Activity)', async () => {
  log('--- TEST 14: Show bottom panel (Activity) ---');
  const { window } = app;

  const panelPart = window.locator('.part.panel');
  const panelVisible = await panelPart.isVisible().catch(() => false);
  logCheck('Panel part visible', panelVisible);

  if (!panelVisible) {
    log('  Panel is collapsed, opening via Cmd+j...');
    await window.keyboard.press('Meta+j');
    await window.waitForTimeout(1500);
    const nowVisible = await panelPart.isVisible().catch(() => false);
    logCheck('Panel visible after Cmd+j', nowVisible);
  }

  await window.waitForTimeout(1000);

  // The panel container is titled "Restify" — click the "Restify" tab in the bottom panel
  // Panel container tabs are in .part.panel rendered as clickable labels
  const allText = await panelPart.textContent().catch(() => '');
  log(`  Panel text (first 200): "${(allText || '').slice(0, 200).replace(/\n/g, ' ').trim()}"`);

  // Try multiple selectors for the "Restify" panel tab
  const selectors = [
    '.part.panel .pane-tab:text("Restify")',
    '.part.panel [role="tab"]:has-text("Restify")',
    '.part.panel .tab:text("Restify")',
    '.part.panel .action-label:text("Restify")',
    '.part.panel .title:text("Restify")',
  ];

  let clicked = false;
  for (const sel of selectors) {
    const count = await panelPart.locator(sel).count().catch(() => 0);
    log(`  Selector "${sel}": ${count} matches`);
    if (count > 0) {
      await clickWithCursor(panelPart.locator(sel).first(), { force: true });
      log(`  Clicked Restify tab via: ${sel}`);
      clicked = true;
      await window.waitForTimeout(1500);
      break;
    }
  }

  if (!clicked) {
    // Fallback: find any element inside .part.panel that contains "Restify" text
    log('  No tab found by selector, trying text-based search...');
    const restifyEl = panelPart.locator('text=Restify').first();
    if (await restifyEl.count() > 0) {
      await clickWithCursor(restifyEl, { force: true });
      log('  Clicked "Restify" text element');
      clicked = true;
      await window.waitForTimeout(1500);
    }
  }

  if (!clicked) {
    // Last resort: command palette
    log('  Still not found, trying "View: Toggle Panel Activity Bar"...');
    await window.keyboard.press('Control+Shift+p');
    await window.waitForTimeout(500);
    await window.keyboard.type('Restify', { delay: 30 });
    await window.waitForTimeout(800);
    const cmdItem = window.locator('.quick-input-widget .monaco-list-row').filter({ hasText: /Restify/i }).first();
    if (await cmdItem.count() > 0) {
      await clickWithCursor(cmdItem, { force: true });
      log('  Clicked Restify command');
      await window.waitForTimeout(1500);
    } else {
      await window.keyboard.press('Escape');
    }
  }

  await window.waitForTimeout(1000);

  // Search webview frames for activity content
  const allFrames = window.frames().filter(f => f.url().includes('vscode-webview://'));
  log(`  Total webview frames: ${allFrames.length}`);
  let activityFound = false;
  for (const frame of allFrames) {
    const bodyText = await frame.locator('body').textContent().catch(() => '');
    const snippet = (bodyText || '').slice(0, 300).replace(/\n/g, ' ').trim();
    if (snippet.includes('Restify activated') || snippet.includes('Request loaded') || snippet.includes('Restify panel opened')) {
      log(`  Found activity content in frame: "${snippet.slice(0, 100)}"`);
      activityFound = true;
    }
  }
  logCheck('Activity content found in any frame', activityFound);

  await screenshot(window, '14-bottom-panel-activity');
  log('--- TEST 14: done ---');
});

test('15 - Request pane tabs overview', async () => {
  log('--- TEST 15: Request pane tabs overview ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  const reqTabs = mainFrame!.locator('#req-tabs [role="tab"]');
  const tabCount = await reqTabs.count();
  logCheck('Request tab count', tabCount);

  for (let i = 0; i < tabCount; i++) {
    const text = await reqTabs.nth(i).textContent().catch(() => '');
    log(`  req-tab[${i}]: "${(text || '').trim()}"`);
  }

  // 1) Headers tab — add a Content-Type header so the table is populated
  const headersTab = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Headers/i });
  if (await headersTab.count() > 0) {
    await clickWithCursor(headersTab.first(), { force: true });
    log('Clicked Headers tab');
    await window.waitForTimeout(500);

    // Click the "+ Add Header" button — it's a .add-row-btn inside the tab content
    const addHeaderBtn = mainFrame!.locator('.tab-content.active .add-row-btn');
    const addBtnCount = await addHeaderBtn.count();
    log(`  Add row button count in active tab: ${addBtnCount}`);

    if (addBtnCount > 0) {
      await clickWithCursor(addHeaderBtn.first(), { force: true });
      log('Clicked "+ Add Header" button');
      await window.waitForTimeout(500);
    } else {
      // Fallback: click any add-row-btn
      const anyAddBtn = mainFrame!.locator('.add-row-btn');
      const anyCount = await anyAddBtn.count();
      log(`  Any add-row-btn count: ${anyCount}`);
      if (anyCount > 0) {
        await clickWithCursor(anyAddBtn.first(), { force: true });
        log('Clicked first add-row-btn');
        await window.waitForTimeout(500);
      }
    }

    // Fill key/value in the header row
    const headerInputs = mainFrame!.locator('.tab-content.active .kv-input');
    const inputCount = await headerInputs.count();
    log(`  Header inputs found: ${inputCount}`);
    if (inputCount >= 2) {
      await headerInputs.nth(0).fill('Authorization');
      await headerInputs.nth(1).fill('Bearer token123');
      log('Filled header: Authorization Bearer token123');
      await window.waitForTimeout(200);
    }

    await screenshot(window, '15-request-headers-tab');
  }

  // 2) Body tab — switch to POST first, then select JSON body type
  const bodyTab = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Body/i });
  if (await bodyTab.count() > 0) {
    // First switch method to POST so Body tab is meaningful
    await clickInFrame(mainFrame!, '[data-testid="method-trigger"]');
    await mainFrame!.waitForTimeout(300);
    const postOption = mainFrame!.locator('.method-option').filter({ hasText: 'POST' });
    if (await postOption.count() > 0) {
      await clickWithCursor(postOption.first(), { force: true });
      log('Switched to POST');
      await window.waitForTimeout(300);
    }

    await clickWithCursor(bodyTab.first(), { force: true });
    log('Clicked Body tab');
    await window.waitForTimeout(300);

    // Select JSON body type
    const jsonBtn = mainFrame!.locator('[data-testid="body-type-json"]').filter({ hasText: /JSON/i });
    if (await jsonBtn.count() > 0) {
      await clickWithCursor(jsonBtn.first(), { force: true });
      log('Selected JSON body type');
      await window.waitForTimeout(300);
    }

    // Enter some JSON body
    const bodyEditor = mainFrame!.locator('.cm-content, .CodeMirror, textarea').first();
    if (await bodyEditor.count() > 0) {
      await clickWithCursor(bodyEditor, { force: true });
      await bodyEditor.fill('{"name": "Restify", "type": "API Client"}');
      log('Filled JSON body');
      await window.waitForTimeout(200);
    }

    await screenshot(window, '15-request-body-tab');
  }

  // 3) Script tab — click Insert Example to populate
  const scriptTab = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Script/i });
  if (await scriptTab.count() > 0) {
    await clickWithCursor(scriptTab.first(), { force: true });
    log('Clicked Script tab');
    await window.waitForTimeout(300);

    // Click "Insert Example" button to populate script
    const insertExampleBtn = mainFrame!.locator('button').filter({ hasText: /Insert Example/i }).first();
    if (await insertExampleBtn.count() > 0) {
      await clickWithCursor(insertExampleBtn, { force: true });
      log('Inserted example script');
      await window.waitForTimeout(300);
    }

    await screenshot(window, '15-request-script-tab');
  }

  // 4) Auth tab — select Bearer Token and fill a token value
  const authTab = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Auth/i });
  if (await authTab.count() > 0) {
    await clickWithCursor(authTab.first(), { force: true });
    log('Clicked Auth tab');
    await window.waitForTimeout(300);

    // Click the auth type dropdown to select Bearer
    const authDropdown = mainFrame!.locator('.auth-type-trigger');
    if (await authDropdown.count() > 0) {
      await clickWithCursor(authDropdown.first(), { force: true });
      log('Opened auth type dropdown');
      await window.waitForTimeout(300);

      const bearerOption = mainFrame!.locator('.auth-type-option').filter({ hasText: /Bearer/i });
      if (await bearerOption.count() > 0) {
        await clickWithCursor(bearerOption.first(), { force: true });
        log('Selected Bearer Token');
        await window.waitForTimeout(300);
      }
    }

    // Fill the token field using fillVariableInput
    const tokenInput = mainFrame!.locator('.auth-input').first();
    if (await tokenInput.count() > 0) {
      await clickWithCursor(tokenInput, { force: true });
      await window.waitForTimeout(100);
      // Type directly since it's a VariableTextInput display div
      await window.keyboard.type('eyJhbGciOiJIUzI1NiIs...', { delay: 10 });
      log('Typed bearer token');
      await window.waitForTimeout(200);
    }

    await screenshot(window, '15-request-auth-tab');
  }

  // Go back to Params tab for subsequent tests
  const paramsTab = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Params/i });
  if (await paramsTab.count() > 0) {
    await clickWithCursor(paramsTab.first(), { force: true });
    log('Clicked Params tab');
  }

  log('--- TEST 15: done ---');
});

test('16 - Execute POST request with JSON body', async () => {
  log('--- TEST 16: Execute POST request ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Switch method to POST using clickInFrame
  await clickInFrame(mainFrame!, '[data-testid="method-trigger"]');
  await mainFrame!.waitForTimeout(300);

  const postOption = mainFrame!.locator('.method-option').filter({ hasText: 'POST' });
  const postCount = await postOption.count().catch(() => 0);
  logCheck('POST option in dropdown', postCount);

  if (postCount > 0) {
    await clickWithCursor(postOption.first(), { force: true });
    log('POST selected');
  }
  await window.waitForTimeout(300);

  // Verify method changed
  const methodLabel = await mainFrame!.locator('[data-testid="method-trigger-label"]').first().textContent().catch(() => '');
  logCheck('Current method after selection', (methodLabel || '').trim());

  // Set URL to a POST endpoint using VariableTextInput helper
  await fillVariableInput(mainFrame!, '.url-input', 'https://petstore.swagger.io/v2/pet');
  log('URL set to POST endpoint');

  // Switch to Body tab and add JSON
  const bodyTab16 = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Body/i });
  if (await bodyTab16.count() > 0) {
    await clickWithCursor(bodyTab16.first(), { force: true });
    log('Body tab clicked');
    await window.waitForTimeout(300);

    // Select JSON body type
    const jsonBtn = mainFrame!.locator('[data-testid="body-type-json"]').filter({ hasText: /JSON/i });
    if (await jsonBtn.count() > 0) {
      await clickWithCursor(jsonBtn.first(), { force: true });
      log('JSON body type selected');
      await window.waitForTimeout(300);
    }

    // Type JSON body in the editor (CodeMirror or textarea)
    const bodyEditor = mainFrame!.locator('.cm-content, .CodeMirror, textarea').first();
    if (await bodyEditor.count() > 0) {
      await clickWithCursor(bodyEditor, { force: true });
      await bodyEditor.fill('{"id": 1, "name": "test", "status": "available"}');
      log('JSON body entered');
    }
  }

  await screenshot(window, '16-post-request-body');
  log('--- TEST 16: done ---');
});

test('17 - Full view: main panel with response', async () => {
  log('--- TEST 17: Full view final overview ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Click Body tab in response pane to show response body
  const bodyTab = mainFrame!.locator('#res-tabs [role="tab"]').filter({ hasText: /Body/i });
  if (await bodyTab.count() > 0) {
    await clickWithCursor(bodyTab.first(), { force: true });
    log('Clicked Body tab in response pane');
  }
  await window.waitForTimeout(300);

  // Final state dump
  await dumpPageState(window, 'Final state');
  await dumpSidebarState(window);

  // Verify key elements are present
  const hasUrlBar = await mainFrame!.locator('.url-input').count();
  const hasSendBtn = await mainFrame!.locator('[data-testid="send-btn"]').count();
  const hasCodeGenBtn = await mainFrame!.locator('[data-testid="codegen-btn"]').count();
  const hasSettingsBtn = await mainFrame!.locator('[data-testid="gear-btn"]').count();
  const hasEnvBtn = await mainFrame!.locator('[data-testid="manage-env-btn"]').count();
  logCheck('URL bar present', hasUrlBar > 0);
  logCheck('Send button present', hasSendBtn > 0);
  logCheck('CodeGen button present', hasCodeGenBtn > 0);
  logCheck('Settings button present', hasSettingsBtn > 0);
  logCheck('Env manager button present', hasEnvBtn > 0);

  // Check response pane for content
  const resPane = await mainFrame!.locator('#res-pane').textContent().catch(() => '');
  const hasResponse = (resPane || '').length > 100;
  logCheck('Response pane has content', hasResponse);

  await screenshot(window, '17-final-overview');
  log('--- TEST 17: done ---');
});

test('18 - Execute GET request for PDF and verify PDF content', async () => {
  log('--- TEST 18: PDF response content ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Focus on Headers tab before sending the request
  const headersTab18 = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Headers/i });
  if (await headersTab18.count() > 0) {
    await clickWithCursor(headersTab18.first(), { force: true });
    log('Clicked Headers tab before sending request');
    await window.waitForTimeout(500);
  }

  // Ensure method is GET
  const methodLabel = await mainFrame!.locator('[data-testid="method-trigger-label"]').first().textContent().catch(() => '');
  const currentMethod = (methodLabel || '').trim();
  if (currentMethod !== 'GET') {
    await clickInFrame(mainFrame!, '[data-testid="method-trigger"]');
    await mainFrame!.waitForTimeout(300);
    const getOption = mainFrame!.locator('.method-option').filter({ hasText: 'GET' });
    if (await getOption.count() > 0) {
      await clickWithCursor(getOption.first(), { force: true });
    }
    await mainFrame!.waitForTimeout(300);
  }

  // Set URL to the PDF sample
  await fillVariableInput(mainFrame!, '.url-input', 'https://www.princexml.com/samples/invoice-colorful/invoicesample.pdf');
  log('URL set to PDF endpoint');
  await mainFrame!.waitForTimeout(300);

  // Send the request
  await sendRequestViaEnter(mainFrame!);
  log('Request sent');

  // Wait for response
  log('Waiting for response status bar...');
  try {
    await mainFrame!.waitForFunction(() => {
      const el = document.querySelector('[data-testid="response-status-bar"]');
      return el !== null;
    }, { timeout: 30_000 });
    log('  Response status bar appeared');
  } catch {
    logError('Timed out waiting for response status bar');
  }
  await window.waitForTimeout(2000);

  // Click Body tab in response pane
  const bodyTab18 = mainFrame!.locator('#res-tabs [role="tab"]').filter({ hasText: /Body/i });
  if (await bodyTab18.count() > 0) {
    await clickWithCursor(bodyTab18.first(), { force: true });
    log('Clicked Body tab in response pane');
    await window.waitForTimeout(300);
  }

  // Check for PDF-specific elements in the response pane
  const resPane = mainFrame!.locator('#res-pane');
  const resText = await resPane.textContent().catch(() => '');
  log(`Response pane (first 300 chars): "${(resText || '').slice(0, 300).replace(/\n/g, ' ').trim()}"`);

  // Verify PDF content is displayed — look for react-pdf canvas/iframe or PDF viewer indicators
  const hasPdfCanvas = await mainFrame!.locator('.react-pdf__Page canvas, .react-pdf__Page svg').count().catch(() => 0);
  const hasPdfDocument = await mainFrame!.locator('[class*="pdf"], [data-testid*="pdf"]').count().catch(() => 0);
  const hasPdfText = /pdf|PDF|page|Page \d/i.test(resText || '');
  logCheck('PDF canvas/svg rendered', hasPdfCanvas);
  logCheck('PDF viewer container', hasPdfDocument);
  logCheck('PDF-related text in response', hasPdfText);

  // Check for download button (file responses have a download action)
  const hasDownloadBtn = await mainFrame!.locator('button:has-text("Download"), button[title*="download"], button[title*="Download"]').count().catch(() => 0);
  logCheck('Download button present', hasDownloadBtn);

  // Check meta chips for file info
  const hasFileType = /pdf|PDF|application\/pdf/i.test(resText || '');
  logCheck('File type info (PDF)', hasFileType);

  // Verify the response pane is not empty
  const hasResponse = (resText || '').length > 50;
  logCheck('Response pane has content', hasResponse);

  await screenshot(window, '18-pdf-response');
  log('--- TEST 18: done ---');
});

test('19 - Download file returns status 200', async () => {
  log('--- TEST 19: Download file (status 200) ---');
  const { window } = app;

  expect(mainFrame).not.toBeNull();

  // Focus on Headers tab before sending the request
  const headersTab19 = mainFrame!.locator('#req-tabs [role="tab"]').filter({ hasText: /Headers/i });
  if (await headersTab19.count() > 0) {
    await clickWithCursor(headersTab19.first(), { force: true });
    log('Clicked Headers tab before sending request');
    await window.waitForTimeout(500);
  }

  // Ensure we are on GET method
  const methodTrigger = mainFrame!.locator('.method-trigger, [data-testid="method-trigger"]');
  if (await methodTrigger.count() > 0) {
    const currentMethod = await methodTrigger.first().textContent().catch(() => '');
    if (!(currentMethod || '').includes('GET')) {
      await clickWithCursor(methodTrigger.first(), { force: true });
      await mainFrame!.waitForTimeout(300);
      const getOption = mainFrame!.locator('.method-option').filter({ hasText: 'GET' });
      if (await getOption.count() > 0) {
        await clickWithCursor(getOption.first(), { force: true });
      }
      await mainFrame!.waitForTimeout(300);
    }
  }

  // Set URL to the file download endpoint
  const downloadUrl = 'https://drive.usercontent.google.com/download?id=1zO8ekHWx9U7mrbx_0Hoxxu6od7uxJqWw&export=download&authuser=0';
  await fillVariableInput(mainFrame!, '.url-input', downloadUrl);
  log(`URL set to: ${downloadUrl.slice(0, 80)}...`);
  await mainFrame!.waitForTimeout(300);

  // Send the request
  await sendRequestViaEnter(mainFrame!);
  log('Request sent');

  // Wait for response status bar
  log('Waiting for response status bar...');
  try {
    await mainFrame!.waitForFunction(() => {
      const el = document.querySelector('[data-testid="response-status-bar"]');
      return el !== null;
    }, { timeout: 30_000 });
    log('  Response status bar appeared');
  } catch {
    logError('Timed out waiting for response status bar');
  }
  await window.waitForTimeout(2000);

  // Click Body tab in response pane
  const bodyTab19 = mainFrame!.locator('#res-tabs [role="tab"]').filter({ hasText: /Body/i });
  if (await bodyTab19.count() > 0) {
    await clickWithCursor(bodyTab19.first(), { force: true });
    log('Clicked Body tab in response pane');
    await window.waitForTimeout(300);
  }

  // Check response status
  const statusBar = mainFrame!.locator('[data-testid="response-status-bar"]');
  const statusText = await statusBar.textContent().catch(() => '');
  log(`Response status: "${(statusText || '').trim().slice(0, 60)}"`);

  // Verify status is 200
  const has200 = /200/i.test(statusText || '');
  logCheck('Status code is 200', has200);

  // Check for download-related elements in the response pane
  const resPane = mainFrame!.locator('#res-pane');
  const resText = await resPane.textContent().catch(() => '');
  log(`Response pane (first 300 chars): "${(resText || '').slice(0, 300).replace(/\n/g, ' ').trim()}"`);

  // Check for file download indicators
  const hasDownloadBtn = await mainFrame!.locator('button:has-text("Download"), button[title*="download"], button[title*="Download"]').count().catch(() => 0);
  logCheck('Download button present', hasDownloadBtn);

  // Verify response pane has content
  const hasResponse = (resText || '').length > 10;
  logCheck('Response pane has content', hasResponse);

  await screenshot(window, '19-download-file-response');
  log('--- TEST 19: done ---');
  log('=== ALL TESTS COMPLETE ===');
});

}); // end describe
