import { _electron as electron, type ElectronApplication, type Page, type Frame } from '@playwright/test';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import * as path from 'path';
import * as fs from 'fs';
import { DailyFileAppender } from './daily-appender';

const EXTENSION_PATH = path.resolve(__dirname, '..', '..');
const TEST_USER_DATA = path.resolve(__dirname, '..', '.vscode-test-user-data');
const SCREENSHOT_DIR = path.resolve(__dirname, '..', 'screenshots');
const VIDEO_DIR = path.resolve(__dirname, '..', 'videos');
// Isolated extensions dir so the user's installed extensions (which may remap
// keybindings like Cmd+Shift+P) never leak into the test instance.
const EXTENSIONS_DIR = path.resolve(__dirname, '..', '.vscode-test-extensions');

// Path the extension reads to stub native open/save dialogs in e2e tests.
// Each test writes {"open": <abs path>} or {"save": <abs path>} to this file
// before the click that would open a dialog; the extension consumes it.
export const DIALOG_STUB_FILE = path.resolve(__dirname, '..', 'dialog-stub.json');

// ─── Debug Logger ───────────────────────────────────────────────────

let _step = 0;

/** Singleton daily appender — writes to test/logs/YYYY-MM-DD.log */
const _daily = new DailyFileAppender();

function _writeToFile(line: string): void {
  _daily.write(line);
}

export function log(msg: string): void {
  _step++;
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] [step ${String(_step).padStart(3, '0')}] ${msg}`;
  console.log(`  ${line}`); // eslint-disable-line no-console
  _writeToFile(line);
}

export function logCheck(msg: string, result: boolean | string | number): void {
  _step++;
  const ts = new Date().toISOString().slice(11, 23);
  const icon = result === false || result === 0 ? '✗' : '✓';
  const line = `[${ts}] [step ${String(_step).padStart(3, '0')}] ${icon} CHECK: ${msg} → ${JSON.stringify(result)}`;
  console.log(`  ${line}`); // eslint-disable-line no-console
  _writeToFile(line);
}

export function logError(msg: string, err?: unknown): void {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}] ✗ ERROR: ${msg}${err ? ' ' + String(err) : ''}`;
  console.error(`  ${line}`); // eslint-disable-line no-console
  _writeToFile(line);
}

