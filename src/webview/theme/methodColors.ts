export const METHOD_COLORS_LIGHT: Record<string, string> = {
  GET: '#1a7f37',
  POST: '#cf222e',
  PUT: '#0550ae',
  DELETE: '#cf222e',
  PATCH: '#953800',
  HEAD: '#8250df',
  OPTIONS: '#0d7a6b',
};

export const METHOD_COLORS_DARK: Record<string, string> = {
  GET: '#7ee787',
  POST: '#ffa198',
  PUT: '#79c0ff',
  DELETE: '#ffa198',
  PATCH: '#e3b341',
  HEAD: '#d2a8ff',
  OPTIONS: '#7ee787',
};

export const METHOD_COLORS_HC: Record<string, string> = {
  GET: '#7ee787',
  POST: '#ffa198',
  PUT: '#79c0ff',
  DELETE: '#ffa198',
  PATCH: '#e3b341',
  HEAD: '#d2a8ff',
  OPTIONS: '#7ee787',
};

export const TAG_COLORS_LIGHT: Record<string, string> = {
  GET: '#1a7f37',
  POST: '#cf222e',
  PUT: '#0550ae',
  DELETE: '#cf222e',
  PATCH: '#953800',
  HEAD: '#8250df',
};

export const TAG_COLORS_DARK: Record<string, string> = {
  GET: '#7ee787',
  POST: '#ffa198',
  PUT: '#79c0ff',
  DELETE: '#ffa198',
  PATCH: '#e3b341',
  HEAD: '#d2a8ff',
};

export const TAG_COLORS_HC: Record<string, string> = {
  GET: '#7ee787',
  POST: '#ffa198',
  PUT: '#79c0ff',
  DELETE: '#ffa198',
  PATCH: '#e3b341',
  HEAD: '#d2a8ff',
};

function isHighContrast(): boolean {
  return document.body.classList.contains('vscode-high-contrast');
}

function isDark(): boolean {
  return document.body.classList.contains('vscode-dark') || isHighContrast();
}

export function getMethodColor(method: string, _isDark?: boolean): string {
  const dark = _isDark ?? isDark();
  const hc = isHighContrast();
  const map = hc ? METHOD_COLORS_HC : dark ? METHOD_COLORS_DARK : METHOD_COLORS_LIGHT;
  return map[method.toUpperCase()] || (dark ? '#7ee787' : '#0d7a6b');
}

export function getTagColor(method: string, _isDark?: boolean): string {
  const dark = _isDark ?? isDark();
  const hc = isHighContrast();
  const map = hc ? TAG_COLORS_HC : dark ? TAG_COLORS_DARK : TAG_COLORS_LIGHT;
  return map[method.toUpperCase()] || 'var(--muted)';
}
