import { URL } from "url";

export interface CoreQueryParam {
  key: string;
  value: string;
  enabled?: boolean;
}

/**
 * Append enabled query params to a URL string. Returns the merged URL, or null
 * if the input cannot be parsed as an absolute URL.
 */
export function applyQueryParams(
  url: string,
  params: CoreQueryParam[] | undefined,
  resolve: (s: string) => string,
): string | null {
  try {
    const parsedUrl = new URL(url);
    if (params && params.length > 0) {
      params.forEach((p) => {
        if (p.key && p.enabled !== false) {
          parsedUrl.searchParams.append(resolve(p.key), resolve(p.value));
        }
      });
    }
    return parsedUrl.toString();
  } catch {
    return null;
  }
}