export function resetLog(): void {
  _step = 0;
  _daily.writeBanner('Test run');
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

  const webviewTags = await page.locator('webview').count().catch(() => 0);
  log(`  DOM webview tags: ${webviewTags}`);
  for (let i = 0; i < webviewFrames.length; i++) {
    const f = webviewFrames[i];
    const hasUrlBar = await f.locator('[data-testid="url-input"], .url-input').count().catch(() => 0);
    const hasSendBtn = await f.locator('[data-testid="send-btn"]').count().catch(() => 0);
    const bodyText = await f.evaluate(() => document.body?.innerText?.slice(0, 120) || '', () => '').catch(() => '<err>');
    log(`  webview[${i}]: urlBar=${hasUrlBar} sendBtn=${hasSendBtn} body="${bodyText.replace(/\n/g, ' ').trim()}"`);
  }

  if (webviewTags > 0) {
    for (let i = 0; i < webviewTags; i++) {
      const src = await page.locator('webview').nth(i).getAttribute('src').catch(() => '<err>');
      log(`  webviewTag[${i}]: src="${src?.slice(0, 120)}"`);
    }
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

  if (!fs.existsSync(path.join(EXTENSION_PATH, 'dist', 'extension.js'))) {
    const msg = 'dist/extension.js is missing — build the extension first with: npm run compile';
    logError(msg);
    throw new Error(msg);
  }

  if (fs.existsSync(TEST_USER_DATA)) {
    log('  Cleaning previous user-data dir...');
    fs.rmSync(TEST_USER_DATA, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_USER_DATA, { recursive: true });
  fs.mkdirSync(EXTENSIONS_DIR, { recursive: true });

  // Write settings.json for dark theme + maximize
  const settingsDir = path.join(TEST_USER_DATA, 'User');
  fs.mkdirSync(settingsDir, { recursive: true });
  fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
    'workbench.colorTheme': 'Default Dark Modern',
    'window.newWindowDimensions': 'maximized',
    'workbench.startupEditor': 'none',
    'workbench.welcome.enabled': false,
    'workbench.welcome.walkthroughs.skipBackgroundTheme': true,
    'update.showReleaseNotes': false,
    'workbench.tips.enabled': false,
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
      `--extensions-dir=${EXTENSIONS_DIR}`,
      '--disable-extension=vscode.git',
      '--disable-extension=vscode.github.gitUsage',
      '--disable-extension=vscode.welcomePage',
      '--disable-extension=github.copilot',
      '--disable-extension=github.copilot-chat',
      '--disable-extension=github.vscode-pull-request-github',
      '--disable-extension=ms-vscode.vscode-github-prerelease',
      '--disable-extension=ms-python.python',
      '--disable-extension=ms-vscode.copilot',
    ],
    env: {
      ...process.env,
      RESTIFY_TEST_EXPORT_PATH: path.join(SCREENSHOT_DIR, 'export-test.json'),
      RESTIFY_TEST_STUB_FILE: DIALOG_STUB_FILE,
      RESTIFY_TEST_OPEN_URL: 'fetch',
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

  // Snapshot current video files before close
  const videosBefore = new Set(
    fs.existsSync(VIDEO_DIR)
      ? fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'))
      : [],
  );

  // Close Electron — Playwright finalizes the video file after this
  try { await app.electronApp.close(); } catch { /* already closed */ }

  // Helper: wait without using the (now-closed) page
  const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

  // Wait for Playwright to write the new video file (up to 10s)
  const dest = path.join(VIDEO_DIR, 'restify-demo.webm');
  fs.mkdirSync(VIDEO_DIR, { recursive: true });
  let saved = false;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    const all = fs.readdirSync(VIDEO_DIR).filter(f => f.endsWith('.webm'));
    const newFile = all.find(f => !videosBefore.has(f));
    if (newFile) {
      const src = path.join(VIDEO_DIR, newFile);
      // Wait until file size stabilizes (Playwright is done writing)
      let prevSize = -1;
      for (let j = 0; j < 10; j++) {
        const curSize = fs.statSync(src).size;
        if (curSize === prevSize && curSize > 0) break;
        prevSize = curSize;
        await sleep(500);
      }
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
      log(`Video saved: ${dest}`);
      saved = true;
      break;
    }
  }
  if (!saved) log('No video file captured');

  // Clean up any leftover random-named .webm files
  try {
    if (fs.existsSync(VIDEO_DIR)) {
      for (const f of fs.readdirSync(VIDEO_DIR)) {
        if (f.endsWith('.webm') && f !== 'restify-demo.webm') {
          fs.unlinkSync(path.join(VIDEO_DIR, f));
          log(`  Cleaned up leftover video: ${f}`);
        }
      }
    }
  } catch { /* ignore */ }

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

// ─── Cursor overlay (DOM-based red dot for video capture) ─────────────
// Playwright video capture records DOM pixels, NOT the OS cursor.
// We must render the pointer as a DOM element to appear in the recording.

function injectCursorOverlayJS(): void {
  const w = window as any;
  if (w.__restifyDotInjected) {
    const dot = document.getElementById('restify-dot');
    if (dot) return;
  }
  w.__restifyDotInjected = true;

  const head = document.head || document.documentElement;

  const style = document.createElement('style');
  style.id = 'restify-dot-style';
  style.textContent = `
    *, *::before, *::after { cursor: none !important; }
    #restify-dot {
      position: fixed;
      width: 8px; height: 8px;
      margin-left: -4px; margin-top: -4px;
      top: -100px; left: -100px;
      background: radial-gradient(circle, #ff3b3b 40%, rgba(255,59,59,0.4) 70%, transparent 100%);
      border: 1.5px solid #fff;
      border-radius: 50%;
      box-shadow: 0 0 4px 1px rgba(255,59,59,0.5);
      pointer-events: none;
      z-index: 2147483647;
      will-change: top, left;
    }
    #restify-ring {
      position: fixed;
      width: 24px; height: 24px;
      margin-left: -12px; margin-top: -12px;
      top: -200px; left: -200px;
      border: 2px solid rgba(255,59,59,0.85);
      border-radius: 50%;
      pointer-events: none;
      z-index: 2147483647;
      opacity: 0;
    }
    #restify-ring.flash {
      animation: restify-ring-pop 400ms ease-out forwards;
    }
    @keyframes restify-ring-pop {
      0%   { transform: scale(0.4); opacity: 1; }
      100% { transform: scale(2.2); opacity: 0; }
    }
  `;
  head.appendChild(style);

  const dot = document.createElement('div');
  dot.id = 'restify-dot';
  document.body.appendChild(dot);

  const ring = document.createElement('div');
  ring.id = 'restify-ring';
  document.body.appendChild(ring);
}

/**
 * Position the red dot at (x, y) in the main frame.
 * This is called directly from Node.js after each page.mouse.move(),
 * bypassing DOM event listeners entirely.
 */
async function positionDot(page: Page, x: number, y: number): Promise<void> {
  const result = await page.evaluate(({ x, y }) => {
    const dot = document.getElementById('restify-dot');
    if (dot) {
      dot.style.left = x + 'px';
      dot.style.top = y + 'px';
      const rect = dot.getBoundingClientRect();
      return { ok: true, left: dot.style.left, top: dot.style.top, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
    }
    return { ok: false };
  }, { x, y }).catch((e) => ({ ok: false, error: String(e) }));
  log(`  positionDot: (${Math.round(x)},${Math.round(y)}) → ${JSON.stringify(result)}`);
}

/**
 * Flash the click ring at (x, y) in the main frame.
 */
async function flashRing(page: Page, x: number, y: number): Promise<void> {
  await page.evaluate(({ x, y }) => {
    const ring = document.getElementById('restify-ring');
    if (ring) {
      ring.style.left = x + 'px';
      ring.style.top = y + 'px';
      ring.classList.remove('flash');
      void (ring as HTMLElement).offsetWidth;
      ring.classList.add('flash');
    }
  }, { x, y }).catch(() => {});
}

export async function injectCursorOverlay(page: Page): Promise<void> {
  // VS Code Electron uses a workbench.html as the main frame.
  // The actual UI is rendered inside that frame. We need to inject our
  // red dot there and ensure it survives VS Code's DOM mutations.

  const injectIntoFrame = async (label: string) => {
    const mainFrame = page.mainFrame();
    try {
      const result = await mainFrame.evaluate(() => {
        const dot = document.getElementById('restify-dot');
        const style = document.getElementById('restify-dot-style');
        return {
          hasDot: !!dot,
          hasStyle: !!style,
          bodyExists: !!document.body,
          bodyChildren: document.body?.children?.length ?? 0,
          url: window.location?.href?.slice(0, 60) ?? 'unknown',
        };
      });
      log(`  [${label}] Frame state: dot=${result.hasDot} style=${result.hasStyle} body=${result.bodyExists} children=${result.bodyChildren} url=${result.url}`);

      if (!result.hasDot || !result.hasStyle) {
        await mainFrame.evaluate(injectCursorOverlayJS);
        const after = await mainFrame.evaluate(() => ({
          hasDot: !!document.getElementById('restify-dot'),
          hasStyle: !!document.getElementById('restify-dot-style'),
          dotRect: document.getElementById('restify-dot')?.getBoundingClientRect(),
        }));
        log(`  [${label}] After injection: dot=${after.hasDot} style=${after.hasStyle} dotRect=${JSON.stringify(after.dotRect)}`);
      }
    } catch (e) {
      log(`  [${label}] Injection failed: ${e}`);
    }
  };

  // Inject via addInitScript for future navigations
  await page.addInitScript(injectCursorOverlayJS);

  // Inject now
  await injectIntoFrame('initial');

  // Re-inject periodically (VS Code can reload the main frame)
  const interval = setInterval(() => injectIntoFrame('periodic'), 2000);
  setTimeout(() => clearInterval(interval), 600_000);

  log('Cursor overlay injected (DOM red dot on main frame)');
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
    if (page.isClosed()) {
      logError('Page is closed, aborting frame search');
      return null;
    }

    const result = await findSendButtonNewest(page);
    if (result) return result;

    // Also search ALL frames (not just vscode-webview://) for Send button
    try {
      const allFrames = [...page.frames()].reverse();
      for (const frame of allFrames) {
        const hasSend = await frame.locator('[data-testid="send-btn"]').count().catch(() => 0);
        if (hasSend > 0) {
          log(`  ✓ Found Send button in non-webview frame: ${frame.url().slice(0, 60)}`);
          return frame;
        }
      }
    } catch { /* continue */ }

    // Try clicking the Restify/New Request tab to trigger frame creation
    try {
      const restifyTab = page.locator('.tab').filter({ hasText: /Restify|New Request/i });
      if (await restifyTab.count() > 0) {
        log('  Found Restify/New Request tab, clicking to focus...');
        await restifyTab.first().click();
      }
    } catch {
      // Transient error — continue retrying
    }

    // Diagnostic: log all frames for debugging
    try {
      const allFrameUrls = page.frames().map(f => f.url().slice(0, 80));
      log(`  [diag] Total frames: ${allFrameUrls.length}, webview frames: ${allFrameUrls.filter(u => u.includes('vscode-webview://')).length}`);
      const iframeCount = await page.locator('iframe').count().catch(() => 0);
      log(`  [diag] DOM iframes: ${iframeCount}`);
    } catch { /* continue */ }

    await page.waitForTimeout(2000);
  }

  logError(`No main panel frame found after ${timeoutMs}ms!`);
  return null;
}

async function findSendButtonInTree(frame: Frame, depth = 0): Promise<Frame | null> {
  const prefix = '  '.repeat(depth + 1);
  const selector = '[data-testid="send-btn"], button:has-text("Send")';

  // Check this frame for Send button
  const hasSend = await frame.locator(selector).count().catch(() => 0);
  if (hasSend > 0) {
    log(`${prefix}✓ Found frame with Send button: ${frame.url().slice(0, 60)}`);
    return frame;
  }

  // Recursively search nested child frames
  for (const child of frame.childFrames()) {
    const result = await findSendButtonInTree(child, depth + 1);
    if (result) return result;
  }

  return null;
}

async function findWsSelectorInTree(frame: Frame, depth = 0): Promise<Frame | null> {
  const prefix = '  '.repeat(depth + 1);
  const selector = '[data-testid="ws-url-input"]';

  const has = await frame.locator(selector).count().catch(() => 0);
  if (has > 0) {
    log(`${prefix}✓ Found WebSocket panel frame: ${frame.url().slice(0, 60)}`);
    return frame;
  }

  for (const child of frame.childFrames()) {
    const result = await findWsSelectorInTree(child, depth + 1);
    if (result) return result;
  }
  return null;
}

/** Find the WebSocket client panel webview frame (newest-first). */
export async function findWebSocketPanelFrame(
  page: Page,
  timeoutMs = 30_000,
): Promise<Frame | null> {
  log(`Searching for WebSocket panel frame (timeout=${timeoutMs}ms)...`);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      logError('Page is closed, aborting WebSocket frame search');
      return null;
    }

    const allFrames = [...page.frames()].reverse();
    for (const frame of allFrames) {
      if (!frame.url().includes('vscode-webview://')) continue;
      const result = await findWsSelectorInTree(frame);
      if (result) return result;
    }
    log('  No WebSocket panel frame yet, retrying in 1s...');
    await page.waitForTimeout(1000);
  }

  logError(`No WebSocket panel frame appeared after ${timeoutMs}ms`);
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

export async function findCollectionsFrame(page: Page, timeoutMs = 20_000): Promise<Frame | null> {
  log(`Searching for collections sidebar frame (timeout=${timeoutMs}ms)...`);
  // The collections webview view is only materialized when its sidebar header
  // is expanded. Expand it first so the frame reliably exists.
  const sidebar = page.locator('.part.sidebar').first();
  const collHeader = sidebar
    .getByRole('button', { name: /Collections/i })
    .or(sidebar.locator('[class*="pane-header"], .view-header').filter({ hasText: /Collections/i }))
    .first();
  if (await collHeader.count().catch(() => 0) > 0) {
    const expanded = await collHeader.getAttribute('aria-expanded').catch(() => null);
    if (expanded !== 'true') {
      await collHeader.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
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

    await page.waitForTimeout(500);
  }

  logError('No collections sidebar frame found');
  return null;
}

/** Find the history sidebar webview frame (identified by its "Filter history..." input). */
export async function findHistoryFrame(page: Page, timeoutMs = 20_000): Promise<Frame | null> {
  log(`Searching for history sidebar frame (timeout=${timeoutMs}ms)...`);
  // The history webview view is only materialized when its sidebar header is
  // expanded. Expand it first so a fresh VS Code session reliably has the frame.
  const sidebar = page.locator('.part.sidebar').first();
  const historyHeader = sidebar
    .getByRole('button', { name: /History/i })
    .or(sidebar.locator('[class*="pane-header"], .view-header').filter({ hasText: /History/i }))
    .first();
  if (await historyHeader.count().catch(() => 0) > 0) {
    const expanded = await historyHeader.getAttribute('aria-expanded').catch(() => null);
    if (expanded !== 'true') {
      await historyHeader.click({ force: true }).catch(() => {});
      await page.waitForTimeout(1000);
    }
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (page.isClosed()) {
      logError('Page is closed, aborting history frame search');
      return null;
    }

    const allFrames = page.frames().filter(f => f.url().includes('vscode-webview://'));

    for (const frame of allFrames) {
      const hasFilter = await frame.locator('input[placeholder="Filter history..."]').count().catch(() => 0);
      if (hasFilter > 0) {
        log(`  ✓ Found history frame: ${frame.url().slice(0, 60)}`);
        return frame;
      }
    }

    // Fallback: frame with pin buttons and no collection expand controls
    for (const frame of allFrames) {
      const hasPin = await frame.locator('[data-testid="history-pin"]').count().catch(() => 0);
      const hasExpand = await frame.locator('button[title*="Expand"]').count().catch(() => 0);
      if (hasPin > 0 && hasExpand === 0) {
        log(`  Fallback: found history frame via pin buttons: ${frame.url().slice(0, 60)}`);
        return frame;
      }
    }

    await page.waitForTimeout(500);
  }

  logError('No history sidebar frame found');
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
  // Check if the sidebar is actually visible (has height > 0)
  const box = await sidebar.boundingBox().catch(() => null);
  const visible = box !== null && box.height > 50;
  logCheck('Sidebar visible', visible);
  if (box) log(`  Sidebar box: ${JSON.stringify(box)}`);
  // Also check if the Restify activity bar icon is toggled/active
  const icon = page.locator('.part.activitybar .action-label[aria-label*="Restify"]');
  const iconActive = (await icon.getAttribute('aria-checked').catch(() => 'false')) === 'true';
  logCheck('Restify icon active', iconActive);
  return visible || iconActive;
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

  // Select via keyboard instead of mouse. A synthetic click's mouseup/click can
  // land outside the widget that the picker immediately opens (e.g. the
  // showInputBox for the import source prompt) and VS Code treats it as a
  // click-outside, cancelling the prompt before the test can type into it.
  const targetIndex = await entries
    .evaluateAll((els, lbl) => els.findIndex((e) => (e.textContent || '').includes(lbl)), label)
    .catch(() => -1);
  await page
    .evaluate(() => {
      const inp = document.querySelector<HTMLInputElement>('.quick-input-widget input, .quick-input-box input');
      inp?.focus();
    })
    .catch(() => {});
  await page.waitForTimeout(200);
  for (let i = 0; i < Math.max(targetIndex, 0); i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  log(`  Quick pick item selected via keyboard (index ${targetIndex})`);
  await page.waitForTimeout(400);
}

export async function typeInQuickInput(page: Page, text: string): Promise<void> {
  log(`Typing in quick input: "${text}"...`);

  // After a quick pick closes and showInputBox opens, VS Code reuses the same
  // widget container — a stale (hidden) widget from the quick pick can remain
  // in the DOM alongside the new prompt. Always target the *visible* widget's
  // input so we never type into a closing/stale one.
  const input = page.locator('.quick-input-widget:visible input, .quick-input-box:visible input');

  // Wait for the visible input to appear. This ensures the showInputBox prompt
  // (or the quick-pick filter) has rendered and is actionable.
  let inputVisible = false;
  try {
    await input.first().waitFor({ state: 'visible', timeout: 4_000 });
    log('  Input visible');
    inputVisible = true;
  } catch {
    log('  Input not visible within timeout');
  }

  if (!inputVisible) {
    // VS Code can leave a freshly-opened showInputBox display:none (a race with
    // the quick-pick that was closing when the prompt opened). Detect a hidden
    // prompt widget — an input box whose widget has NO quick-pick list — and
    // force-show it so we can type into it.
    const forced = await page
      .evaluate(() => {
        const widgets = Array.from(document.querySelectorAll<HTMLElement>('.quick-input-widget'));
        const prompt = widgets.find((w) => w.querySelector('input') && !w.querySelector('.quick-input-list'));
        if (!prompt) return false;
        prompt.style.removeProperty('display');
        prompt.classList.remove('hidden');
        const inp = prompt.querySelector('input') as HTMLInputElement | null;
        if (inp) inp.focus();
        return true;
      })
      .catch(() => false);
    if (forced) {
      log('  Force-shown hidden prompt widget');
      await page.waitForTimeout(300);
    }
  }

  // Strategy 1: focus the input, select all, then type via keyboard. VS Code's
  // quick input only reacts to real key events, so this is the most reliable.
  try {
    await input.first().click({ force: true, timeout: 3_000 });
  } catch {
    try {
      await input.first().evaluate((el) => (el as HTMLElement).focus());
    } catch { /* focus is best-effort */ }
  }
  await page.waitForTimeout(100);

  let value = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.keyboard.press('Meta+a');
    await page.waitForTimeout(50);
    await page.keyboard.type(text, { delay: 10 });
    await page.waitForTimeout(300);
    value = await input.first().inputValue({ timeout: 3_000 }).catch(() => '');
    if (value === text) break;
    log(`  Keyboard attempt ${attempt + 1} mismatch ("${value.slice(0, 40)}"), retrying...`);
  }

  if (value === text) {
    log('  Input filled via keyboard');
    return;
  }
  log('  Keyboard typing failed, trying native setter on the visible widget...');

  // Strategy 2: use evaluate to directly set the input value + dispatch events,
  // targeting the *visible* widget so we never hit a closing/stale one.
  try {
    const set = await page.evaluate((t) => {
      const widgets = Array.from(document.querySelectorAll<HTMLElement>('.quick-input-widget'));
      const visible = widgets.find((w) => w.offsetParent !== null);
      const inp = (visible?.querySelector('input') ||
        document.querySelector('.quick-input-widget input, .quick-input-box input')) as HTMLInputElement | null;
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
      log('  Input value set via native setter');
      await page.waitForTimeout(200);
      return;
    }
  } catch (e) {
    log(`  Native setter failed: ${e}`);
  }

  // Strategy 3: try Playwright fill
  const count = await input.count();
  logCheck('Quick input field found', count);
  if (count > 0) {
    try {
      await input.first().fill(text, { timeout: 3_000 });
      log('  Input filled via fill()');
      await page.waitForTimeout(200);
      return;
    } catch {
      log('  fill() failed');
    }
  }

  // Strategy 4: blind keyboard typing (last resort)
  await page.keyboard.type(text, { delay: 20 });
  log('  Text filled via keyboard (last resort)');
  await page.waitForTimeout(200);
}

/** Opens the Command Palette and runs a command by its title (e.g. "Restify: Send Request"). */
export async function runCommand(page: Page, title: string): Promise<void> {
  log(`Running command palette: "${title}"`);
  const anyQuickInputVisible = () =>
    page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>('.quick-input-widget')).some((w) => w.offsetParent !== null),
    );
  let visible = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // Move keyboard focus to neutral VS Code chrome (far-right titlebar area)
    // first — some workbench elements (e.g. the agents/status bar) swallow
    // Meta+P, and the macOS menu bar occupies the left side of the titlebar.
    const width = await page.evaluate(() => window.innerWidth).catch(() => 1200);
    await page
      .locator('.titlebar, .part.titlebar')
      .first()
      .click({ force: true, position: { x: Math.max(width - 120, 200), y: 10 } })
      .catch(() => {});
    await page.waitForTimeout(300);
    // Use Quick Open (Ctrl/Cmd+P) + the ">" prefix, which reliably reaches the
    // command palette regardless of keybinding hijacks on F1/Ctrl+Shift+P.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P');
    await page.waitForTimeout(700);
    visible = await anyQuickInputVisible().catch(() => false);
    if (visible) break;
    log(`  quick-input not visible (attempt ${attempt}), retrying...`);
  }
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll<HTMLElement>('.quick-input-widget')).some((w) => w.offsetParent !== null),
    { timeout: 10_000 },
  );
  await typeInQuickInput(page, `>${title}`);
  await page.waitForTimeout(700);

  const entries = page.locator('.quick-input-list-entry');
  const entryCount = await entries.count();
  log(`  Quick-input entries after typing: ${entryCount}`);
  for (let i = 0; i < Math.min(entryCount, 5); i++) {
    const t = await entries.nth(i).textContent().catch(() => '');
    log(`    entry[${i}]: "${(t || '').trim().slice(0, 60)}"`);
  }
  const item = entries.filter({ hasText: title }).first();
  const matchCount = await item.count();
  logCheck(`Command "${title}" found in palette`, matchCount);
  if (matchCount === 0) {
    logError(`Command "${title}" not found in palette`);
    return;
  }
  await item.click();
  await page.waitForTimeout(800);
  log(`  Command "${title}" executed`);
}

