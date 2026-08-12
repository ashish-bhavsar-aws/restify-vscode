import type React from 'react';

export interface HistoryEntry {
  id: string; method: string; url: string; status: number;
  duration?: number; name: string; timestamp?: string; pinned?: boolean;
}
export interface CollectionRequest { id?: string; method: string; url: string; name?: string; }
export interface CollectionGroup { id: string; name: string; requests?: CollectionRequest[]; groups?: CollectionGroup[]; }
export interface CollectionVar { key: string; value: string; }
export interface Collection {
  id: string; name: string; requests?: CollectionRequest[]; groups?: CollectionGroup[];
  variables?: CollectionVar[]; preScript?: string; testScript?: string;
}
export type SidebarType = 'history' | 'collections' | 'environments';
export interface DragState { requestId: string; fromCollectionId: string; fromGroupId: string | null; }
export interface RunEntry {
  requestId: string;
  name: string;
  method: string;
  url: string;
  status: number;
  statusText: string;
  duration: number;
  size: number;
  error?: string;
  cancelled?: boolean;
  tests?: Record<string, boolean>;
  testSummary?: { passed: number; failed: number };
}
export interface RunState {
  running: boolean;
  total: number;
  collectionId?: string;
  groupId?: string;
  entries: RunEntry[];
  cancelled?: boolean;
  error?: string;
}

export const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--tag-get)',
  POST: 'var(--tag-post)',
  PUT: 'var(--tag-put)',
  DELETE: 'var(--tag-delete)',
  PATCH: 'var(--tag-patch)',
  HEAD: 'var(--tag-head)',
  OPTIONS: 'var(--tag-options)',
};

export const METHOD_SHORT: Record<string, string> = {
  DELETE: 'DEL',
  OPTIONS: 'OPT',
  PATCH: 'PAT',
};

export const STATUS_COLORS: Record<string, string> = {
  ok: 'var(--success)',
  warn: 'var(--tag-patch)',
  err: 'var(--error)',
};

export function relativeTime(iso?: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (isNaN(diff)) return '';
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function listNavKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  const items = Array.from<HTMLElement>(e.currentTarget.querySelectorAll('[tabindex="0"]'));
  const idx = items.indexOf(document.activeElement as HTMLElement);
  if (idx === -1) { items[0]?.focus(); return; }
  e.preventDefault();
  if (e.key === 'ArrowDown') items[Math.min(idx + 1, items.length - 1)]?.focus();
  else items[Math.max(0, idx - 1)]?.focus();
}

export const vscodeApi = (window as any).acquireVsCodeApi?.();
