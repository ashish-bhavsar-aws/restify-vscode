/**
 * Request stage timings (F27).
 *
 * Pure, host-agnostic module (no `vscode` / `node` imports — see GUARDRAILS.md
 * §3). `RequestTimings` holds absolute millisecond offsets measured from the
 * start of a single network request; the webview renders them as a timeline
 * bar where each stage's duration is the delta from the previous measured
 * offset.
 */

export interface RequestTimings {
  /** DNS lookup resolved (ms from request start; 0 when not measured). */
  dns: number;
  /** TCP connection established. */
  connect: number;
  /** TLS handshake complete (0 for plain http). */
  secureConnect: number;
  /** Request headers + body flushed. */
  send: number;
  /** First response byte received (TTFB). */
  wait: number;
  /** Response body fully received. */
  receive: number;
}

export interface TimingStage {
  id: string;
  label: string;
  /** Absolute offset (ms from request start) when the stage completed. */
  offset: number;
  /** Duration of this stage (ms), i.e. delta from the previous stage. */
  duration: number;
}

/** Create an all-zero timings record. */
export function emptyTimings(): RequestTimings {
  return { dns: 0, connect: 0, secureConnect: 0, send: 0, wait: 0, receive: 0 };
}

/** True when any stage has been measured (i.e. a real network request ran). */
export function isMeasuredTimings(t?: RequestTimings | null): boolean {
  if (!t) return false;
  return t.dns > 0 || t.connect > 0 || t.secureConnect > 0 || t.send > 0 || t.wait > 0 || t.receive > 0;
}

/** Time-to-first-byte helper (ms), or 0 when unmeasured. */
export function ttfbOf(t?: RequestTimings | null): number {
  return t?.wait ?? 0;
}

/**
 * Reduce absolute stage offsets into an ordered list of measured stages with
 * computed durations. Stages whose offset is 0 (not measured — e.g. plain http
 * has no TLS handshake, a reused keep-alive connection has no DNS/connect) are
 * skipped; each stage's duration is the delta from the previous measured one.
 */
export function timingStages(t?: RequestTimings | null): TimingStage[] {
  if (!t) return [];
  const candidates: Array<{ id: string; label: string; offset: number }> = [
    { id: "dns", label: "DNS Lookup", offset: t.dns },
    { id: "connect", label: "TCP Connect", offset: t.connect },
    { id: "tls", label: "TLS Handshake", offset: t.secureConnect },
    { id: "send", label: "Request Sent", offset: t.send },
    { id: "wait", label: "Waiting (TTFB)", offset: t.wait },
    { id: "receive", label: "Receiving", offset: t.receive },
  ];
  const measured = candidates.filter((s) => s.offset > 0);
  if (measured.length === 0) return [];

  let prev = 0;
  return measured.map((s) => {
    const duration = Math.max(0, s.offset - prev);
    prev = s.offset;
    return { id: s.id, label: s.label, offset: s.offset, duration };
  });
}
