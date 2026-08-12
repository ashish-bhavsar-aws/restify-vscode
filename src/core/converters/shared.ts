// Internal helpers shared by the collection/environment converters.
export function _uuid(): string {
  try {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  } catch {
    return `${Date.now()}`;
  }
}

export function _newId(prefix: string): string {
  return `${prefix}-${_uuid()}`;
}

export function _cleanId(id: any): string {
  return id !== undefined && id !== null ? String(id) : _newId("col");
}

export function _safeParseUrl(url: string | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
