export interface CompletionNotifyInput {
  enabled: boolean;
  durationMs: number;
  thresholdMs: number;
  background: boolean;
}

export function shouldNotifyOnCompletion(input: CompletionNotifyInput): boolean {
  if (!input.enabled) return false;
  if (input.thresholdMs <= 0) return false;
  if (input.durationMs < input.thresholdMs) return false;
  return input.background;
}

export interface CompletionNotifyMessageInput {
  method: string;
  url: string;
  status: number;
  durationMs: number;
}

export function formatCompletionNotification(input: CompletionNotifyMessageInput): string {
  let target = input.url;
  try {
    const u = new URL(input.url);
    target = `${u.host}${u.pathname}${u.search}`;
  } catch {
    // fall back to the raw url when it is not parseable
  }
  const statusText = input.status > 0 ? `${input.status}` : "failed";
  const ms =
    input.durationMs < 1000
      ? `${input.durationMs}ms`
      : `${(input.durationMs / 1000).toFixed(1)}s`;
  return `${input.method} ${target} — ${statusText} (${ms})`;
}
