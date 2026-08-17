/**
 * F26 — response diff: compare two response bodies line-by-line.
 *
 * Pure, host-agnostic module (no `vscode` imports — see GUARDRAILS.md §3).
 * Produces a unified diff suitable for side-by-side rendering in the webview.
 */

export type DiffLineType = "equal" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  /** Line number in the left (original) response; undefined for added lines. */
  leftLineNum?: number;
  /** Line number in the right (current) response; undefined for removed lines. */
  rightLineNum?: number;
}

export interface DiffResult {
  lines: DiffLine[];
  stats: {
    totalLeft: number;
    totalRight: number;
    added: number;
    removed: number;
    unchanged: number;
  };
}

/**
 * Compute a simple line-by-line diff between two strings.
 * Uses the Longest Common Subsequence (LCS) algorithm to minimize diff noise.
 */
export function computeDiff(left: string, right: string): DiffResult {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const lcs = computeLCS(leftLines, rightLines);

  const lines: DiffLine[] = [];
  let li = 0;
  let ri = 0;
  let lcsIdx = 0;
  let leftLineNum = 1;
  let rightLineNum = 1;

  while (li < leftLines.length || ri < rightLines.length) {
    if (lcsIdx < lcs.length && li < leftLines.length && ri < rightLines.length && leftLines[li] === lcs[lcsIdx] && rightLines[ri] === lcs[lcsIdx]) {
      lines.push({ type: "equal", content: leftLines[li], leftLineNum, rightLineNum });
      li++;
      ri++;
      leftLineNum++;
      rightLineNum++;
      lcsIdx++;
    } else if (li < leftLines.length && (lcsIdx >= lcs.length || leftLines[li] !== lcs[lcsIdx])) {
      lines.push({ type: "removed", content: leftLines[li], leftLineNum });
      li++;
      leftLineNum++;
    } else if (ri < rightLines.length) {
      lines.push({ type: "added", content: rightLines[ri], rightLineNum });
      ri++;
      rightLineNum++;
    }
  }

  const added = lines.filter((l) => l.type === "added").length;
  const removed = lines.filter((l) => l.type === "removed").length;
  const unchanged = lines.filter((l) => l.type === "equal").length;

  return {
    lines,
    stats: {
      totalLeft: leftLines.length,
      totalRight: rightLines.length,
      added,
      removed,
      unchanged,
    },
  };
}

/**
 * Compute the Longest Common Subsequence of two arrays.
 * Returns the common lines in order.
 */
function computeLCS(a: string[], b: string[]): string[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: string[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(a[i - 1]);
      i--;
      j--;
    } else if (dp[i - 1][j] > dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return result;
}

/**
 * Format a diff result as a unified diff string (for copy/export).
 */
export function formatUnifiedDiff(diff: DiffResult, leftLabel = "left", rightLabel = "right"): string {
  const header = `--- ${leftLabel}\n+++ ${rightLabel}`;
  const stats = `@@ -1,${diff.stats.totalLeft} +1,${diff.stats.totalRight} @@`;
  const lines = diff.lines.map((line) => {
    switch (line.type) {
      case "added":
        return `+${line.content}`;
      case "removed":
        return `-${line.content}`;
      default:
        return ` ${line.content}`;
    }
  });
  return [header, stats, ...lines].join("\n");
}
