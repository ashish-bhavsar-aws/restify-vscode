export const METHOD_COLORS_LIGHT: Record<string, string> = {
  GET: '#1a7f37',
  POST: '#0550ae',
  PUT: '#9a6700',
  DELETE: '#cf222e',
  PATCH: '#8250df',
  HEAD: '#4d5970',
  OPTIONS: '#bf3989',
};

export const METHOD_COLORS_DARK: Record<string, string> = {
  GET: '#7ee787',
  POST: '#79c0ff',
  PUT: '#e3b341',
  DELETE: '#ffa198',
  PATCH: '#d2a8ff',
  HEAD: '#90a4ae',
  OPTIONS: '#f778ba',
};

export const METHOD_COLORS_HC: Record<string, string> = {
  GET: '#7ee787',
  POST: '#79c0ff',
  PUT: '#e3b341',
  DELETE: '#ffa198',
  PATCH: '#d2a8ff',
  HEAD: '#90a4ae',
  OPTIONS: '#f778ba',
};

export const TAG_COLORS_LIGHT: Record<string, string> = {
  GET: '#1a7f37',
  POST: '#0550ae',
  PUT: '#9a6700',
  DELETE: '#cf222e',
  PATCH: '#8250df',
  HEAD: '#4d5970',
  OPTIONS: '#bf3989',
};

export const TAG_COLORS_DARK: Record<string, string> = {
  GET: '#7ee787',
  POST: '#79c0ff',
  PUT: '#e3b341',
  DELETE: '#ffa198',
  PATCH: '#d2a8ff',
  HEAD: '#90a4ae',
  OPTIONS: '#f778ba',
};

export const TAG_COLORS_HC: Record<string, string> = {
  GET: '#7ee787',
  POST: '#79c0ff',
  PUT: '#e3b341',
  DELETE: '#ffa198',
  PATCH: '#d2a8ff',
  HEAD: '#90a4ae',
  OPTIONS: '#f778ba',
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
