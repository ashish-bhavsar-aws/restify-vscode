import { _electron as electron, type ElectronApplication, type Page, type Frame } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const TEST_USER_DATA = path.resolve(__dirname, '..', '.vscode-test-user-data');
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const VIDEO_DIR = path.resolve(__dirname, '..', 'videos');

// ─── Debug Logger ───────────────────────────────────────────────────

let _step = 0;

export function log(msg: string): void {
  _step++;
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`  [${ts}] [step ${String(_step).padStart(3, '0')}] ${msg}`); // eslint-disable-line no-console
}

export function logCheck(msg: string, result: boolean | string | number): void {
  _step++;
  const ts = new Date().toISOString().slice(11, 23);
  const icon = result === false || result === 0 ? '✗' : '✓';
  console.log(`  [${ts}] [step ${String(_step).padStart(3, '0')}] ${icon} CHECK: ${msg} → ${JSON.stringify(result)}`); // eslint-disable-line no-console
}

export function logError(msg: string, err?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`  [${ts}] ✗ ERROR: ${msg}`, err ? String(err) : '');
}

export function resetLog(): void {
  _step = 0;
}

// ─── Frame/State diagnostics ────────────────────────────────────────

export async function dumpPageState(page: Page, label: string): Promise<void> {
  const title = await page.title().catch(() => '<unknown>');
  const _url = page.url();
  const frames = page.frames();
  const webviewFrames = frames.filter(f => f.url().includes('vscode-webview://'));
  const iframeCount = await page.locator('iframe').count().catch(() => 0);
  log(`${label} — title="${title}" frames=${frames.length} webviews=${webviewFrames.length} iframes_in_dom=${iframeCount}`);

  // Log all frames for debug
  for (let i = 0; i < frames.length; i++) {
    log(`  frame[${i}]: url="${frames[i].url().slice(0, 80)}" name="${frames[i].name()}"`);
  }

  for (let i = 0; i < iframeCount; i++) {
    const src = await page.locator('iframe').nth(i).getAttribute('src').catch(() => '');
    log(`  dom_iframe[${i}]: src="${(src || '').slice(0, 80)}"`);
  }

  for (let i = 0; i < webviewFrames.length; i++) {
    const f = webviewFrames[i];
    const hasUrlBar = await f.locator('[data-testid="url-input"], .url-input').count().catch(() => 0);
    const hasSendBtn = await f.locator('[data-testid="send-btn"]').count().catch(() => 0);
    const bodyText = await f.evaluate(() => document.body?.innerText?.slice(0, 120) || '', () => '').catch(() => '<err>');
    log(`  webview[${i}]: urlBar=${hasUrlBar} sendBtn=${hasSendBtn} body="${bodyText.replace(/\n/g, ' ').trim()}"`);
  }
}

export async function dumpSidebarState(page: Page): Promise<void> {
  const sidebar = page.locator('.part.sidebar');
  if (await sidebar.count() === 0) {
    log('Sidebar: NOT FOUND in DOM');
    return;
  }
  const text = await sidebar.textContent().catch(() => '');
  log(`Sidebar visible, content preview: "${(text || '').slice(0, 200).replace(/\n/g, ' ').trim()}"`);

  const historyItems = await sidebar.locator('[class*="item"], .item').count().catch(() => 0);
  const collectionItems = await sidebar.locator('[class*="collection"], .collection-group, .collection-header').count().catch(() => 0);
  log(`  historyItems=${historyItems} collectionGroups=${collectionItems}`);
}

// ─── App lifecycle ──────────────────────────────────────────────────

export interface VSCodeApp {
  electronApp: ElectronApplication;
  window: Page;
}

