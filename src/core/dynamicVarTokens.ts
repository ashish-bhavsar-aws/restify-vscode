/**
 * Canonical list + helpers for Postman-style dynamic variables.
 *
 * This module is intentionally browser-safe (no node-only imports) so it can be
 * shared between the host (`src/core/dynamicVars.ts` resolution engine) and the
 * webview (rendering, preview tooltips, autocomplete, help modal, codegen).
 */

export interface DynamicVarInfo {
  name: string;
  label: string;
  description: string;
  example: string;
}

export const DYNAMIC_VARIABLES: DynamicVarInfo[] = [
  {
    name: "guid",
    label: "{{$guid}}",
    description: "Random UUID v4 — a fresh value on every request",
    example: "8f14e45f-ea1e-4f8a-9d5a-2a8f0b1c3d6e",
  },
  {
    name: "timestamp",
    label: "{{$timestamp}}",
    description: "Current Unix timestamp in milliseconds",
    example: "1712345678901",
  },
  {
    name: "randomInt",
    label: "{{$randomInt}}",
    description: "Random integer between 0 and 1000",
    example: "742",
  },
  {
    name: "randomAlpha",
    label: "{{$randomAlpha}}",
    description: "5 random lowercase letters",
    example: "qsxdr",
  },
  {
    name: "randomHex",
    label: "{{$randomHex}}",
    description: "24 random hexadecimal characters",
    example: "7c4a9b1e3f2d0a8b6c5e4d3f2a1b0c9e",
  },
  {
    name: "processEnv",
    label: "{{$processEnv:NAME}}",
    description: "Value of the NAME environment variable on the host machine",
    example: "my-secret-value",
  },
  {
    name: "localDateTime",
    label: "{{$localDateTime}}",
    description: "Current local date and time (YYYY-MM-DD HH:MM:SS)",
    example: "2026-08-03 22:45:00",
  },
];

/** True when a `{{...}}` token name refers to a known dynamic variable. */
export function isDynamicVariableToken(name: string): boolean {
  if (name === "processEnv" || name.startsWith("processEnv:")) return true;
  return DYNAMIC_VARIABLES.some((d) => d.name === name);
}

function randomUuid(): string {
  const g = globalThis as {
    crypto?: {
      randomUUID?: () => string;
      getRandomValues?: (arr: Uint8Array) => Uint8Array;
    };
  };
  if (typeof g.crypto?.randomUUID === "function") return g.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof g.crypto?.getRandomValues === "function") {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const pad = (n: number): string => String(n).padStart(2, "0");

/** Generates a sample value for UI previews / codegen substitution. */
export function previewDynamicVariable(name: string): string {
  switch (name) {
    case "guid":
      return randomUuid();
    case "timestamp":
      return String(Date.now());
    case "randomInt":
      return String(Math.floor(Math.random() * 1001));
    case "randomAlpha":
      return Array.from(
        { length: 5 },
        () => String.fromCharCode(97 + Math.floor(Math.random() * 26)),
      ).join("");
    case "randomHex":
      return Array.from(
        { length: 24 },
        () => "0123456789abcdef"[Math.floor(Math.random() * 16)],
      ).join("");
    case "localDateTime": {
      const d = new Date();
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    }
    default: {
      if (name.startsWith("processEnv:")) {
        const envName = name.slice("processEnv:".length);
        if (
          typeof process !== "undefined" &&
          process.env &&
          process.env[envName] !== undefined
        ) {
          return String(process.env[envName]);
        }
        return `(value of ${envName})`;
      }
      return `{{$${name}}}`;
    }
  }
}
