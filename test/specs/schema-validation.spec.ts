import { test, expect } from '@playwright/test';
import {
  launchVSCode,
  closeVSCode,
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
  setUrl,
  sendRequest,
  waitForResponse,
  clickRequestTab,
  clickResponseTab,
} from '../utils/helpers';
import type { Frame } from '@playwright/test';

let app: VSCodeApp;
let mainFrame: Frame | null = null;

const VALID_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "ok": { "type": "boolean" },
    "name": { "type": "string" },
    "count": { "type": "integer" }
  },
  "required": ["ok", "name", "count"]
}`;

const INVALID_SCHEMA = `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "ok": { "type": "string" },
    "missing": { "type": "string" }
  },
  "required": ["ok", "missing"]
}`;

async function fillSchema(frame: Frame, schema: string): Promise<void> {
  await clickRequestTab(frame, 'schema');
  await frame.waitForTimeout(300);
  const textarea = frame.locator('[data-testid="schema-editor-textarea"]');
  const found = (await textarea.count()) > 0;
  if (found) {
    await textarea.click();
    await frame.waitForTimeout(100);
    await textarea.press('Meta+A');
    await frame.waitForTimeout(50);
    await textarea.fill(schema);
    await frame.waitForTimeout(200);
    log('  [fillSchema] Schema filled');
  } else {
    log('  [fillSchema] WARNING: No schema textarea found');
  }
}

async function setValidateSchemaToggle(frame: Frame, on: boolean): Promise<void> {
  const input = frame.locator('[data-testid="validate-schema-toggle"] input');
  const current = await input.isChecked().catch(() => false);
  if (current !== on) {
    await clickInFrame(frame, '[data-testid="validate-schema-toggle"] input');
    await frame.waitForTimeout(200);
  }
}

test.describe('F22 — JSON Schema response validation', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    resetLog();
    log('=== [SchemaValidation] beforeAll ===');
    await startMockServer();
    app = await launchVSCode();
    await injectCursorOverlay(app.window);
    mainFrame = await setupMainPanel(app);
    log('=== [SchemaValidation] setup complete ===');
  });

  test.afterAll(async () => {
    log('=== [SchemaValidation] afterAll ===');
    await closeVSCode(app);
  });

  test('reports a response as valid when it matches the schema', async () => {
    log('--- schema-validation: valid case ---');
    const frame = mainFrame!;

    await setUrl(frame, mockUrl('/api/schema-validation'));
    await fillSchema(frame, VALID_SCHEMA);
    await setValidateSchemaToggle(frame, true);

    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20_000);
    logCheck('got response', gotResponse);
    expect(gotResponse).toBe(true);

    await clickResponseTab(frame, 'schema');
    const summary = frame.locator('#res-pane');
    const text = await summary.textContent();
    logCheck('schema tab shows valid summary', text?.includes('Response matches the JSON Schema') ?? false);
    expect(text).toContain('Response matches the JSON Schema');
  });

  test('reports a response as invalid when it violates the schema', async () => {
    log('--- schema-validation: invalid case ---');
    const frame = mainFrame!;

    await fillSchema(frame, INVALID_SCHEMA);
    await setValidateSchemaToggle(frame, true);

    await sendRequest(frame);
    const gotResponse = await waitForResponse(frame, 20_000);
    logCheck('got response', gotResponse);
    expect(gotResponse).toBe(true);

    await clickResponseTab(frame, 'schema');
    const summary = frame.locator('#res-pane');
    const text = await summary.textContent();
    logCheck('schema tab shows error summary', text?.includes('Response does not match the JSON Schema') ?? false);
    expect(text).toContain('Response does not match the JSON Schema');
  });
});
