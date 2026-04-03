/**
 * CHUCK SCOPE ENFORCER
 * Hard allowlist checked before every tool execution.
 * Violations are blocked at executor level, not just in prompts.
 */

import { readFile } from "fs/promises";
import { existsSync } from "fs";
import type { ToolCall } from "../agent/parser.js";

export interface ScopeConfig {
  targets: string[];
  excludeTargets?: string[];
  allowedTools?: string[];
  engagement?: string;
}

let scopeCache: ScopeConfig | null = null;

export async function loadScope(): Promise<ScopeConfig | null> {
  if (scopeCache) return scopeCache;
  const scopePath = process.env.CHUCK_SCOPE_FILE || ".chuck/scope.json";
  if (!existsSync(scopePath)) return null;
  try {
    scopeCache = JSON.parse(await readFile(scopePath, "utf8")) as ScopeConfig;
    return scopeCache;
  } catch { return null; }
}

export async function validateScope(call: ToolCall): Promise<string | null> {
  const scope = await loadScope();
  if (!scope) return null;

  if (scope.allowedTools && !scope.allowedTools.includes(call.tool)) {
    return `Tool "${call.tool}" is not in the allowed tool list for this engagement`;
  }

  const target = call.args.target || call.args.url || call.args.domain || call.args.path || "";
  if (!target) return null;
  if (["read_file", "grep", "slither"].includes(call.tool)) return null;

  if (scope.excludeTargets?.some(e => targetMatchesScope(target, e))) {
    return `Target "${target}" is explicitly excluded from scope`;
  }

  if (scope.targets.length > 0 && !scope.targets.some(a => targetMatchesScope(target, a))) {
    return `Target "${target}" is not in authorized scope. Allowed: ${scope.targets.join(", ")}`;
  }

  return null;
}

function targetMatchesScope(target: string, scopeEntry: string): boolean {
  const clean = (s: string) => s.replace(/^https?:\/\//, "").split("/")[0].split(":")[0].toLowerCase();
  const t = clean(target);
  const s = clean(scopeEntry);

  if (t === s) return true;
  if (s.startsWith("*.") && (t === s.slice(2) || t.endsWith(`.${s.slice(2)}`))) return true;
  if (t.endsWith(`.${s}`)) return true;
  if (s.includes("/")) { try { return ipInCIDR(t, s); } catch { return false; } }
  return false;
}

function ipInCIDR(ip: string, cidr: string): boolean {
  const [range, bits] = cidr.split("/");
  const mask = ~(2 ** (32 - parseInt(bits)) - 1) >>> 0;
  const toInt = (i: string) => i.split(".").reduce((a, o) => (a << 8) + parseInt(o), 0) >>> 0;
  return (toInt(ip) & mask) === (toInt(range) & mask);
}
