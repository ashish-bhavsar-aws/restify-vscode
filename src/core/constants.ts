export const MAX_RESPONSE_SIZE = 100 * 1024 * 1024; // 100MB
export const DEFAULT_TIMEOUT_MS = 30000;
export const DEFAULT_MAX_REDIRECTS = 10;

export const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308] as const;
export type RedirectStatusCode = (typeof REDIRECT_STATUS_CODES)[number];
