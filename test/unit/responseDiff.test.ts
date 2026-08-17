import { describe, it, expect } from "vitest";
import { computeDiff, formatUnifiedDiff } from "../../src/core/responseDiff";

describe("responseDiff (F26)", () => {
  describe("computeDiff", () => {
    it("returns equal lines for identical content", () => {
      const result = computeDiff("hello\nworld", "hello\nworld");
      expect(result.lines).toEqual([
        { type: "equal", content: "hello", leftLineNum: 1, rightLineNum: 1 },
        { type: "equal", content: "world", leftLineNum: 2, rightLineNum: 2 },
      ]);
      expect(result.stats).toEqual({
        totalLeft: 2,
        totalRight: 2,
        added: 0,
        removed: 0,
        unchanged: 2,
      });
    });

    it("detects added lines", () => {
      const result = computeDiff("hello", "hello\nworld");
      expect(result.lines).toEqual([
        { type: "equal", content: "hello", leftLineNum: 1, rightLineNum: 1 },
        { type: "added", content: "world", rightLineNum: 2 },
      ]);
      expect(result.stats.added).toBe(1);
    });

    it("detects removed lines", () => {
      const result = computeDiff("hello\nworld", "hello");
      expect(result.lines).toEqual([
        { type: "equal", content: "hello", leftLineNum: 1, rightLineNum: 1 },
        { type: "removed", content: "world", leftLineNum: 2 },
      ]);
      expect(result.stats.removed).toBe(1);
    });

    it("detects changed lines", () => {
      const result = computeDiff("hello\nworld", "hello\nearth");
      expect(result.lines).toEqual([
        { type: "equal", content: "hello", leftLineNum: 1, rightLineNum: 1 },
        { type: "removed", content: "world", leftLineNum: 2 },
        { type: "added", content: "earth", rightLineNum: 2 },
      ]);
      expect(result.stats).toEqual({
        totalLeft: 2,
        totalRight: 2,
        added: 1,
        removed: 1,
        unchanged: 1,
      });
    });

    it("handles empty strings", () => {
      const result = computeDiff("", "");
      expect(result.lines).toEqual([
        { type: "equal", content: "", leftLineNum: 1, rightLineNum: 1 },
      ]);
    });

    it("handles completely different content", () => {
      const result = computeDiff("abc", "xyz");
      expect(result.lines).toEqual([
        { type: "removed", content: "abc", leftLineNum: 1 },
        { type: "added", content: "xyz", rightLineNum: 1 },
      ]);
    });

    it("handles multiline diffs correctly", () => {
      const left = "line1\nline2\nline3\nline4";
      const right = "line1\nline3\nline4\nline5";
      const result = computeDiff(left, right);
      expect(result.stats.added).toBe(1);
      expect(result.stats.removed).toBe(1);
      expect(result.stats.unchanged).toBe(3);
    });
  });

  describe("formatUnifiedDiff", () => {
    it("formats a simple diff as unified output", () => {
      const diff = computeDiff("hello\nworld", "hello\nearth");
      const formatted = formatUnifiedDiff(diff, "old", "new");
      expect(formatted).toContain("--- old");
      expect(formatted).toContain("+++ new");
      expect(formatted).toContain(" hello");
      expect(formatted).toContain("-world");
      expect(formatted).toContain("+earth");
    });

    it("uses default labels when not provided", () => {
      const diff = computeDiff("a", "b");
      const formatted = formatUnifiedDiff(diff);
      expect(formatted).toContain("--- left");
      expect(formatted).toContain("+++ right");
    });
  });
});
