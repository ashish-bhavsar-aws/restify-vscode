export function extensionForContentType(contentType?: string): string {
  const t = (contentType || "").toLowerCase();
  if (t.includes("spreadsheet") || t.includes("excel") || t.includes("vnd.ms-excel")) return "xlsx";
  if (t.includes("json")) return "json";
  if (t.includes("html")) return "html";
  if (t.includes("xml") || t.includes("soap")) return "xml";
  if (t.includes("csv")) return "csv";
  if (t.includes("pdf")) return "pdf";
  if (t.includes("javascript")) return "js";
  if (t.includes("css")) return "css";
  if (t.includes("yaml") || t.includes("yml")) return "yml";
  if (t.includes("octet-stream")) return "bin";
  return "txt";
}

export function sanitizeFileName(name: string): string {
  return (name || "").replace(/[\\/:*?"<>|\s]+/g, "_").replace(/\.+$/, "");
}

const KNOWN_EXT = /\.(json|html|xml|csv|pdf|js|css|yml|yaml|txt|bin|xlsx)$/i;

export function suggestResponseFilename(suggestName?: string, contentType?: string): string {
  const base = sanitizeFileName(suggestName || "").replace(KNOWN_EXT, "");
  const name = base || "response";
  return `${name}.${extensionForContentType(contentType)}`;
}