export async function launchVSCode(): Promise<VSCodeApp> {
  log('Launching VS Code...');

  if (fs.existsSync(TEST_USER_DATA)) {
    log('  Cleaning previous user-data dir...');
    fs.rmSync(TEST_USER_DATA, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_USER_DATA, { recursive: true });

  // Write settings.json for dark theme + maximize
  const settingsDir = path.join(TEST_USER_DATA, 'User');
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
    'workbench.colorTheme': 'Default Dark Modern',
    'window.newWindowDimensions': 'maximized',
  }, null, 2));
  log('  settings.json written (dark theme + maximize)');

  log('  Downloading VS Code (stable)...');
  const vscodeExecutablePath = await downloadAndUnzipVSCode('stable');
  log(`  VS Code executable: ${vscodeExecutablePath}`);

  log('  Spawning Electron process...');
  const electronApp = await electron.launch({
    executablePath: vscodeExecutablePath,
    args: [
      '--no-sandbox',
      '--disable-gpu',
      `--user-data-dir=${TEST_USER_DATA}`,
      `--extensionDevelopmentPath=${EXTENSION_PATH}`,
    ],
    env: {
      ...process.env,
      RESTIFY_TEST_EXPORT_PATH: path.join(SCREENSHOT_DIR, 'export-test.json'),
    },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });
  log('  Electron launched, waiting for first window...');

  const window = await electronApp.firstWindow();
  log(`  First window opened (id=${window.url()})`);

  log('  Waiting for VS Code title to appear...');
  await window.waitForFunction(() => document.title.length > 0, { timeout: 30_000 });
  const title = await window.title();
  logCheck('VS Code title loaded', title);

  log('  Waiting 8s for extension activation and main panel...');
  await window.waitForTimeout(8000);

  await dumpPageState(window, 'Post-activation state');
  log('VS Code ready');
  return { electronApp, window };
}

export async function closeVSCode(app: VSCodeApp): Promise<void> {
  log('Closing VS Code...');

  // Save recorded video before closing
  try {
    const video = app.window.video;
    if (video) {
      // Playwright auto-saves to recordVideo.dir; try to copy final video
      const videoPath = typeof video.path === 'function' ? await video.path() : null;
      if (videoPath && fs.existsSync(videoPath)) {
        fs.mkdirSync(VIDEO_DIR, { recursive: true });
        const dest = path.join(VIDEO_DIR, 'final-demo.webm');
        fs.copyFileSync(videoPath, dest);
        log(`Video saved: ${dest}`);
      } else {
        log('Video recorded to recordVideo.dir (auto-saved)');
      }
    }
  } catch (e) {
    log(`  Could not save video: ${e}`);
  }

  try { await app.electronApp.close(); } catch { /* already closed */ }
  if (fs.existsSync(TEST_USER_DATA)) {
    fs.rmSync(TEST_USER_DATA, { recursive: true, force: true });
  }
  log('VS Code closed and cleanup done');
}

// ─── Screenshot helper ──────────────────────────────────────────────

export async function screenshot(page: Page, name: string): Promise<string> {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath, fullPage: false });
  log(`Screenshot saved: ${name}.png`);
  return filePath;
}

// ─── Cursor overlay ───────────────────────────────────────────────

