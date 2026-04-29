/**
 * Predefined HTTP headers with common values
 */
export const PREDEFINED_HEADERS = {
  'Content-Type': [
    'application/json',
    'application/x-www-form-urlencoded',
    'text/plain',
    'text/html',
    'text/xml',
    'application/xml',
    'multipart/form-data',
    'application/octet-stream',
  ],
  'Accept': [
    'application/json',
    'text/html',
    'text/plain',
    'application/xml',
    'text/xml',
    '*/*',
  ],
  'Authorization': [
    'Bearer ',
    'Basic ',
    'Digest ',
    'AWS4-HMAC-SHA256 ',
  ],
  'Cache-Control': [
    'no-cache',
    'no-store',
    'max-age=3600',
    'public',
    'private',
    'must-revalidate',
  ],
  'User-Agent': [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    'PostmanRuntime/7.32.3',
    'curl/7.85.0',
  ],
  'Accept-Encoding': [
    'gzip, deflate, br',
    'gzip, deflate',
    'gzip',
  ],
  'Accept-Language': [
    'en-US,en;q=0.9',
    'en-GB,en;q=0.8',
    'fr-FR,fr;q=0.9',
  ],
  'Access-Control-Allow-Origin': [
    '*',
    'http://localhost:3000',
    'https://example.com',
  ],
  'Access-Control-Allow-Methods': [
    'GET, POST, PUT, DELETE, OPTIONS',
    'GET, POST, OPTIONS',
    '*',
  ],
  'Access-Control-Allow-Headers': [
    'Content-Type, Authorization',
    'X-Requested-With, Content-Type',
    '*',
  ],
  'CORS': [
    '*',
    'http://localhost:3000',
  ],
  'X-Requested-With': [
    'XMLHttpRequest',
  ],
  'X-API-Key': [
    'your-api-key-here',
  ],
  'X-CSRF-Token': [
    'token-value-here',
  ],
  'Referer': [
    'https://example.com/',
  ],
  'Origin': [
    'http://localhost:3000',
    'https://example.com',
  ],
  'Cookie': [
    'session=value',
    'token=value',
  ],
};

export type PredefinedHeaderKey = keyof typeof PREDEFINED_HEADERS;

/**
 * Get all predefined header names (keys)
 */
export function getPredefinedHeaderNames(): string[] {
  return Object.keys(PREDEFINED_HEADERS).sort();
}

/**
 * Get suggested values for a given header name
 */
export function getHeaderSuggestions(headerName: string): string[] {
  const key = Object.keys(PREDEFINED_HEADERS).find(
    (k) => k.toLowerCase() === headerName.toLowerCase()
  );
  return key ? PREDEFINED_HEADERS[key as PredefinedHeaderKey] : [];
}

/**
 * Check if a header name is predefined
 */
export function isPredefinedHeader(headerName: string): boolean {
  return Object.keys(PREDEFINED_HEADERS).some(
    (k) => k.toLowerCase() === headerName.toLowerCase()
  );
}

