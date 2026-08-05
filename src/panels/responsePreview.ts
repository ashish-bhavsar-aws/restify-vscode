export function extractFilename(contentDisposition: string): string | undefined {
  if (!contentDisposition) return undefined;

  // Try UTF-8 RFC 5987 format: filename*=UTF-8''encoded-filename
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].replace(/["']/g, "")).trim();
      if (decoded.length > 0) return decoded;
    } catch {
      const fallback = utf8Match[1].replace(/["']/g, "").trim();
      if (fallback.length > 0) return fallback;
    }
  }

  // Try standard format: filename="name.ext" or filename=name.ext
  const plainMatch = contentDisposition.match(/filename\s*=\s*"?([^";,\n]+)"?/i);
  if (plainMatch?.[1]) {
    const extracted = plainMatch[1].trim();
    if (extracted.length > 0) return extracted;
  }

  // Try alternate format without quotes: filename=name.ext (with possible spaces)
  const alternateMatch = contentDisposition.match(/filename=([^\s;,]+)/i);
  if (alternateMatch?.[1]) {
    const extracted = alternateMatch[1].trim();
    if (extracted.length > 0) return extracted;
  }

  return undefined;
}

export function getExtensionFromFileName(fileName?: string): string {
  if (!fileName || !fileName.includes(".")) return "";
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function extractFilenameFromPath(pathOrUrl: string): string | undefined {
  if (!pathOrUrl) return undefined;

  try {
    const parsed = new URL(pathOrUrl);
    pathOrUrl = parsed.pathname;
  } catch {
    // Keep path as-is if it is not a full URL.
  }

  const cleanPath = pathOrUrl.split("?")[0].split("#")[0];
  const last = cleanPath.split("/").pop();
  if (!last || !last.includes(".")) return undefined;

  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

export type PreviewType = "text" | "csv" | "pdf" | "excel" | "none";

export function previewTypeFromExtension(ext: string): PreviewType {
  if (!ext) return "none";
  if (ext === "pdf") return "pdf";
  if (ext === "csv") return "csv";
  if (["xls", "xlsx", "xlsm", "ods"].includes(ext)) return "excel";
  if (
    [
      "txt",
      "log",
      "md",
      "json",
      "xml",
      "html",
      "htm",
      "yaml",
      "yml",
      "csv",
    ].includes(ext)
  )
    return "text";
  return "none";
}

export function guessExtension(mimeType: string): string {
  const mime = mimeType.toLowerCase();
  if (mime.includes("application/pdf")) return "pdf";
  if (mime.includes("text/csv") || mime.includes("application/csv"))
    return "csv";
  if (mime.includes("spreadsheetml") || mime.includes("application/vnd.ms-excel"))
    return "xlsx";
  if (mime.includes("application/json")) return "json";
  if (mime.includes("application/xml") || mime.includes("text/xml"))
    return "xml";
  if (mime.includes("text/plain")) return "txt";
  return "bin";
}

export function isTextLike(contentType: string, fileName?: string): boolean {
  const ct = contentType.toLowerCase();
  const ext = getExtensionFromFileName(fileName);
  return (
    ct.startsWith("text/") ||
    ct.includes("csv") ||
    ct.includes("json") ||
    ct.includes("xml") ||
    ct.includes("javascript") ||
    ct.includes("x-www-form-urlencoded") ||
    previewTypeFromExtension(ext) === "text" ||
    previewTypeFromExtension(ext) === "csv"
  );
}

export function isFileLikeResponse(
  contentType: string,
  contentDisposition: string,
  fileName?: string,
): boolean {
  const ct = contentType.toLowerCase();
  const cd = contentDisposition.toLowerCase();
  const ext = getExtensionFromFileName(fileName);

  if (cd.includes("attachment") || cd.includes("filename=")) return true;
  if (previewTypeFromExtension(ext) !== "none") return true;

  return (
    ct.includes("application/pdf") ||
    ct.includes("text/csv") ||
    ct.includes("application/csv") ||
    ct.includes("application/octet-stream") ||
    ct.includes("application/zip") ||
    ct.includes("application/vnd") ||
    ct.includes("spreadsheetml")
  );
}

export function getFilePreviewType(
  contentType: string,
  fileName?: string,
): PreviewType {
  const ct = contentType.toLowerCase();
  const ext = getExtensionFromFileName(fileName);

  if (ct.includes("application/pdf")) return "pdf";
  if (ct.includes("text/csv") || ct.includes("application/csv")) return "csv";
  if (ct.includes("spreadsheetml") || ct.includes("application/vnd.ms-excel"))
    return "excel";
  if (
    ct.startsWith("text/") ||
    ct.includes("application/json") ||
    ct.includes("application/xml") ||
    ct.includes("text/xml")
  )
    return "text";

  const byExt = previewTypeFromExtension(ext);
  if (byExt !== "none") return byExt;

  return "none";
}

export function getFileDetectionSource(
  contentType: string,
  contentDisposition: string,
  fileName?: string,
): "mime" | "filename" {
  const ct = contentType.toLowerCase();
  const cd = contentDisposition.toLowerCase();
  const ext = getExtensionFromFileName(fileName);

  const mimeSuggestsFile =
    cd.includes("attachment") ||
    cd.includes("filename=") ||
    ct.includes("application/pdf") ||
    ct.includes("text/csv") ||
    ct.includes("application/csv") ||
    ct.includes("application/octet-stream") ||
    ct.includes("application/zip") ||
    ct.includes("application/vnd") ||
    ct.includes("spreadsheetml");

  const filenameSuggestsFile = previewTypeFromExtension(ext) !== "none";

  if (!mimeSuggestsFile && filenameSuggestsFile) return "filename";
  return "mime";
}
