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

export const METHOD_COLORS: Record<string, string> = {
  GET: '#a6e3a1',
  POST: '#fab387',
  PUT: '#89dceb',
  DELETE: '#f38ba8',
  PATCH: '#f9e2af',
  HEAD: '#cba6f7',
  OPTIONS: '#94e2d5',
};

export const METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

export const getStatusColor = (status: number): string => {
  if (status >= 200 && status < 300) return '#a6e3a1';
  if (status >= 300 && status < 400) return '#f9e2af';
  if (status >= 400 && status < 500) return '#fab387';
  if (status >= 500) return '#f38ba8';
  return '#6c7086';
};

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
}

export const DEFAULT_SETTINGS: SettingsState = {
  proxy: '',
  proxyAuthorization: '',
  noProxy: '',
  certificates: [],
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
  rejectUnauthorized: false,
  script: '',
  urlencoded: [],
};