export async function injectCursorOverlay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const CURSOR_SVG = `data:image/svg+xml,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-2 6z" fill="white" stroke="black" stroke-width="1.2" stroke-linejoin="round"/></svg>`
    )}`;

    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after { cursor: none !important; }

      #restify-cursor {
        position: fixed;
        top: 0; left: 0;
        width: 24px; height: 24px;
        pointer-events: none;
        z-index: 2147483647;
        transition: transform 80ms ease;
        will-change: transform, top, left;
      }
      #restify-cursor img {
        width: 24px; height: 24px;
        display: block;
      }
      #restify-cursor.scale-down {
        transform: scale(0.85);
      }

      @keyframes restify-ripple {
        0%   { transform: translate(-50%, -50%) scale(0);   opacity: 0.7; }
        100% { transform: translate(-50%, -50%) scale(2.5); opacity: 0; }
      }
      .restify-ripple {
        position: fixed;
        width: 30px; height: 30px;
        border: 2px solid rgba(255, 255, 255, 0.7);
        border-radius: 50%;
        pointer-events: none;
        z-index: 2147483647;
        animation: restify-ripple 300ms ease-out forwards;
        will-change: transform, opacity;
      }
    `;
    document.head.appendChild(style);

    const cursor = document.createElement('div');
    cursor.id = 'restify-cursor';
    const img = document.createElement('img');
    img.src = CURSOR_SVG;
    img.draggable = false;
    cursor.appendChild(img);
    document.body.appendChild(cursor);

    document.addEventListener('mousemove', (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    }, { passive: true });

    document.addEventListener('mousedown', () => {
      cursor.classList.add('scale-down');
      setTimeout(() => cursor.classList.remove('scale-down'), 80);
    }, { passive: true });

    document.addEventListener('mousedown', (e) => {
      const ripple = document.createElement('div');
      ripple.className = 'restify-ripple';
      ripple.style.left = `${e.clientX}px`;
      ripple.style.top = `${e.clientY}px`;
      document.body.appendChild(ripple);
      setTimeout(() => ripple.remove(), 300);
    }, { passive: true });
  });
  log('Cursor overlay injected');
}

// ─── Frame discovery (with retry) ───────────────────────────────────

export async function getWebviewFrames(page: Page): Promise<Frame[]> {
  const frames = page.frames().filter(f => f.url().includes('vscode-webview://'));
  log(`Found ${frames.length} webview frame(s)`);
  return frames;
}

/** Collect all webview frame URLs currently present in the page. */
export async function snapshotWebviewFrameUrls(page: Page): Promise<Set<string>> {
  const urls = new Set<string>();
  for (const f of page.frames()) {
    if (f.url().includes('vscode-webview://')) urls.add(f.url());
  }
  return urls;
}

/** Find a Send-button frame, searching last-to-first (newest panel first). */
async function findSendButtonNewest(page: Page): Promise<Frame | null> {
  const allFrames = [...page.frames()].reverse();
  for (const frame of allFrames) {
    if (!frame.url().includes('vscode-webview://')) continue;
    const result = await findSendButtonInTree(frame);
    if (result) return result;
  }
  return null;
}

/**
 * Wait for a NEW webview frame (not in `beforeUrls`) that contains a Send button.
 * This is used after clicking a sidebar request which opens a new panel.
 */
export async function waitForNewMainPanelFrame(
  page: Page,
  beforeUrls: Set<string>,
  timeoutMs = 20_000,
): Promise<Frame | null> {
  log(`Waiting for NEW main panel frame (timeout=${timeoutMs}ms)...`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Check if any new webview frame appeared
    for (const frame of page.frames()) {
      if (!frame.url().includes('vscode-webview://')) continue;
      if (beforeUrls.has(frame.url())) continue; // skip old frames

      // This is a new frame — check if it has a Send button
      const result = await findSendButtonInTree(frame);
      if (result) {
        log(`  ✓ Found NEW frame with Send button: ${result.url().slice(0, 70)}`);
        return result;
      }
    }
    log('  No new Send-button frame yet, retrying in 1s...');
    await page.waitForTimeout(1000);
  }

  logError(`No new main panel frame appeared after ${timeoutMs}ms`);
  return null;
}

export async function findMainPanelFrame(page: Page, timeoutMs = 30_000): Promise<Frame | null> {
  log(`Searching for main panel frame (timeout=${timeoutMs}ms)...`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const result = await findSendButtonNewest(page);
    if (result) return result;

    // Try clicking the Restify/New Request tab to trigger frame creation
    const restifyTab = page.locator('.tab').filter({ hasText: /Restify|New Request/i });
    if (await restifyTab.count() > 0) {
      log('  Found Restify/New Request tab, clicking to focus...');
      await restifyTab.first().click();
      await page.waitForTimeout(2000);
    }

    log('  Retrying in 2s...');
    await page.waitForTimeout(2000);
  }

  logError(`No main panel frame found after ${timeoutMs}ms!`);
  return null;
}

