#!/usr/bin/env node
/**
 * F60 — Code size and maintainability guardrails.
 *
 * Enforces:
 *   1. File-size limits in `src/` (warn > 1200 lines, error > 2000 lines).
 *   2. Component boundary: `src/webview` `.tsx` files (the React UI) must never
 *      import the `vscode` API. The webview runs in a browser context, so any
 *      such import is a bug. (HTML-builder helpers in `*.ts` are excluded.)
 *   3. Shared-logic boundary: `src/core/` must stay free of `vscode` imports so
 *      the request engine stays unit-testable and host-agnostic.
 *   4. Logic placement rule (soft check): pure, framework-free logic should live
 *      in `src/core/`; large UI components should delegate to core modules
 *      rather than growing unbounded bodies inline.
 *
 * Run with: npm run guardrails
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const SRC = join(ROOT, 'src');

const WARN_LINES = 1200;
const ERROR_LINES = 2000;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === 'node_modules') continue;
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const problems = [];
let warnings = 0;
let errors = 0;

const log = (level, file, message) => {
  problems.push(`${level}: ${relative(ROOT, file)} — ${message}`);
  if (level === 'warn') warnings++;
  else errors++;
};

// 1. File-size limits
const allSrc = walk(SRC).filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
for (const file of allSrc) {
  const lines = readFileSync(file, 'utf8').split('\n').length;
  if (lines > ERROR_LINES) log('error', file, `${lines} lines (limit ${ERROR_LINES})`);
  else if (lines > WARN_LINES) log('warn', file, `${lines} lines (warn threshold ${WARN_LINES})`);
}

// 2. Webview (.tsx) must not import vscode
const tsx = allSrc.filter((f) => f.endsWith('.tsx') && f.includes(join('src', 'webview')));
for (const file of tsx) {
  const content = readFileSync(file, 'utf8');
  if (/(from\s+['"]vscode['"]|require\(['"]vscode['"]\))/.test(content)) {
    log('error', file, 'webview component must not import the vscode API');
  }
}

// 3. src/core must stay free of vscode imports
const coreFiles = allSrc.filter((f) => f.includes(join('src', 'core')));
for (const file of coreFiles) {
  const content = readFileSync(file, 'utf8');
  if (/(from\s+['"]vscode['"]|require\(['"]vscode['"]\))/.test(content)) {
    log('error', file, 'src/core modules must not import the vscode API');
  }
}

if (problems.length > 0) {
  console.log('Guardrails report:\n');
  for (const p of problems) console.log(`  ${p}`);
  console.log(`\n${warnings} warning(s), ${errors} error(s).`);
} else {
  console.log('Guardrails OK — no file-size or boundary violations.');
}

process.exit(errors > 0 ? 1 : 0);
