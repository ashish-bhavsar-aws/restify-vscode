import { describe, it, expect } from 'vitest';
import {
  clampFontSize,
  stepFontSize,
  normalizeResponseViewer,
  MIN_FONT_SIZE,
  MAX_FONT_SIZE,
  FONT_SIZE_STEP,
} from '../../src/webview/utils/responseViewer';

describe('clampFontSize', () => {
  it('keeps an in-range size unchanged', () => {
    expect(clampFontSize(12)).toBe(12);
  });

  it('rounds to a whole pixel', () => {
    expect(clampFontSize(12.6)).toBe(13);
  });

  it('clamps below the minimum', () => {
    expect(clampFontSize(2)).toBe(MIN_FONT_SIZE);
  });

  it('clamps above the maximum', () => {
    expect(clampFontSize(80)).toBe(MAX_FONT_SIZE);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampFontSize(NaN)).toBe(12);
    expect(clampFontSize(Infinity)).toBe(12);
  });
});

describe('stepFontSize', () => {
  it('increments within bounds', () => {
    expect(stepFontSize(12, 1)).toBe(13);
  });

  it('decrements within bounds', () => {
    expect(stepFontSize(12, -1)).toBe(11);
  });

  it('never exceeds the max', () => {
    expect(stepFontSize(MAX_FONT_SIZE, FONT_SIZE_STEP)).toBe(MAX_FONT_SIZE);
  });

  it('never drops below the min', () => {
    expect(stepFontSize(MIN_FONT_SIZE, -FONT_SIZE_STEP)).toBe(MIN_FONT_SIZE);
  });

  it('recovers from an out-of-range starting value (clamp first, then step)', () => {
    expect(stepFontSize(99, -1)).toBe(MAX_FONT_SIZE - 1);
  });
});

describe('normalizeResponseViewer', () => {
  it('returns defaults for an empty payload', () => {
    expect(normalizeResponseViewer()).toEqual({ wrap: true, lineNumbers: true, fontSize: 12 });
  });

  it('preserves valid overrides', () => {
    expect(normalizeResponseViewer({ wrap: false, lineNumbers: false, fontSize: 16 }))
      .toEqual({ wrap: false, lineNumbers: false, fontSize: 16 });
  });

  it('fills in missing fields from defaults', () => {
    expect(normalizeResponseViewer({ fontSize: 9 }))
      .toEqual({ wrap: true, lineNumbers: true, fontSize: MIN_FONT_SIZE });
  });

  it('rejects malformed boolean fields', () => {
    expect(normalizeResponseViewer({ wrap: 1 as any, lineNumbers: 'no' as any }))
      .toEqual({ wrap: true, lineNumbers: true, fontSize: 12 });
  });
});
