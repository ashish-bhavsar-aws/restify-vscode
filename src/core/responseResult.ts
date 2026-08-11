/**
 * Response result construction.
 *
 * Pure, host-agnostic module (no `vscode` imports — see GUARDRAILS.md §3).
 * Converts raw wire bytes + headers into the viewer-ready response shape,
 * decompressing the body and detecting file-like payloads.
 */
import * as http from "http";
import { decompressBody } from "./decompress";
import { getHeaderValue, normalizeResponseHeaders } from "./headers";
import {
  extractFilename,
  extractFilenameFromPath,
  getFileDetectionSource,
  getFilePreviewType,
  guessExtension,
  isFileLikeResponse,
  isTextLike,
} from "./responsePreview";
import type { RequestTimings } from "./timings";

export interface RequestResult {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
  bodySize: number;
  isFileResponse: boolean;
  fileDetectionSource?: string;
  fileName?: string;
  fileMimeType?: string;
  fileBase64?: string;
  filePreviewType?: string;
  /** F27: per-stage network timings measured from the request start. */
  timings?: RequestTimings;
}

/**
 * Build the response payload the viewer displays from the raw wire bytes.
 * Decompresses the body when the server used a content-encoding, and — when the
 * payload looks like a file download — carries base64/file metadata for the
 * webview's file preview.
 */
export function buildRequestResult(
  status: number,
  statusText: string,
  headers: http.IncomingHttpHeaders,
  rawData: Buffer,
  requestPathOrUrl: string,
  timings?: RequestTimings,
): RequestResult {
  // Decompress the wire bytes so the viewer receives decoded content.
  const data = decompressBody(
    rawData,
    headers["content-encoding"] as string | string[] | undefined,
  );
  const normalizedHeaders = normalizeResponseHeaders(headers);
  const contentType = getHeaderValue(normalizedHeaders, "Content-Type");
  const contentDisposition = getHeaderValue(
    normalizedHeaders,
    "Content-Disposition",
  );
  const fromDisposition = extractFilename(contentDisposition);
  const fromPath = extractFilenameFromPath(requestPathOrUrl);
  const inferredFileName = fromDisposition || fromPath;
  const isFileResponse = isFileLikeResponse(
    contentType,
    contentDisposition,
    inferredFileName,
  );

  if (!isFileResponse) {
    return {
      status,
      statusText,
      headers: normalizedHeaders,
      body: data.toString("utf8"),
      bodySize: data.length,
      isFileResponse: false,
      timings,
    };
  }

  const safeMimeType = contentType || "application/octet-stream";
  const safeFileName =
    inferredFileName || `response.${guessExtension(safeMimeType)}`;
  const filePreviewType = getFilePreviewType(safeMimeType, safeFileName);
  const fileDetectionSource = getFileDetectionSource(
    contentType,
    contentDisposition,
    safeFileName,
  );
  const fileBase64 = data.toString("base64");
  const textBody = isTextLike(safeMimeType, safeFileName)
    ? data.toString("utf8")
    : "";

  return {
    status,
    statusText,
    headers: normalizedHeaders,
    body: textBody,
    bodySize: data.length,
    isFileResponse: true,
    fileDetectionSource,
    fileName: safeFileName,
    fileMimeType: safeMimeType,
    fileBase64,
    filePreviewType,
    timings,
  };
}
