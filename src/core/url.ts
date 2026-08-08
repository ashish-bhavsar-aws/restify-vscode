import { URL } from "url";

export interface CoreQueryParam {
  key: string;
  value: string;
  enabled?: boolean;
}

/**
 * Extract Basic-auth credentials (`user:pass@`) from a URL's authority.
 * Returns the cleaned URL (credentials stripped) plus the decoded username and
 * password. Both strings are empty when the URL carries no userinfo, and the
 * original URL is returned untouched.
 */
export function extractBasicAuthFromUrl(url: string): {
  url: string;
  username: string;
  password: string;
} {
  try {
    const parsed = new URL(url);
    const { username, password } = parsed;
    if (!username && !password) {
      return { url, username: "", password: "" };
    }
    const safeDecode = (s: string): string => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    };
    parsed.username = "";
    parsed.password = "";
    return { url: parsed.toString(), username: safeDecode(username), password: safeDecode(password) };
  } catch {
    return { url, username: "", password: "" };
  }
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
