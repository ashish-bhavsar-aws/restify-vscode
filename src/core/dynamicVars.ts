import { randomBytes, randomUUID } from "crypto";
import { DYNAMIC_VARIABLES } from "./dynamicVarTokens";

const MAX_RANDOM_INT = 1000;

const pad = (n: number): string => String(n).padStart(2, "0");

function formatLocalDateTime(date: Date): string {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

function randomAlpha(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function randomHex(length: number): string {
  return randomBytes(Math.ceil(length / 2))
    .toString("hex")
    .slice(0, length);
}

const DYNAMIC_VAR_PATTERN = new RegExp(
  `\\{\\{\\$(${DYNAMIC_VARIABLES.map((d) =>
    d.name === "processEnv" ? "processEnv(?::[^}]+)?" : d.name,
  ).join("|")})\\}\\}`,
  "g",
);

/**
 * Resolve Postman-style dynamic variables ({{$guid}}, {{$timestamp}},
 * {{$randomInt}}, {{$randomAlpha}}, {{$randomHex}}, {{$processEnv:NAME}},
 * {{$localDateTime}}) inside a string. Unknown or unresolvable tokens
 * (e.g. an unset {{$processEnv:NAME}}) are left unchanged.
 */
export function resolveDynamicVariables(text: string): string {
  if (!text || !text.includes("$")) return text;

  return text.replace(
    DYNAMIC_VAR_PATTERN,
    (match, name: string) => {
      switch (name) {
        case "guid":
          return randomUUID();
        case "timestamp":
          return String(Date.now());
        case "randomInt":
          return String(Math.floor(Math.random() * (MAX_RANDOM_INT + 1)));
        case "randomAlpha":
          return randomAlpha(5);
        case "randomHex":
          return randomHex(24);
        case "localDateTime":
          return formatLocalDateTime(new Date());
        default: {
          if (name.startsWith("processEnv:")) {
            const envName = name.slice("processEnv:".length);
            return process.env[envName] ?? match;
          }
          return match;
        }
      }
    },
  );
}