async function findSendButtonInTree(frame: Frame, depth = 0): Promise<Frame | null> {
  const prefix = '  '.repeat(depth + 1);

  // Check this frame for Send button
  const hasSend = await frame.locator('[data-testid="send-btn"], button:has-text("Send")').count().catch(() => 0);
  if (hasSend > 0) {
    log(`${prefix}✓ Found frame with Send button: ${frame.url().slice(0, 60)}`);
    return frame;
  }

  // Check child frames (webview panels use nested iframes)
  for (const child of frame.childFrames()) {
    const childSend = await child.locator('[data-testid="send-btn"], button:has-text("Send")').count().catch(() => 0);
    if (childSend > 0) {
      log(`${prefix}✓ Found child frame with Send button: ${child.url().slice(0, 60)}`);
      return child;
    }
    // One more level
    for (const gc of child.childFrames()) {
      const gcSend = await gc.locator('[data-testid="send-btn"], button:has-text("Send")').count().catch(() => 0);
      if (gcSend > 0) {
        log(`${prefix}✓ Found grandchild frame with Send button: ${gc.url().slice(0, 60)}`);
        return gc;
      }
    }
  }

  return null;
}

export async function findSidebarWebviewFrames(page: Page): Promise<Frame[]> {
  log('Searching for sidebar webview frames...');
  const allFrames = page.frames().filter(f => f.url().includes('vscode-webview://'));
  log(`  Total webview frames: ${allFrames.length}`);

  const sidebarFrames: Frame[] = [];
  for (const frame of allFrames) {
    // Check if this frame contains sidebar content (Filter input, collection items, etc.)
    const hasFilter = await frame.locator('input[placeholder*="Filter"], input[placeholder*="filter"], [class*="filter"], [class*="search"]').count().catch(() => 0);
    const hasExpandAll = await frame.locator('button[title*="Expand"], button[title*="Collapse"], [class*="expand"], [class*="collapse"]').count().catch(() => 0);
    const hasCollection = await frame.locator('text=Swagger Petstore, text=collection, [class*="collection"], [class*="collection-name"]').count().catch(() => 0);
    log(`  Frame ${frame.url().slice(0, 50)}: filter=${hasFilter} expandBtn=${hasExpandAll} collection=${hasCollection}`);

    if (hasFilter > 0 || hasExpandAll > 0 || hasCollection > 0) {
      sidebarFrames.push(frame);
    }
  }
  log(`  Sidebar frames found: ${sidebarFrames.length}`);
  return sidebarFrames;
}

export async function findCollectionsFrame(page: Page): Promise<Frame | null> {
  log('Searching for collections sidebar frame...');
  const allFrames = page.frames().filter(f => f.url().includes('vscode-webview://'));

  for (const frame of allFrames) {
    const hasExpandAll = await frame.locator('button[title*="Expand"], button[title*="Collapse"], [class*="expand"], [class*="collapse"]').count().catch(() => 0);
    const hasCollectionName = await frame.locator('text=Swagger Petstore, text=Petstore').count().catch(() => 0);
    if (hasExpandAll > 0 || hasCollectionName > 0) {
      log(`  ✓ Found collections frame: ${frame.url().slice(0, 60)}`);
      return frame;
    }
  }

  // Fallback: find frame with "Filter..." textbox (sidebar filter)
  for (const frame of allFrames) {
    const hasFilter = await frame.locator('input[placeholder*="Filter"]').count().catch(() => 0);
    if (hasFilter > 0) {
      log(`  Fallback: using frame with filter input: ${frame.url().slice(0, 60)}`);
      return frame;
    }
  }

  logError('No collections sidebar frame found');
  return null;
}

// ─── Activity bar helpers ───────────────────────────────────────────

