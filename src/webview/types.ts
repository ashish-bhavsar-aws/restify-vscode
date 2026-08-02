export interface KVItem {
  key: string;
  value: string;
  enabled?: boolean;
}

export interface FormDataItem extends KVItem {
  formType?: 'text' | 'file';
  fileName?: string;
  fileContentBase64?: string;
  contentType?: string;
}

export interface RequestState {
  name: string;
  method: string;
  url: string;
  headers: KVItem[];
  queryParams: KVItem[];
  bodyType: 'none' | 'json' | 'text' | 'xml' | 'form' | 'urlencoded' | 'graphql';
  body: string;
  bodyFormat?: 'formatted' | 'minified';
  formData: FormDataItem[];
  gqlQuery: string;
  gqlVars: string;
  authType: 'none' | 'bearer' | 'basic' | 'apikey';
  authData: {
    token?: string;
    username?: string;
    password?: string;
    keyName?: string;
    keyValue?: string;
    addTo?: 'header' | 'query';
  };
  rejectUnauthorized: boolean;
  followRedirects?: boolean;
  timeout?: number; // per-request timeout in ms; falls back to settings default
  script?: string; // JavaScript to extract variables from response
  urlencoded?: KVItem[]; // URL-encoded form parameters (application/x-www-form-urlencoded)
}

export interface ResponseState {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
  duration: number;
  size: number;
  isFileResponse?: boolean;
  fileDetectionSource?: 'mime' | 'filename';
  fileName?: string;
  fileMimeType?: string;
  fileBase64?: string;
  filePreviewType?: 'text' | 'csv' | 'pdf' | 'excel' | 'none';
}

export interface Environment {
  id: string;
  name: string;
  variables: KVItem[];
}

export interface CollectionGroup {
  id: string;
  name: string;
  requests?: any[];
  groups?: CollectionGroup[];
}

export interface Collection {
  id: string;
  name: string;
  requests?: any[];
  groups?: CollectionGroup[];
}

export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const getStatusClass = (status: number): string => {
  if (status >= 200 && status < 300) return 'status-2xx';
  if (status >= 300 && status < 400) return 'status-3xx';
  if (status >= 400 && status < 500) return 'status-4xx';
  if (status >= 500) return 'status-5xx';
  return '';
};

export interface CertEntry {
  hostname: string;
  certPath: string;
  keyPath: string;
  caPath: string;
}

export interface SettingsState {
  proxy: string;
  proxyAuthorization: string;
  noProxy: string;          // comma-separated
  certificates: CertEntry[];
  showActivityLog: boolean;
  defaultTimeout: number;   // default request timeout in ms
}

export const DEFAULT_SETTINGS: SettingsState = {
  proxy: '',
  proxyAuthorization: '',
  noProxy: '',
  certificates: [],
  showActivityLog: true,
  defaultTimeout: 30000,
};

export const DEFAULT_REQUEST: RequestState = {
  name: 'New Request',
  method: 'GET',
  url: '',
  headers: [],
  queryParams: [],
  bodyType: 'none',
  body: '',
  bodyFormat: 'formatted',
  formData: [],
  gqlQuery: '',
  gqlVars: '',
  authType: 'none',
  authData: {},
  rejectUnauthorized: true,
  followRedirects: true,
  script: '',
  urlencoded: [],
};
