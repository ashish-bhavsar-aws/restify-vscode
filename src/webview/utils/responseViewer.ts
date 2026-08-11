import { DEFAULT_RESPONSE_VIEWER, type ResponseViewerSettings } from '../types';

/** Min/max bounds for the response body viewer font size. */
export const MIN_FONT_SIZE = 10;
export const MAX_FONT_SIZE = 20;
/** Step applied by the font-size +/- toolbar controls. */
export const FONT_SIZE_STEP = 1;

export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return DEFAULT_RESPONSE_VIEWER.fontSize;
  return Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(size)));
}

export function stepFontSize(size: number, delta: number): number {
  return clampFontSize((clampFontSize(size) || DEFAULT_RESPONSE_VIEWER.fontSize) + delta);
}

/**
 * Normalize a (possibly partial / legacy) viewer settings payload into a full,
 * valid ResponseViewerSettings object. Missing or malformed fields fall back
 * to the defaults.
 */
export function normalizeResponseViewer(partial?: Partial<ResponseViewerSettings> | null): ResponseViewerSettings {
  return {
    wrap: typeof partial?.wrap === 'boolean' ? partial.wrap : DEFAULT_RESPONSE_VIEWER.wrap,
    lineNumbers:
      typeof partial?.lineNumbers === 'boolean'
        ? partial.lineNumbers
        : DEFAULT_RESPONSE_VIEWER.lineNumbers,
    fontSize: partial?.fontSize === undefined ? DEFAULT_RESPONSE_VIEWER.fontSize : clampFontSize(partial.fontSize),
  };
}