export async function dismissOnboarding(page: Page): Promise<void> {
  log('Checking for onboarding dialog...');
  const overlay = page.locator('.onboarding-a-overlay.visible, .onboarding-dialog, [role="dialog"][aria-modal="true"]');
  const count = await overlay.count();
  logCheck('Onboarding overlay found', count);
  if (count > 0) {
    // Try to find a close/dismiss button inside the dialog
    const closeBtn = page.locator('.onboarding-a-overlay .codicon-close, .onboarding-dialog .codicon-close, [role="dialog"] .codicon-close');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click({ timeout: 3_000 });
      log('  Onboarding dialog dismissed via close button');
    } else {
      // Try pressing Escape
      await page.keyboard.press('Escape');
      log('  Onboarding dialog dismissed via Escape');
    }
    await page.waitForTimeout(500);
  }
  // Also check for "Do not show again" or skip buttons
  const skipBtn = page.locator('.onboarding-a-overlay .btn, .onboarding-dialog .btn').filter({ hasText: /Skip|Dismiss|Close|Do not show/i });
  if (await skipBtn.count() > 0) {
    await skipBtn.first().click({ timeout: 3_000 }).catch(() => {});
    await page.waitForTimeout(300);
  }
}

export async function clickRestifyIcon(page: Page): Promise<void> {
  log('Clicking Restify activity bar icon...');

  // Dismiss any onboarding dialogs first
  await dismissOnboarding(page);

  const icon = page.locator('.part.activitybar .action-label[aria-label*="Restify"]');
  const count = await icon.count();
  logCheck('Restify icon by aria-label', count);

  if (count > 0) {
    await icon.first().click({ force: true });
  } else {
    logError('No Restify icon found in activity bar!');
    return;
  }
  log('  Waiting 800ms for sidebar to appear...');
  await page.waitForTimeout(800);
}

export async function isSidebarVisible(page: Page): Promise<boolean> {
  const sidebar = page.locator('.part.sidebar');
  const sidebarCount = await sidebar.count();
  if (sidebarCount === 0) {
    logCheck('Sidebar in DOM', false);
    return false;
  }
  const content = await sidebar.textContent().catch(() => '');
  const visible = content.includes('History') || content.includes('Collections');
  logCheck('Sidebar visible with History/Collections', visible);
  return visible;
}

export async function ensureSidebarOpen(page: Page): Promise<void> {
  const visible = await isSidebarVisible(page);
  if (!visible) {
    log('Sidebar not visible, clicking Restify icon...');
    await clickRestifyIcon(page);
  } else {
    log('Sidebar already visible');
  }
}

// ─── VS Code quick pick / input box ────────────────────────────────

export async function selectQuickPick(page: Page, label: string): Promise<void> {
  log(`Selecting quick pick: "${label}"...`);
  // Wait for widget to be visible, not just present in DOM
  await page.locator('.quick-input-widget').waitFor({ state: 'visible', timeout: 10_000 });
  log('  Quick input widget appeared');

  const entries = page.locator('.quick-input-list-entry');
  const entryCount = await entries.count();
  log(`  ${entryCount} quick pick entries found`);
  for (let i = 0; i < Math.min(entryCount, 8); i++) {
    const text = await entries.nth(i).textContent().catch(() => '');
    log(`    [${i}] "${(text || '').trim().slice(0, 60)}"`);
  }

  const item = entries.filter({ hasText: label });
  const matchCount = await item.count();
  logCheck(`Entries matching "${label}"`, matchCount);

  if (matchCount === 0) {
    logError(`No quick pick entry found matching "${label}"`);
    return;
  }

  await item.first().click();
  log('  Quick pick item clicked');
  await page.waitForTimeout(400);
}