export async function confirmQuickInput(page: Page): Promise<void> {
  log('Confirming quick input (Enter)...');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  log('  Quick input confirmed');
}

export async function waitForPromptInput(page: Page, timeoutMs = 15_000): Promise<void> {
  // After running a palette command that opens a follow-up input prompt
  // (e.g. "Paste cURL"), the command palette widget is still closing while the
  // prompt widget appears. Wait until exactly one quick-input widget is visible
  // so locators like `.first()` target the prompt and not the closing palette.
  await page.waitForFunction(() => {
    const widgets = Array.from(document.querySelectorAll<HTMLElement>('.quick-input-widget'));
    const visible = widgets.filter((w) => w.offsetParent !== null);
    return visible.length === 1;
  }, { timeout: timeoutMs });
  log('  Single quick-input widget confirmed');
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

/**
 * Move the visible cursor to the center of an element.
 * Uses locator.boundingBox() which returns page-level coordinates,
 * so page.mouse.move() lands exactly on the element.
 */
export async function moveMouseToElement(
  page: Page,
  frame: Frame,
  selector: string,
  opts?: { index?: number; steps?: number },
): Promise<boolean> {
  const index = opts?.index ?? 0;
  const el = frame.locator(selector).nth(index);
  const box = await el.boundingBox({ timeout: 3_000 }).catch(() => null);
  if (!box) {
    log(`  moveMouseToElement: no boundingBox for "${selector}"`);
    return false;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  log(`  moveMouseToElement: "${selector}" box=(${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}x${Math.round(box.height)}) → moving to (${Math.round(x)},${Math.round(y)})`);
  await page.mouse.move(x, y, { steps: opts?.steps ?? 10 });
  await positionDot(page, x, y);
  await page.waitForTimeout(120);
  return true;
}

/** Convenience: move cursor to a locator, then return its bounding box center. */
export async function moveMouseToLocator(
  page: Page,
  locator: import('@playwright/test').Locator,
): Promise<{ x: number; y: number } | null> {
  const box = await locator.boundingBox({ timeout: 3_000 }).catch(() => null);
  if (!box) {
    log(`  moveMouseToLocator: no boundingBox`);
    return null;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  log(`  moveMouseToLocator: box=(${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)}x${Math.round(box.height)}) → moving to (${Math.round(x)},${Math.round(y)})`);
  await page.mouse.move(x, y, { steps: 10 });
  await positionDot(page, x, y);
  await page.waitForTimeout(120);
  return { x, y };
}

/**
 * Move the cursor to a locator's center, then click it.
 * Use this instead of locator.click() for visible cursor movement in videos.
 */
export async function clickWithCursor(
  locator: import('@playwright/test').Locator,
  opts?: { force?: boolean; position?: { x: number; y: number }; timeout?: number },
): Promise<void> {
  try {
    const page = locator.page();
    const box = await locator.boundingBox({ timeout: opts?.timeout ?? 3_000 }).catch(() => null);
    if (box) {
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      log(`  clickWithCursor: moving to (${Math.round(x)},${Math.round(y)})`);
      await page.mouse.move(x, y, { steps: 10 });
      await positionDot(page, x, y);
      await flashRing(page, x, y);
      await page.waitForTimeout(100);
    } else {
      log(`  clickWithCursor: no boundingBox, clicking directly`);
    }
  } catch (e) {
    log(`  clickWithCursor: mouse move failed (${e}), clicking directly`);
  }
  await locator.click({ force: opts?.force, position: opts?.position, timeout: opts?.timeout });
}

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
  try {
    const page = frame.page();
    const moved = await moveMouseToLocator(page, btn.first());
    if (moved) {
      log(`  Cursor moved to button "${text}"`);
      // Flash ring at the button position
      const box = await btn.first().boundingBox({ timeout: 1_000 }).catch(() => null);
      if (box) await flashRing(page, box.x + box.width / 2, box.y + box.height / 2);
    }
  } catch (e) {
    log(`  Cursor move skipped for button "${text}" (${e})`);
  }
  await btn.first().click({ force: true });
  log(`  Button "${text}" clicked`);
  await frame.waitForTimeout(300);
}

export async function clickClass(frame: Frame, className: string): Promise<void> {
  log(`Clicking .${className} in frame...`);
  const el = frame.locator(`.${className}`);
  const count = await el.count();
  logCheck(`.${className} found`, count);
  const page = frame.page();
  const moved = await moveMouseToLocator(page, el.first());
  if (moved) log(`  Cursor moved to .${className}`);
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

export async function clickInFrame(
  frame: Frame,
  selector: string,
  _opts?: { force?: boolean },
): Promise<void> {
  log(`Clicking "${selector}" in frame (webview-safe)...`);
  const el = frame.locator(selector);
  const count = await el.count();
  logCheck(`"${selector}" found`, count);
  if (count === 0) return;

  // Move the visible cursor to the element first
  try {
    const page = frame.page();
    const moved = await moveMouseToLocator(page, el.first());
    if (moved) {
      log(`  Cursor moved to "${selector}"`);
      const box = await el.first().boundingBox({ timeout: 1_000 }).catch(() => null);
      if (box) await flashRing(page, box.x + box.width / 2, box.y + box.height / 2);
    }
  } catch (e) {
    log(`  Cursor move skipped for "${selector}" (${e})`);
  }

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

  const input = frame.locator(`${wrapperSelector} [data-testid="variable-text-input"]`);

  // The display div uses onMouseUp (not onClick) to switch to an <input>. The
  // webview re-renders in response to state updates (e.g. right after a request
  // loads), which can unmount the focused input mid-sequence — retry the whole
  // reveal + fill so we never depend on a single render being stable.
  const reveal = async () => {
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
    await frame.waitForTimeout(250);
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    await reveal();
    try {
      await input.first().waitFor({ state: 'visible', timeout: 3_000 });
      await input.first().press('Meta+a', { timeout: 3_000 });
      await input.first().fill(value, { timeout: 3_000 });
      const actual = await input.first().inputValue().catch(() => '');
      if (actual === value) {
        log('  VariableTextInput filled');
        return;
      }
      log(`  Attempt ${attempt}: value mismatch (got "${actual.slice(0, 30)}"), retrying...`);
    } catch (err) {
      const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
      log(`  Attempt ${attempt} failed (${msg}), retrying...`);
    }
  }

  // Last resort: try to click the display (covers a non-standard focus state).
  await frame.evaluate((sel) => {
    const display = document.querySelector(`${sel} [data-testid="variable-text-display"]`);
    if (display) (display as HTMLElement).click();
  }, wrapperSelector);
  await frame.waitForTimeout(300);
  try {
    await input.first().waitFor({ state: 'visible', timeout: 3_000 });
    await input.first().fill(value, { timeout: 3_000 });
    log('  VariableTextInput filled (fallback)');
    return;
  } catch (err) {
    logError(`Failed to fill VariableTextInput "${wrapperSelector}"`, err);
    throw err;
  }
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

  // Check if input is already visible (after fillVariableInput)
  const input = frame.locator('.url-input [data-testid="variable-text-input"]');
  if (await input.first().isVisible().catch(() => false)) {
    await input.first().press('Enter');
    log('  Enter pressed on URL input (already visible)');
    return;
  }

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
