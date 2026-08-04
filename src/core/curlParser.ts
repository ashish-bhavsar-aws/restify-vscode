/**
 * Parse a cURL command string into a RequestData-compatible object.
 *
 * Handles single-line and multi-line commands, single/double quotes,
 * line continuations (\), and common cURL flags.
 */

export interface ParsedCurl {
  method: string;
  url: string;
  headers: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyType: "none" | "json" | "text" | "xml" | "form" | "urlencoded";
  body: string;
  formData: Array<{
    key: string;
    value: string;
    enabled?: boolean;
    formType?: "text" | "file";
    fileName?: string;
  }>;
  urlencoded: Array<{ key: string; value: string; enabled?: boolean }>;
  authType: "none" | "bearer" | "basic" | "apikey";
  authData: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: "header" | "query";
  };
  rejectUnauthorized: boolean;
}

function unquote(s: string): string {
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Tokenize a cURL command string, respecting quotes and line continuations.
 */
function tokenize(input: string): string[] {
  // Normalize line continuations and newlines
  const normalized = input.replace(/\\\r?\n/g, " ").replace(/\r?\n/g, " ");
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let escape = false;

  for (const ch of normalized) {
    if (escape) {
      current += ch;
      escape = false;
      continue;
    }
    if (ch === "\\") {
      escape = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (/\s/.test(ch) && !inSingle && !inDouble) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Detect if a body looks like JSON.
 */
function isJsonLike(s: string): boolean {
  const t = s.trim();
  return (
    (t.startsWith("{") && t.endsWith("}")) ||
    (t.startsWith("[") && t.endsWith("]"))
  );
}

/**
 * Detect if a body looks like XML.
 */
function isXmlLike(s: string): boolean {
  const t = s.trim();
  return t.startsWith("<") && t.endsWith(">");
}

/**
 * Parse a cURL command string and return a structured request object.
 */
export function parseCurl(input: string): ParsedCurl {
  const tokens = tokenize(input);

  const result: ParsedCurl = {
    method: "GET",
    url: "",
    headers: [],
    bodyType: "none",
    body: "",
    formData: [],
    urlencoded: [],
    authType: "none",
    authData: {},
    rejectUnauthorized: true,
  };

  if (tokens.length === 0) return result;

  // Skip 'curl' token if present
  let i = tokens[0] === "curl" ? 1 : 0;

  while (i < tokens.length) {
    const token = tokens[i];

    // Method
    if (token === "-X" || token === "--request") {
      result.method = (tokens[++i] || "GET").toUpperCase();
    }
    // Header
    else if (token === "-H" || token === "--header") {
      const val = tokens[++i] || "";
      const colonIdx = val.indexOf(":");
      if (colonIdx > -1) {
        const key = val.slice(0, colonIdx).trim();
        const value = val.slice(colonIdx + 1).trim();
        result.headers.push({ key, value, enabled: true });
      }
    }
    // Body data (--data, --data-raw, --data-binary, --data-urlencode)
    else if (
      token === "-d" ||
      token === "--data" ||
      token === "--data-raw" ||
      token === "--data-binary"
    ) {
      const val = tokens[++i] || "";
      result.body = val;
      if (result.method === "GET") result.method = "POST";
    }
    // URL-encoded data
    else if (token === "--data-urlencode") {
      const val = tokens[++i] || "";
      // Format: "key=value" or "key@value" or just "value"
      const eqIdx = val.indexOf("=");
      if (eqIdx > -1) {
        result.urlencoded.push({
          key: val.slice(0, eqIdx),
          value: decodeURIComponent(val.slice(eqIdx + 1)),
          enabled: true,
        });
      } else {
        result.urlencoded.push({ key: val, value: "", enabled: true });
      }
      if (result.method === "GET") result.method = "POST";
    }
    // Form data
    else if (token === "-F" || token === "--form") {
      const val = tokens[++i] || "";
      const eqIdx = val.indexOf("=");
      if (eqIdx > -1) {
        const key = val.slice(0, eqIdx);
        const value = val.slice(eqIdx + 1);
        const isFile = value.startsWith("@");
        result.formData.push({
          key,
          value: isFile ? value.slice(1) : value,
          enabled: true,
          formType: isFile ? "file" : "text",
          fileName: isFile ? value.slice(1).split("/").pop() : undefined,
        });
      }
      if (result.method === "GET") result.method = "POST";
    }
    // Basic auth
    else if (token === "-u" || token === "--user") {
      const val = tokens[++i] || "";
      const colonIdx = val.indexOf(":");
      result.authType = "basic";
      result.authData = {
        username: colonIdx > -1 ? val.slice(0, colonIdx) : val,
        password: colonIdx > -1 ? val.slice(colonIdx + 1) : "",
      };
    }
    // Bearer token via Authorization header
    else if (token === "--oauth2-bearer") {
      const val = tokens[++i] || "";
      result.authType = "bearer";
      result.authData = { token: val };
    }
    // Insecure
    else if (token === "-k" || token === "--insecure") {
      result.rejectUnauthorized = false;
    }
    // User-Agent shortcut
    else if (token === "-A" || token === "--user-agent") {
      result.headers.push({
        key: "User-Agent",
        value: tokens[++i] || "",
        enabled: true,
      });
    }
    // Referer shortcut
    else if (token === "-e" || token === "--referer") {
      result.headers.push({
        key: "Referer",
        value: tokens[++i] || "",
        enabled: true,
      });
    }
    // Cookie
    else if (token === "-b" || token === "--cookie") {
      result.headers.push({
        key: "Cookie",
        value: tokens[++i] || "",
        enabled: true,
      });
    }
    // Content-Type shorthand
    else if (token === "-T" || token === "--upload-file") {
      // PUT with file
      result.method = "PUT";
    }
    // HEAD
    else if (token === "-I" || token === "--head") {
      result.method = "HEAD";
    }
    // Skip other flags and their values
    else if (token.startsWith("-")) {
      // Unknown flag — skip next token if it looks like a value (not a flag)
      if (i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
        i++;
      }
    }
    // Positional argument = URL
    else if (!result.url) {
      result.url = unquote(token);
    }

    i++;
  }

  // Determine bodyType from body content
  if (result.formData.length > 0) {
    result.bodyType = "form";
  } else if (result.urlencoded.length > 0) {
    result.bodyType = "urlencoded";
  } else if (result.body) {
    if (isJsonLike(result.body)) {
      result.bodyType = "json";
    } else if (isXmlLike(result.body)) {
      result.bodyType = "xml";
    } else {
      result.bodyType = "text";
    }
  }

  // Auto-detect Bearer token from Authorization header
  if (result.authType === "none") {
    const authHeader = result.headers.find(
      (h) => h.key.toLowerCase() === "authorization"
    );
    if (authHeader) {
      const val = authHeader.value;
      if (val.toLowerCase().startsWith("bearer ")) {
        result.authType = "bearer";
        result.authData = { token: val.slice(7) };
        result.headers = result.headers.filter((h) => h !== authHeader);
      }
    }
  }

  return result;
}