export async function typeInQuickInput(page: Page, text: string): Promise<void> {
  log(`Typing in quick input: "${text}"...`);
  // Wait for the quick input widget to be attached. After a quick pick
  // closes and showInputBox opens, VS Code reuses the same container —
  // the widget is always attached, but may briefly hide during transition.
  try {
    await page.locator('.quick-input-widget').waitFor({ state: 'attached', timeout: 10_000 });
  } catch {
    log('  .quick-input-widget not attached, trying .quick-input-box...');
    await page.locator('.quick-input-box').waitFor({ state: 'attached', timeout: 5_000 });
  }

  const input = page.locator('.quick-input-widget input, .quick-input-box input');

  // Wait for the actual input element to be visible inside the widget.
  // This ensures the showInputBox input has rendered (not a stale quick-pick filter).
  try {
    await input.first().waitFor({ state: 'visible', timeout: 5_000 });
  } catch {
    log('  Input not visible within timeout, continuing anyway...');
  }

  // Strategy 1: click to focus, select all, then type via keyboard.
  // This simulates real user interaction and is the most reliable with
  // VS Code's quick input widget which may not react to synthetic events.
  try {
    await input.first().click({ force: true, timeout: 3_000 });
    await page.waitForTimeout(100);
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(50);
    await page.keyboard.type(text, { delay: 15 });
    log('  Input filled via click + keyboard type');
    await page.waitForTimeout(200);
    return;
  } catch {
    log('  click+keyboard failed, trying fill()...');
  }

  // Strategy 2: try Playwright fill
  const count = await input.count();
  logCheck('Quick input field found', count);
  if (count > 0) {
    try {
      await input.first().fill(text, { timeout: 3_000 });
      log('  Input filled via fill()');
      await page.waitForTimeout(200);
      return;
    } catch {
      log('  fill() failed, trying evaluate...');
    }
  }

  // Strategy 3: use evaluate to directly set the input value + dispatch events
  try {
    const set = await page.evaluate((t) => {
      const inp = document.querySelector('.quick-input-widget input, .quick-input-box input') as HTMLInputElement | null;
      if (!inp) return false;
      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(inp, t);
      } else {
        inp.value = t;
      }
      inp.dispatchEvent(new Event('input', { bubbles: true }));
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, text);
    if (set) {
      log('  Input value set via evaluate');
      await page.waitForTimeout(200);
      return;
    }
  } catch (e) {
    log(`  evaluate set failed: ${e}`);
  }

  // Strategy 4: just type via keyboard (last resort)
  await page.keyboard.type(text, { delay: 20 });
  log('  Text filled via keyboard (last resort)');
  await page.waitForTimeout(200);
}

export async function confirmQuickInput(page: Page): Promise<void> {
  log('Confirming quick input (Enter)...');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  log('  Quick input confirmed');
}

export async function dismissNotification(page: Page): Promise<void> {
  log('Trying to dismiss notification...');
  try {
    const close = page.locator('.notification-toast .notification-close-button, .notifications-toasts .codicon-close');
    const count = await close.count();
    logCheck('Notification toast found', count);
    if (count > 0) {
      await close.first().click({ timeout: 2000 });
      log('  Notification dismissed');
    }
  } catch {
    log('  No notification to dismiss (already dismissed or not present)');
  }
}

// ─── Webview interaction helpers (click-based) ──────────────────────

export async function clickButton(frame: Frame, text: string): Promise<void> {
  log(`Clicking button "${text}" in webview frame...`);
  const btn = frame.locator(`button:has-text("${text}")`);
  const count = await btn.count();
  logCheck(`Button "${text}" found in frame`, count);
  if (count === 0) {
    const allBtns = frame.locator('button');
    const allCount = await allBtns.count();
    log(`  Total buttons in frame: ${allCount}`);
    for (let i = 0; i < Math.min(allCount, 10); i++) {
      const t = await allBtns.nth(i).textContent().catch(() => '');
      log(`    btn[${i}]: "${(t || '').trim().slice(0, 40)}"`);
    }
  }
  // force:true — Playwright sees the outer iframe as intercepting pointer events
  // but the button IS correctly inside the target frame
  await btn.first().click({ force: true });
  log(`  Button "${text}" clicked`);
  await frame.waitForTimeout(300);
}

