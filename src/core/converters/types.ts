// Shared types for Restify collection/environment converters.
export interface ImportRequest {
  name?: string;
  method?: string;
  url?: string;
  headers?: Array<{ key: string; value: string; enabled?: boolean }>;
  queryParams?: Array<{ key: string; value: string; enabled?: boolean }>;
  bodyType?: string;
  body?: string;
  formData?: any[];
  urlencoded?: Array<{ key: string; value: string; enabled?: boolean }>;
  gqlQuery?: string;
  gqlVars?: string;
  authType?: string;
  authData?: any;
  [key: string]: any;
}

export interface ImportedCollection {
  id: string;
  name: string;
  requests: ImportRequest[];
  groups?: Array<{ id: string; name: string; requests: ImportRequest[]; groups: any[] }>;
}

export type ImportSource =
  | "postman"
  | "openapi"
  | "restify"
  | "har"
  | "insomnia"
  | "http"
  | "wsdl"
  | null;
