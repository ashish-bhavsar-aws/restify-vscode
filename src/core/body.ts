import { hasHeader, setHeader } from "./headers";
import { soapContentType } from "./wsdl";

/**
 * Serializable subset of a request needed to produce a wire body. Kept free of
 * any vscode/webview dependencies so it is unit-testable in isolation.
 */
export interface CoreFormDataItem {
  key: string;
  value?: string;
  enabled?: boolean;
  formType?: "text" | "file";
  fileName?: string;
  fileContentBase64?: string;
  contentType?: string;
}

export interface CoreUrlEncodedItem {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface CoreRequestForBody {
  bodyType: string;
  body?: string;
  formData?: CoreFormDataItem[];
  urlencoded?: CoreUrlEncodedItem[];
  gqlQuery?: string;
  gqlVars?: string;
  soapMeta?: { isSoap12: boolean };
}

export interface SerializedBody {
  body?: string | Buffer;
  /** Additional headers the caller should apply (Content-Type / Content-Length). */
  headers?: Record<string, string>;
  /**
   * Header names that must override any user-provided value (e.g. the
   * multipart boundary). All other returned headers are only applied when the
   * user hasn't already set them.
   */
  forceHeaders?: string[];
}

export function serializeRequestBody(
  req: CoreRequestForBody,
  resolve: (s: string) => string,
): SerializedBody {
  if (!req) return {};

  if (req.bodyType === "json" && req.body) {
    const body = resolve(req.body);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    return { body, headers };
  }

  if (req.bodyType === "graphql") {
    return serializeGraphqlBody(req, resolve);
  }

  if (req.bodyType === "form" && req.formData) {
    return serializeFormBody(req.formData, resolve);
  }

  if (req.bodyType === "urlencoded") {
    return serializeUrlEncodedBody(req.urlencoded, resolve);
  }

  if (req.bodyType === "text" || req.bodyType === "xml") {
    const headers: Record<string, string> = {};
    if (req.bodyType === "xml") {
      headers["Content-Type"] = req.soapMeta
        ? soapContentType(req.soapMeta.isSoap12)
        : "application/xml";
    }
    const forceHeaders = req.soapMeta ? ["Content-Type"] : undefined;
    return { body: resolve(req.body || ""), headers, forceHeaders };
  }

  return {};
}

function serializeGraphqlBody(
  req: CoreRequestForBody,
  resolve: (s: string) => string,
): SerializedBody {
  const query = (req.gqlQuery || "").trim();
  if (!query) return {};

  const payload: Record<string, unknown> = { query: resolve(query) };
  if (req.gqlVars && req.gqlVars.trim()) {
    const vars = resolve(req.gqlVars).trim();
    if (vars) {
      try {
        payload.variables = JSON.parse(vars);
      } catch {
        payload.variables = vars;
      }
    }
  }
  return {
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  };
}

function serializeFormBody(
  formData: CoreFormDataItem[],
  resolve: (s: string) => string,
): SerializedBody {
  const enabledFields = (formData || []).filter(
    (f) => f.key && f.enabled !== false,
  );
  const hasFileField = enabledFields.some(
    (f) => (f.formType || "text") === "file",
  );

  if (!hasFileField) {
    const params = new URLSearchParams();
    enabledFields.forEach((f) => {
      params.append(resolve(f.key), resolve(f.value || ""));
    });
    return {
      body: params.toString(),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    };
  }

  const boundary = `----RestifyFormBoundary${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];

  enabledFields.forEach((field) => {
    const fieldName = resolve(field.key);
    const fieldType = field.formType || "text";

    if (fieldType === "file" && field.fileContentBase64) {
      const fileName = field.fileName || "upload.bin";
      const contentType = field.contentType || "application/octet-stream";
      const fileBuffer = Buffer.from(field.fileContentBase64, "base64");
      chunks.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${fieldName}"; filename="${fileName}"\r\n` +
            `Content-Type: ${contentType}\r\n\r\n`,
        ),
      );
      chunks.push(fileBuffer);
      chunks.push(Buffer.from("\r\n"));
      return;
    }

    const fieldValue = resolve(field.value || "");
    let header = `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="${fieldName}"\r\n`;

    if (fieldType === "text" && field.contentType) {
      header += `Content-Type: ${field.contentType}\r\n`;
    }

    header += `\r\n`;
    chunks.push(Buffer.from(header));
    chunks.push(Buffer.from(fieldValue));
    chunks.push(Buffer.from("\r\n"));
  });

  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return {
    body,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    forceHeaders: ["Content-Type", "Content-Length"],
  };
}

function serializeUrlEncodedBody(
  urlencoded: CoreUrlEncodedItem[] | undefined,
  resolve: (s: string) => string,
): SerializedBody {
  const enabledFields = (urlencoded || []).filter(
    (f) => f.key && f.enabled !== false,
  );
  const params = new URLSearchParams();
  enabledFields.forEach((f) => {
    params.append(resolve(f.key), resolve(f.value || ""));
  });
  return {
    body: params.toString(),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  };
}

export function applyHeadersToRequest(
  target: Record<string, string>,
  extra: Record<string, string> | undefined,
  forceNames: string[] = [],
): void {
  if (!extra) return;
  Object.entries(extra).forEach(([name, value]) => {
    const isForced = forceNames.some(
      (n) => n.toLowerCase() === name.toLowerCase(),
    );
    if (!isForced && hasHeader(target, name)) return;
    setHeader(target, name, value);
  });
}