export async function clickClass(frame: Frame, className: string): Promise<void> {
  log(`Clicking .${className} in frame...`);
  const el = frame.locator(`.${className}`);
  const count = await el.count();
  logCheck(`.${className} found`, count);
  await el.first().click({ force: true });
  await frame.waitForTimeout(300);
}

export async function fillByPlaceholder(frame: Frame, placeholder: string, value: string): Promise<void> {
  log(`Filling input [placeholder*="${placeholder}"] with "${value}"...`);
  const input = frame.locator(`input[placeholder*="${placeholder}"]`);
  const count = await input.count();
  logCheck('Input field found', count);
  await input.first().fill(value);
  log('  Input filled');
}

export async function hasElement(frame: Frame, selector: string): Promise<boolean> {
  const count = await frame.locator(selector).count().catch(() => 0);
  logCheck(`Element "${selector}" exists`, count > 0);
  return count > 0;
}

export async function waitForFrameText(frame: Frame, text: string, timeout = 15_000): Promise<void> {
  log(`Waiting for text "${text.slice(0, 50)}..." in frame (timeout=${timeout}ms)...`);
  await frame.waitForFunction(
    (t: string) => document.body?.innerText?.includes(t) || false,
    text,
    { timeout },
  );
  log('  Text found in frame');
}

export async function clickTabInFrame(frame: Frame, tabName: string, containerSelector = '.tab-bar'): Promise<void> {
  log(`Clicking tab "${tabName}" in ${containerSelector}...`);
  const tab = frame.locator(`${containerSelector} .tab`).filter({ hasText: new RegExp(tabName, 'i') });
  const count = await tab.count();
  logCheck(`Tab "${tabName}" found`, count);
  if (count > 0) {
    await tab.first().click();
    log(`  Tab "${tabName}" clicked`);
  }
  await frame.waitForTimeout(300);
}

// ─── Webview-safe click helpers ──────────────────────────────────────
// Playwright's force:true dispatches native click but React's synthetic
// event system may not receive it inside iframes.  Two strategies:
//   1. focus() + keyboard Space/Enter — works if element is focusable
//   2. force:true click — fallback for non-focusable elements

export async function clickInFrame(frame: Frame, selector: string, _opts?: { force?: boolean }): Promise<void> {
  log(`Clicking "${selector}" in frame (webview-safe)...`);
  const el = frame.locator(selector);
  const count = await el.count();
  logCheck(`"${selector}" found`, count);
  if (count === 0) return;

  // Strategy 1: evaluate-based click (dispatches a real MouseEvent that React picks up)
  try {
    const dispatched = await frame.evaluate((sel) => {
      const btn = document.querySelector(sel) as HTMLElement | null;
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      const evt = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      btn.dispatchEvent(evt);
      return true;
    }, selector);
    if (dispatched) {
      log(`  Clicked "${selector}" via evaluate dispatch`);
      await frame.waitForTimeout(500);
      return;
    }
  } catch {
    log(`  evaluate click failed for "${selector}", trying focus+Space...`);
  }

  // Strategy 2: focus + keyboard Space
  try {
    await el.first().focus({ timeout: 3_000 });
    await el.first().press('Space');
    log(`  Clicked "${selector}" via focus + Space`);
    await frame.waitForTimeout(300);
    return;
  } catch {
    log(`  focus+Space failed for "${selector}", trying force:true...`);
  }

  // Strategy 3: force:true click
  try {
    await el.first().click({ force: true, timeout: 3_000 });
    log(`  Clicked "${selector}" via force:true`);
  } catch (err) {
    logError(`Failed to click "${selector}"`, err);
  }
  await frame.waitForTimeout(300);
}

export async function waitForElement(frame: Frame, selector: string, timeout = 15_000): Promise<boolean> {
  log(`Waiting for "${selector}" in frame (timeout=${timeout}ms)...`);
  try {
    await frame.locator(selector).first().waitFor({ state: 'visible', timeout });
    log(`  "${selector}" is visible`);
    return true;
  } catch {
    log(`  "${selector}" not found within timeout`);
    return false;
  }
}

