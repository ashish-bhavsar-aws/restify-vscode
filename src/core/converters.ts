/**
 * Pure import/export converters for Restify collections, environments, and
 * `.http` files. Kept free of vscode/webview dependencies so it is
 * unit-testable in isolation (see GUARDRAILS.md §3).
 *
 * Supported sources: Postman (v1/v2), OpenAPI/Swagger (2.0/3.x), HAR,
 * Insomnia, REST Client `.http`, and Restify's own JSON export.
 * Supported export targets: Postman v2.1, OpenAPI 3.0, HAR, `.http`,
 * Restify JSON, and Postman/Restify environment files.
 */

export * from "./converters/types";
export * from "./converters/yaml";
export {
  parsePostmanCollection,
  collectionToPostman,
} from "./converters/postman";
export {
  parseOpenApiCollection,
  collectionToOpenApi,
} from "./converters/openapi";
export {
  parseHarCollection,
  collectionToHar,
} from "./converters/har";
export { parseInsomniaCollection } from "./converters/insomnia";
export {
  parseHttpFileText,
  requestToHttpText,
  collectionToHttpText,
} from "./converters/httpText";
export { collectionToRestify } from "./converters/restify";
export {
  detectJsonSource,
  parseImportText,
  parseImportTextAuto,
} from "./converters/imports";
export {
  environmentToPostman,
  parsePostmanEnvironment,
  environmentToRestify,
  parseRestifyEnvironment,
} from "./converters/environment";
