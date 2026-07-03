/**
 * Utility functions for detecting and managing data types in form-data fields
 */

export type DetectedDataType = 'json' | 'xml' | 'plain' | 'unknown';

/**
 * Detects the content type of a form field value
 * @param value - The value to detect
 * @returns The detected MIME type
 */
export function detectFormFieldType(value: string): DetectedDataType {
  if (!value || typeof value !== 'string') {
    return 'plain';
  }

  const trimmed = value.trim();

  // Check for JSON
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && isValidJSON(trimmed)) {
    return 'json';
  }

  // Check for XML
  if (trimmed.startsWith('<') && isValidXML(trimmed)) {
    return 'xml';
  }

  // Check for form-encoded
  if (isFormEncoded(trimmed)) {
    return 'plain'; // application/x-www-form-urlencoded is also plain text
  }

  return 'plain';
}

/**
 * Gets the appropriate MIME type for a detected data type
 * @param dataType - The detected data type
 * @returns The MIME type string
 */
export function getMimeType(dataType: DetectedDataType): string {
  const mimeTypes: Record<DetectedDataType, string> = {
    json: 'application/json',
    xml: 'application/xml',
    plain: 'text/plain',
    unknown: 'application/octet-stream',
  };
  return mimeTypes[dataType];
}

/**
 * Validates if a string is valid JSON
 */
function isValidJSON(value: string): boolean {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validates if a string is valid XML
 */
function isValidXML(value: string): boolean {
  try {
    // Simple XML validation - check if it's well-formed
    if (!value.includes('</')) return false;

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(value, 'application/xml');

    // Check for parsing errors
    if (xmlDoc.getElementsByTagName('parsererror').length > 0) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a string looks like form-encoded data
 */
function isFormEncoded(value: string): boolean {
  // Form encoded: key1=value1&key2=value2
  return /^[\w-]+=.*(&[\w-]+=.*)*$/.test(value);
}

/**
 * Auto-detects and returns suggested content type for a form field value
 * @param value - The value to analyze
 * @param currentContentType - The current content type (if any)
 * @returns The suggested content type, or undefined to keep current
 */
export function getSuggestedContentType(
  value: string,
  currentContentType?: string,
): string | undefined {
  const detectedType = detectFormFieldType(value);
  const suggestedMime = getMimeType(detectedType);

  // Only suggest if it's different from current and not plain text
  if (detectedType !== 'plain' && detectedType !== 'unknown') {
    if (currentContentType !== suggestedMime) {
      return suggestedMime;
    }
  }

  return undefined;
}