// ─── VariableTextInput helpers ───────────────────────────────────────
// The URL bar uses VariableTextInput: a <div> display that becomes an
// <input> on click.  The display uses onMouseUp (not onClick), and
// force:true native clicks don't reach React's synthetic event system
// inside webview iframes.  We use evaluate() to dispatch proper events.

export async function fillVariableInput(
  frame: Frame,
  wrapperSelector: string,
  value: string,
): Promise<void> {
  log(`Filling VariableTextInput "${wrapperSelector}" with "${value.slice(0, 40)}..."`);

  // Step 1: Use evaluate to dispatch a React-compatible mouseup on the display div.
  // This triggers the onMouseUp handler which calls focusInputWithSelection().
  await frame.evaluate((sel) => {
    const display = document.querySelector(`${sel} [data-testid="variable-text-display"]`);
    if (display) {
      const rect = display.getBoundingClientRect();
      const evt = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      display.dispatchEvent(evt);
    }
  }, wrapperSelector);
  await frame.waitForTimeout(300);

  // Step 2: The <input> should now be visible — find and fill it
  const input = frame.locator(`${wrapperSelector} [data-testid="variable-text-input"]`);
  try {
    await input.first().waitFor({ state: 'visible', timeout: 3_000 });
  } catch {
    log('  Input still not visible after mouseup dispatch, trying direct focus...');
    await frame.evaluate((sel) => {
      const display = document.querySelector(`${sel} [data-testid="variable-text-display"]`);
      if (display) (display as HTMLElement).click();
    }, wrapperSelector);
    await frame.waitForTimeout(300);
    await input.first().waitFor({ state: 'visible', timeout: 3_000 });
  }

  // Step 3: Select all and type the new value
  await input.first().click({ force: true });
  await input.first().press('Meta+a');
  await frame.waitForTimeout(100);
  await input.first().fill(value);
  log('  VariableTextInput filled');
}

export async function getVariableInputValue(
  frame: Frame,
  wrapperSelector: string,
): Promise<string> {
  // When focused, the input shows the value
  const input = frame.locator(`${wrapperSelector} [data-testid="variable-text-input"]`);
  if (await input.count() > 0) {
    return await input.first().inputValue().catch(() => '');
  }
  // When unfocused, check if it's showing a placeholder (empty value)
  const placeholder = frame.locator(`${wrapperSelector} .placeholder`);
  if (await placeholder.count() > 0) {
    return ''; // Value is empty, showing placeholder
  }
  // When unfocused with a value, the display shows VariableDisplay
  const display = frame.locator(`${wrapperSelector} [data-testid="variable-text-display"]`);
  if (await display.count() > 0) {
    const text = await display.first().textContent().catch(() => '');
    return (text || '').trim();
  }
  return '';
}

/**
 * Send a request by pressing Enter on the URL input.
 * First focuses the display to switch to input mode, then presses Enter.
 */
export async function sendRequestViaEnter(frame: Frame): Promise<void> {
  log('Sending request via Enter key...');

  // Step 1: Focus the display to switch VariableTextInput to input mode
  await frame.evaluate(() => {
    const display = document.querySelector('.url-input [data-testid="variable-text-display"]');
    if (display) {
      const rect = display.getBoundingClientRect();
      const evt = new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
      display.dispatchEvent(evt);
    }
  });
  await frame.waitForTimeout(300);

  // Step 2: Wait for the input to appear
  const input = frame.locator('.url-input [data-testid="variable-text-input"]');
  try {
    await input.first().waitFor({ state: 'visible', timeout: 3_000 });
    // Step 3: Press Enter on the input — triggers React's onKeyDown → onSend()
    await input.first().press('Enter');
    log('  Enter pressed on URL input');
  } catch {
    log('  Input not visible, trying keyboard Enter on body...');
    // Fallback: press Enter on the frame body
    await frame.locator('body').press('Enter');
    log('  Enter pressed on body');
  }
}
