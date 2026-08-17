export interface DocRequest {
  name?: string;
  method: string;
  url: string;
  headers?: Array<{ key: string; value: string; enabled?: boolean }>;
  queryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyType?: string;
  body?: string;
  urlencoded?: Array<{ key: string; value: string; enabled?: boolean }>;
  formData?: Array<{ key: string; value: string; enabled?: boolean; formType?: string }>;
  description?: string;
}

export interface DocGroup {
  name: string;
  requests?: any[];
  groups?: DocGroup[];
}

export interface DocCollection {
  name: string;
  description?: string;
  requests?: any[];
  groups?: DocGroup[];
  variables?: Array<{ key: string; value: string }>;
  preScript?: string;
  testScript?: string;
}

export function generateMarkdown(collection: DocCollection): string {
  const lines: string[] = [];
  lines.push(`# ${collection.name}`);
  lines.push("");
  if (collection.description) {
    lines.push(collection.description);
    lines.push("");
  }

  const allEndpoints: Array<{ group: string; req: DocRequest }> = [];
  const visitRequests = (reqs: DocRequest[], group: string) => {
    for (const r of reqs || []) {
      allEndpoints.push({ group, req: r });
    }
  };
  const visitGroups = (groups: DocGroup[] | undefined, parent: string) => {
    for (const g of groups || []) {
      const path = parent ? `${parent} > ${g.name}` : g.name;
      visitRequests(g.requests || [], path);
      visitGroups(g.groups, path);
    }
  };
  visitRequests(collection.requests || [], "");
  visitGroups(collection.groups, "");

  lines.push(`**Total endpoints:** ${allEndpoints.length}`);
  lines.push("");

  if (collection.variables && collection.variables.length > 0) {
    lines.push("## Variables");
    lines.push("");
    lines.push("| Key | Value |");
    lines.push("|-----|-------|");
    for (const v of collection.variables) {
      lines.push(`| \`${v.key}\` | \`${v.value}\` |`);
    }
    lines.push("");
  }

  let currentGroup = "";
  for (const { group, req } of allEndpoints) {
    if (group !== currentGroup) {
      currentGroup = group;
      lines.push(`## ${group || "Ungrouped"}`);
      lines.push("");
    }

    const methodStr = `**\`${req.method.toUpperCase()}\`**`;
    const name = req.name || `${req.method} ${req.url}`;
    lines.push(`### ${name}`);
    lines.push("");
    lines.push(`${methodStr} \`${req.url}\``);
    lines.push("");

    if (req.description) {
      lines.push(req.description);
      lines.push("");
    }

    const enabledHeaders = (req.headers || []).filter(h => h.enabled !== false && h.key);
    if (enabledHeaders.length > 0) {
      lines.push("**Headers:**");
      lines.push("");
      lines.push("| Key | Value |");
      lines.push("|-----|-------|");
      for (const h of enabledHeaders) {
        lines.push(`| \`${h.key}\` | \`${h.value}\` |`);
      }
      lines.push("");
    }

    const enabledParams = (req.queryParams || []).filter(p => p.enabled !== false && p.key);
    if (enabledParams.length > 0) {
      lines.push("**Query Parameters:**");
      lines.push("");
      lines.push("| Key | Value |");
      lines.push("|-----|-------|");
      for (const p of enabledParams) {
        lines.push(`| \`${p.key}\` | \`${p.value}\` |`);
      }
      lines.push("");
    }

    if (req.bodyType && req.bodyType !== "none" && req.body) {
      lines.push(`**Body** (\`${req.bodyType}\`):`);
      lines.push("");
      if (req.bodyType === "json" || req.bodyType === "xml") {
        lines.push("```");
        lines.push(req.body);
        lines.push("```");
      } else {
        lines.push(req.body);
      }
      lines.push("");
    }

    if (req.bodyType === "urlencoded" && req.urlencoded && req.urlencoded.length > 0) {
      const enabled = req.urlencoded.filter(f => f.enabled !== false && f.key);
      if (enabled.length > 0) {
        lines.push("**URL-Encoded Body:**");
        lines.push("");
        lines.push("| Key | Value |");
        lines.push("|-----|-------|");
        for (const f of enabled) {
          lines.push(`| \`${f.key}\` | \`${f.value}\` |`);
        }
        lines.push("");
      }
    }

    if (req.bodyType === "form" && req.formData && req.formData.length > 0) {
      const enabled = req.formData.filter(f => f.enabled !== false && f.key);
      if (enabled.length > 0) {
        lines.push("**Form Data:**");
        lines.push("");
        lines.push("| Key | Value | Type |");
        lines.push("|-----|-------|------|");
        for (const f of enabled) {
          lines.push(`| \`${f.key}\` | \`${f.value}\` | ${f.formType || "text"} |`);
        }
        lines.push("");
      }
    }

    lines.push("---");
    lines.push("");
  }

  if (collection.preScript) {
    lines.push("## Pre-request Script");
    lines.push("");
    lines.push("```javascript");
    lines.push(collection.preScript);
    lines.push("```");
    lines.push("");
  }

  if (collection.testScript) {
    lines.push("## Test Script");
    lines.push("");
    lines.push("```javascript");
    lines.push(collection.testScript);
    lines.push("```");
    lines.push("");
  }

  lines.push("---");
  lines.push(`*Generated by Restify API Client*`);
  lines.push("");
  return lines.join("\n");
}

export function generateHtml(collection: DocCollection): string {
  const md = generateMarkdown(collection);
  const escaped = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${collection.name} — API Documentation</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 24px; color: #1a1a1a; line-height: 1.6; }
    h1 { border-bottom: 2px solid #e1e4e8; padding-bottom: 8px; }
    h2 { color: #0366d6; margin-top: 2em; }
    h3 { color: #24292e; margin-top: 1.5em; }
    code { background: #f6f8fa; padding: 2px 6px; border-radius: 3px; font-size: 90%; }
    pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
    pre code { background: none; padding: 0; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    th, td { border: 1px solid #e1e4e8; padding: 6px 12px; text-align: left; }
    th { background: #f6f8fa; font-weight: 600; }
    hr { border: none; border-top: 1px solid #e1e4e8; margin: 24px 0; }
    strong { color: #24292e; }
    em { color: #6a737d; }
  </style>
</head>
<body>
<pre>${escaped}</pre>
</body>
</html>`;
}
