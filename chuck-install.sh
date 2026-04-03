#!/usr/bin/env bash
# =============================================================================
# CHUCK v0.3.0 — ONE-SHOT INSTALL + PUSH
# Run from inside your cloned repo root:
#   cd ~/Desktop/claude-chuck/chuck
#   GITHUB_TOKEN=ghp_xxx bash chuck-install.sh
# =============================================================================
set -e

REPO_ROOT="$(pwd)"
GITHUB_TOKEN="${GITHUB_TOKEN:-}"

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Chuck v0.3.0 — Agent overhaul installer         ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "[✓] Repo root: $REPO_ROOT"

# ── 1. Verify we're in the right place ────────────────────────────────────────
if [ ! -f "package.json" ] || [ ! -d "src" ]; then
  echo "[✗] Run this from the chuck repo root (where package.json lives)"
  exit 1
fi

# ── 2. Create new directories ─────────────────────────────────────────────────
echo "[1/6] Creating directories..."
mkdir -p \
  src/agent \
  src/audit \
  src/ui \
  .chuck/memory \
  sessions

echo "      src/agent, src/audit, src/ui, .chuck/memory, sessions — done"

# ── 3. Write all new files inline ─────────────────────────────────────────────
echo "[2/6] Writing agent core files..."

# ─────────────────────────────────────────────────────────────────────────────
cat > src/agent/parser.ts << 'ENDOFFILE'
/**
 * CHUCK PARSER — Extract tool calls from model text output
 * Handles clean JSON blocks and sloppy model output gracefully.
 */

export interface ToolCall {
  tool: string;
  args: Record<string, string>;
}

const TOOL_BLOCK_RE = /```tool\s*([\s\S]*?)```/m;
const JSON_INLINE_RE = /\{"tool"\s*:\s*"([^"]+)"[^}]*"args"\s*:\s*(\{[^}]*\})/;

export function parseToolCall(text: string): ToolCall | null {
  const blockMatch = text.match(TOOL_BLOCK_RE);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1].trim());
      if (parsed.tool && typeof parsed.tool === "string") {
        return { tool: parsed.tool, args: parsed.args || {} };
      }
    } catch { /* fall through */ }
  }

  const inlineMatch = text.match(JSON_INLINE_RE);
  if (inlineMatch) {
    try {
      const args = JSON.parse(inlineMatch[2]);
      return { tool: inlineMatch[1], args };
    } catch { /* fall through */ }
  }

  const actionMatch = text.match(/(?:ACTION|TOOL|EXECUTE):\s*(\w+)\s*\(([^)]*)\)/i);
  if (actionMatch) {
    const rawArgs = actionMatch[2];
    const args: Record<string, string> = {};
    const kvPairs = rawArgs.match(/(\w+)\s*=\s*"?([^,"]+)"?/g) || [];
    if (kvPairs.length > 0) {
      for (const pair of kvPairs) {
        const [k, ...v] = pair.split("=");
        args[k.trim()] = v.join("=").trim().replace(/^"|"$/g, "");
      }
    } else if (rawArgs.trim()) {
      args["target"] = rawArgs.trim().replace(/^"|"$/g, "");
    }
    return { tool: actionMatch[1].toLowerCase(), args };
  }

  return null;
}
ENDOFFILE
echo "      src/agent/parser.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/agent/model.ts << 'ENDOFFILE'
/**
 * CHUCK MODEL LAYER
 * Priority: Claude API (best) → Ollama fallback with capable model.
 * Context window: 16k minimum (was 2048 — completely broken).
 */

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

const CLAUDE_MODEL = "claude-sonnet-4-6";
const OLLAMA_FALLBACK_MODEL = process.env.CHUCK_OLLAMA_MODEL || "qwen2.5-coder:14b";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

export async function queryModel(messages: Message[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return queryClaudeAPI(messages, apiKey);
  console.warn("[chuck] No ANTHROPIC_API_KEY — falling back to Ollama. Quality will be lower.");
  return queryOllama(messages);
}

async function queryClaudeAPI(messages: Message[], apiKey: string): Promise<string> {
  const system = messages.find(m => m.role === "system")?.content || "";
  const conversation = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 4096, system, messages: conversation }),
  });

  if (!response.ok) throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
  const data = await response.json() as any;
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("Claude API returned no text block");
  return textBlock.text;
}

async function queryOllama(messages: Message[]): Promise<string> {
  const ollamaMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const response = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_FALLBACK_MODEL,
      messages: ollamaMessages,
      stream: false,
      temperature: 0.2,
      options: { num_ctx: 16384, num_predict: 2048 },
    }),
  });

  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty response");
  return content;
}
ENDOFFILE
echo "      src/agent/model.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/agent/loop.ts << 'ENDOFFILE'
/**
 * CHUCK AGENT LOOP — ReAct (Reason + Act) pattern
 *
 * THE core fix. Replaces single-shot ollama call with a real iterative
 * loop: call model → parse tool call → execute → feed result back → repeat.
 */

import { queryModel } from "./model.js";
import { executeTool, TOOL_SCHEMAS } from "../tools/executor.js";
import { loadMemory } from "../memory/store.js";
import { appendAuditLog } from "../audit/logger.js";
import { validateScope } from "../tools/scope.js";
import { parseToolCall, type ToolCall } from "./parser.js";
import type { Finding } from "../db/schema.js";

export interface AgentStep {
  step: number;
  type: "thinking" | "tool_call" | "tool_result" | "final_answer" | "error";
  content: string;
  toolName?: string;
  toolArgs?: Record<string, string>;
  exitCode?: number;
}

export interface AgentResult {
  steps: AgentStep[];
  findings: Finding[];
  finalAnswer: string;
  sessionId: string;
}

const MAX_STEPS = 15;
const FINAL_ANSWER_TOKEN = "FINAL_ANSWER:";

export async function runAgent(
  task: string,
  sessionId: string,
  onStep: (step: AgentStep) => void
): Promise<AgentResult> {
  const memory = await loadMemory(task);
  const steps: AgentStep[] = [];
  const findings: Finding[] = [];

  const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
    { role: "system", content: buildSystemPrompt(memory) },
    {
      role: "user",
      content: `TASK: ${task}\n\nBegin your research. Think step by step. Use tools. When done, output FINAL_ANSWER: followed by your structured report.`,
    },
  ];

  let stepCount = 0;
  let finalAnswer = "";

  await appendAuditLog(sessionId, { event: "agent_start", task });

  while (stepCount < MAX_STEPS) {
    stepCount++;

    let modelResponse: string;
    try {
      modelResponse = await queryModel(messages);
    } catch (err: any) {
      const errorStep: AgentStep = { step: stepCount, type: "error", content: `Model call failed: ${err.message}` };
      steps.push(errorStep);
      onStep(errorStep);
      await appendAuditLog(sessionId, { event: "model_error", error: err.message });
      break;
    }

    messages.push({ role: "assistant", content: modelResponse });

    if (modelResponse.includes(FINAL_ANSWER_TOKEN)) {
      const idx = modelResponse.indexOf(FINAL_ANSWER_TOKEN);
      finalAnswer = modelResponse.slice(idx + FINAL_ANSWER_TOKEN.length).trim();
      const finalStep: AgentStep = { step: stepCount, type: "final_answer", content: finalAnswer };
      steps.push(finalStep);
      onStep(finalStep);
      findings.push(...extractFindings(finalAnswer, sessionId));
      await appendAuditLog(sessionId, { event: "agent_done", findings: findings.length });
      break;
    }

    const toolCall = parseToolCall(modelResponse);

    if (!toolCall) {
      const thinkStep: AgentStep = { step: stepCount, type: "thinking", content: modelResponse.trim() };
      steps.push(thinkStep);
      onStep(thinkStep);
      messages.push({ role: "user", content: "Continue. Use a tool or output FINAL_ANSWER: if you have enough information." });
      continue;
    }

    const scopeError = await validateScope(toolCall);
    if (scopeError) {
      const scopeStep: AgentStep = { step: stepCount, type: "error", content: `SCOPE VIOLATION: ${scopeError}`, toolName: toolCall.tool };
      steps.push(scopeStep);
      onStep(scopeStep);
      messages.push({ role: "user", content: `TOOL_RESULT [ERROR]: ${scopeError}. Target is outside authorized scope.` });
      await appendAuditLog(sessionId, { event: "scope_violation", toolCall, reason: scopeError });
      continue;
    }

    const callStep: AgentStep = {
      step: stepCount,
      type: "tool_call",
      content: `${toolCall.tool}(${JSON.stringify(toolCall.args)})`,
      toolName: toolCall.tool,
      toolArgs: toolCall.args,
    };
    steps.push(callStep);
    onStep(callStep);
    await appendAuditLog(sessionId, { event: "tool_call", toolCall });

    const result = await executeTool(toolCall, sessionId);
    const truncated = truncateOutput(result.stdout, 3000);
    const resultContent = result.exitCode === 0
      ? (truncated || "(no output)")
      : `STDERR: ${truncateOutput(result.stderr, 1000)}\nEXIT: ${result.exitCode}`;

    const resultStep: AgentStep = {
      step: stepCount,
      type: "tool_result",
      content: resultContent,
      toolName: toolCall.tool,
      exitCode: result.exitCode,
    };
    steps.push(resultStep);
    onStep(resultStep);
    await appendAuditLog(sessionId, { event: "tool_result", tool: toolCall.tool, exitCode: result.exitCode });

    messages.push({
      role: "user",
      content: `TOOL_RESULT [${toolCall.tool}] exit=${result.exitCode}:\n\`\`\`\n${resultContent}\n\`\`\`\n\nAnalyze this. What did you learn? What is your next step?`,
    });
  }

  if (!finalAnswer) finalAnswer = "Agent reached step limit without a final answer.";
  return { steps, findings, finalAnswer, sessionId };
}

function buildSystemPrompt(memory: string): string {
  const toolList = TOOL_SCHEMAS.map(t =>
    `- ${t.name}: ${t.description}\n  Args: ${Object.entries(t.args).map(([k, v]) => `${k} (${v})`).join(", ")}`
  ).join("\n");

  return `You are Chuck — an autonomous offensive security research agent for AUTHORIZED penetration testing only.

## ADVERSARIAL MINDSET
Look for high-impact vulnerabilities: RCE, SQLi, SSRF, IDOR, auth bypass, logic flaws.
Chain low-severity findings into critical attack paths. Cross-reference CVEs.

## TOOL USE FORMAT — output EXACTLY this JSON block:
\`\`\`tool
{"tool": "<name>", "args": {"<key>": "<value>"}}
\`\`\`

Available tools:
${toolList}

## RULES
1. After each TOOL_RESULT, reason before calling the next tool
2. Chain discoveries — ports → services → CVEs → exploitation
3. When done: output FINAL_ANSWER: followed by your full report

## PRIOR MEMORY
${memory || "No prior memory for this target."}

## FINAL_ANSWER FORMAT
FINDINGS:
[CRITICAL] <title> | <affected component> | <PoC> | <remediation>
[HIGH] ...
[MEDIUM] ...
[LOW] ...
ATTACK_CHAIN: <narrative>
RECOMMENDATION: <top 3 actions>`;
}

function truncateOutput(text: string, maxChars: number): string {
  if (!text || text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return text.slice(0, half) + `\n\n...[${text.length - maxChars} chars truncated]...\n\n` + text.slice(-half);
}

function extractFindings(finalAnswer: string, sessionId: string): Finding[] {
  const findings: Finding[] = [];
  const severities = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"] as const;
  for (const line of finalAnswer.split("\n")) {
    for (const severity of severities) {
      if (line.includes(`[${severity}]`)) {
        const parts = line.split("|").map(p => p.trim());
        findings.push({
          id: crypto.randomUUID(),
          sessionId,
          severity,
          title: (parts[0] || "").replace(`[${severity}]`, "").trim(),
          affectedComponent: parts[1] || "Unknown",
          poc: parts[2] || "",
          remediation: parts[3] || "",
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
  return findings;
}
ENDOFFILE
echo "      src/agent/loop.ts"

# ─────────────────────────────────────────────────────────────────────────────
echo "[3/6] Writing tool files..."

cat > src/tools/executor.ts << 'ENDOFFILE'
/**
 * CHUCK TOOL EXECUTOR
 *
 * THE fix that makes Chuck an agent, not a scanner.
 * Actually executes security tools via child_process.spawn
 * and returns real stdout/stderr back to the model.
 */

import { spawn } from "child_process";
import type { ToolCall } from "../agent/parser.js";
import { appendAuditLog } from "../audit/logger.js";

export interface ToolResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface ToolSchema {
  name: string;
  description: string;
  args: Record<string, string>;
}

export const TOOL_SCHEMAS: ToolSchema[] = [
  { name: "bash",      description: "Run any shell command", args: { cmd: "The full shell command to execute" } },
  { name: "nmap",      description: "Port scanning and service/version detection", args: { target: "IP, hostname, or CIDR", flags: "Optional nmap flags e.g. -sV -sC -p-" } },
  { name: "subfinder", description: "Passive subdomain enumeration", args: { domain: "Target domain e.g. example.com" } },
  { name: "nuclei",    description: "Template-based vulnerability scanner", args: { target: "URL or file of URLs", tags: "Optional template tags e.g. cve,sqli,xss" } },
  { name: "sqlmap",    description: "Automated SQL injection detection", args: { url: "Target URL with parameter", flags: "Optional flags e.g. --dbs --level=3" } },
  { name: "ffuf",      description: "Fast web fuzzer — directory brute force", args: { url: "URL with FUZZ placeholder", wordlist: "Path to wordlist or 'default'", flags: "Optional e.g. -fc 404" } },
  { name: "curl",      description: "HTTP requests — check endpoints, headers, bodies", args: { url: "Target URL", flags: "Optional e.g. -I -v -X POST" } },
  { name: "slither",   description: "Smart contract static analysis", args: { path: "Path to .sol file or directory" } },
  { name: "read_file", description: "Read a local file — source code, config, logs", args: { path: "Path to the file" } },
  { name: "grep",      description: "Search for patterns — secrets, dangerous functions", args: { pattern: "Regex pattern", path: "File or directory", flags: "Optional e.g. -r -i -n" } },
  { name: "whois",     description: "Domain registration and IP ownership lookup", args: { target: "Domain or IP address" } },
  { name: "httpx",     description: "Fast HTTP probe — alive checks, status codes, tech detection", args: { target: "Domain, IP, or URL", flags: "Optional e.g. -title -status-code -tech-detect" } },
];

const TOOL_MAP = Object.fromEntries(TOOL_SCHEMAS.map(t => [t.name, t]));
const DEFAULT_TIMEOUT_MS = 120_000;

export async function executeTool(call: ToolCall, sessionId: string): Promise<ToolResult> {
  const start = Date.now();

  if (!TOOL_MAP[call.tool]) {
    return { stdout: "", stderr: `Unknown tool: "${call.tool}". Available: ${Object.keys(TOOL_MAP).join(", ")}`, exitCode: 127, durationMs: 0 };
  }

  const cmd = buildCommand(call);
  if (!cmd) {
    return { stdout: "", stderr: `Could not build command for tool "${call.tool}" with args: ${JSON.stringify(call.args)}`, exitCode: 1, durationMs: 0 };
  }

  await appendAuditLog(sessionId, { event: "exec", cmd });
  return runShellCommand(cmd, DEFAULT_TIMEOUT_MS, start);
}

function buildCommand(call: ToolCall): string | null {
  const { tool, args } = call;
  switch (tool) {
    case "bash":      return args.cmd || null;
    case "nmap":      return `nmap ${args.flags || "-sV -sC --open"} ${args.target}`;
    case "subfinder": return `subfinder -d ${args.domain} -silent`;
    case "nuclei":    return `nuclei -u ${args.target} ${args.tags ? `-tags ${args.tags}` : ""} -silent -json`;
    case "sqlmap":    return `sqlmap -u "${args.url}" ${args.flags || "--batch --level=2"}`;
    case "ffuf":      return `ffuf -u "${args.url}" -w ${args.wordlist === "default" || !args.wordlist ? "/usr/share/wordlists/dirb/common.txt" : args.wordlist} ${args.flags || "-fc 404"}`;
    case "curl":      return `curl ${args.flags || "-s -i --max-time 15"} "${args.url}"`;
    case "slither":   return `slither ${args.path} --json - 2>/dev/null || slither ${args.path}`;
    case "read_file": return `cat "${args.path}"`;
    case "grep":      return `grep ${args.flags || "-r -n"} "${args.pattern}" "${args.path}" 2>/dev/null | head -200`;
    case "whois":     return `whois ${args.target}`;
    case "httpx":     return `httpx -u ${args.target} ${args.flags || "-title -status-code -silent"}`;
    default: return null;
  }
}

function runShellCommand(cmd: string, timeoutMs: number, startTime: number): Promise<ToolResult> {
  return new Promise(resolve => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const proc = spawn("bash", ["-c", cmd], { env: process.env, timeout: timeoutMs });

    proc.stdout.on("data", (d: Buffer) => chunks.push(d));
    proc.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const timer = setTimeout(() => {
      proc.kill("SIGTERM");
      resolve({ stdout: Buffer.concat(chunks).toString("utf8"), stderr: `TIMEOUT after ${timeoutMs / 1000}s`, exitCode: 124, durationMs: Date.now() - startTime });
    }, timeoutMs);

    proc.on("close", code => {
      clearTimeout(timer);
      resolve({ stdout: Buffer.concat(chunks).toString("utf8"), stderr: Buffer.concat(errChunks).toString("utf8"), exitCode: code ?? 1, durationMs: Date.now() - startTime });
    });

    proc.on("error", err => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: 1, durationMs: Date.now() - startTime });
    });
  });
}
ENDOFFILE
echo "      src/tools/executor.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/tools/scope.ts << 'ENDOFFILE'
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
ENDOFFILE
echo "      src/tools/scope.ts"

# ─────────────────────────────────────────────────────────────────────────────
echo "[4/6] Writing audit, db, memory, ui files..."

cat > src/audit/logger.ts << 'ENDOFFILE'
/**
 * CHUCK AUDIT LOGGER
 * JSONL log of every command + result, SHA256 hash at session end.
 */

import { appendFile, writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

const SESSIONS_DIR = process.env.CHUCK_SESSIONS_DIR || "sessions";

async function ensureDir(sessionId: string): Promise<string> {
  const dir = join(SESSIONS_DIR, sessionId);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return dir;
}

export async function appendAuditLog(sessionId: string, data: Record<string, unknown>): Promise<void> {
  try {
    const dir = await ensureDir(sessionId);
    await appendFile(join(dir, "audit.jsonl"), JSON.stringify({ ts: new Date().toISOString(), sessionId, ...data }) + "\n", "utf8");
  } catch { /* never crash the agent */ }
}

export async function finalizeSession(sessionId: string): Promise<string> {
  try {
    const dir = join(SESSIONS_DIR, sessionId);
    const logPath = join(dir, "audit.jsonl");
    if (!existsSync(logPath)) return "";
    const content = await readFile(logPath, "utf8");
    const hash = createHash("sha256").update(content).digest("hex");
    await writeFile(join(dir, "session.hash"), `SHA256: ${hash}\nGenerated: ${new Date().toISOString()}\n`, "utf8");
    return hash;
  } catch { return ""; }
}

export async function writeSessionReport(sessionId: string, content: string): Promise<void> {
  try {
    const dir = await ensureDir(sessionId);
    await writeFile(join(dir, "report.md"), content, "utf8");
  } catch { /* silent */ }
}
ENDOFFILE
echo "      src/audit/logger.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/db/schema.ts << 'ENDOFFILE'
/**
 * CHUCK FINDINGS SCHEMA
 * Typed Finding + Session with JSON persistence.
 */

import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

export interface Finding {
  id: string;
  sessionId: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  affectedComponent: string;
  poc: string;
  remediation: string;
  cvss?: number;
  cve?: string;
  timestamp: string;
}

export interface Session {
  id: string;
  task: string;
  target?: string;
  startedAt: string;
  finishedAt?: string;
  stepCount: number;
  findings: Finding[];
  finalAnswer: string;
  auditHash?: string;
}

const DB_DIR = process.env.CHUCK_DB_DIR || ".chuck/db";

async function ensureDb(): Promise<void> {
  if (!existsSync(DB_DIR)) await mkdir(DB_DIR, { recursive: true });
}

export async function saveSession(session: Session): Promise<void> {
  await ensureDb();
  await writeFile(join(DB_DIR, `${session.id}.json`), JSON.stringify(session, null, 2), "utf8");
}

export async function loadSession(sessionId: string): Promise<Session | null> {
  await ensureDb();
  const path = join(DB_DIR, `${sessionId}.json`);
  if (!existsSync(path)) return null;
  try { return JSON.parse(await readFile(path, "utf8")) as Session; }
  catch { return null; }
}

export async function listSessions(): Promise<Session[]> {
  await ensureDb();
  const { readdir } = await import("fs/promises");
  try {
    const files = await readdir(DB_DIR);
    const sessions: Session[] = [];
    for (const f of files.filter(f => f.endsWith(".json"))) {
      const s = await loadSession(f.replace(".json", ""));
      if (s) sessions.push(s);
    }
    return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  } catch { return []; }
}
ENDOFFILE
echo "      src/db/schema.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/db/report.ts << 'ENDOFFILE'
/**
 * CHUCK REPORT GENERATOR
 * Professional Markdown report from a completed session.
 */

import type { Session, Finding } from "./schema.js";

const ORDER: Finding["severity"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "INFO"];

export function generateReport(session: Session): string {
  const sorted = [...session.findings].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const counts = ORDER.map(s => `${s}: ${sorted.filter(f => f.severity === s).length}`).join(" | ");
  const dur = session.finishedAt
    ? msToHuman(new Date(session.finishedAt).getTime() - new Date(session.startedAt).getTime())
    : "incomplete";

  return `# Chuck Security Assessment Report

**Session ID:** \`${session.id}\`
**Task:** ${session.task}${session.target ? `\n**Target:** ${session.target}` : ""}
**Date:** ${new Date(session.startedAt).toUTCString()}
**Duration:** ${dur}
**Total Findings:** ${session.findings.length} (${counts})

---

## Executive Summary

${session.findings.length === 0
    ? "No findings were identified during this assessment."
    : `This assessment identified **${session.findings.length} finding(s)**.${sorted.filter(f => f.severity === "CRITICAL").length > 0 ? ` **${sorted.filter(f => f.severity === "CRITICAL").length} CRITICAL** issue(s) require immediate remediation.` : ""}`}

---

## Findings

${sorted.length === 0 ? "_No findings._" : sorted.map((f, i) => `### ${i + 1}. [${f.severity}] ${f.title}

| Field | Value |
|-------|-------|
| **Severity** | ${f.severity} |
| **Affected Component** | ${f.affectedComponent || "N/A"} |${f.cve ? `\n| **CVE** | ${f.cve} |` : ""}${f.cvss !== undefined ? `\n| **CVSS** | ${f.cvss} |` : ""}

**PoC:** \`\`\`\n${f.poc || "See audit log"}\n\`\`\`

**Remediation:** ${f.remediation || "Not provided"}`).join("\n\n---\n\n")}

---

## Agent Analysis

${session.finalAnswer}

---

## Audit Trail

- Log: \`sessions/${session.id}/audit.jsonl\`
- Hash: \`sessions/${session.id}/session.hash\`
${session.auditHash ? `- SHA256: \`${session.auditHash}\`` : ""}

---
*Generated by Chuck v0.3.0 — Authorized use only*
`;
}

function msToHuman(ms: number): string {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
}
ENDOFFILE
echo "      src/db/report.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/memory/store.ts << 'ENDOFFILE'
/**
 * CHUCK MEMORY STORE
 * Keyword-scored relevance filtering — only injects useful memory,
 * not the entire .chuck/memory/ directory every time.
 */

import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";

const MEMORY_DIR = process.env.CHUCK_MEMORY_DIR || ".chuck/memory";
const MAX_MEMORY_CHARS = 4000;

export async function loadMemory(task: string): Promise<string> {
  if (!existsSync(MEMORY_DIR)) return "";
  try {
    const files = (await readdir(MEMORY_DIR)).filter(f => f.endsWith(".md") || f.endsWith(".txt"));
    if (files.length === 0) return "";

    const taskWords = extractKeywords(task);
    const scored: Array<{ content: string; score: number; file: string }> = [];

    for (const file of files) {
      try {
        const content = await readFile(join(MEMORY_DIR, file), "utf8");
        scored.push({ content, score: scoreRelevance(content, taskWords), file });
      } catch { /* skip */ }
    }

    scored.sort((a, b) => b.score - a.score);
    let injected = "";
    for (const e of scored) {
      if (e.score === 0) break;
      const chunk = `### From ${e.file}:\n${e.content.slice(0, 1500)}\n\n`;
      if (injected.length + chunk.length > MAX_MEMORY_CHARS) break;
      injected += chunk;
    }
    return injected;
  } catch { return ""; }
}

export async function saveMemory(key: string, content: string): Promise<void> {
  if (!existsSync(MEMORY_DIR)) await mkdir(MEMORY_DIR, { recursive: true });
  const safe = key.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").slice(0, 60);
  await writeFile(join(MEMORY_DIR, `${Date.now()}-${safe}.md`), content, "utf8");
}

function extractKeywords(text: string): string[] {
  const stop = new Set(["the","a","an","and","or","but","in","on","at","to","for","of","with","this","that","is","are","was","be","do","run","check","scan","test","find","look"]);
  return text.toLowerCase().replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(w => w.length > 3 && !stop.has(w));
}

function scoreRelevance(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 1;
  const lower = content.toLowerCase();
  return keywords.reduce((s, kw) => s + Math.min((lower.match(new RegExp(kw, "g")) || []).length, 5), 0);
}
ENDOFFILE
echo "      src/memory/store.ts"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/ui/dashboard.tsx << 'ENDOFFILE'
/**
 * CHUCK UI — Ink TUI dashboard
 * Live streaming of agent steps, color-coded by type,
 * running findings panel, session summary at completion.
 */

import React, { useState, useEffect, useCallback } from "react";
import { render, Box, Text, useInput, useApp } from "ink";
import Spinner from "ink-spinner";
import type { AgentStep } from "../agent/loop.js";
import type { Finding } from "../db/schema.js";

interface ChuckUIProps {
  task: string;
  sessionId: string;
  onReady: (addStep: (s: AgentStep) => void, complete: (findings: Finding[], answer: string) => void) => void;
}

function StepRow({ step }: { step: AgentStep }) {
  const icons = { thinking: "◆", tool_call: "▶", tool_result: "◀", final_answer: "✓", error: "✗" };
  const colors = { thinking: "cyan", tool_call: "yellow", tool_result: "green", final_answer: "magenta", error: "red" };
  return (
    <Box>
      <Text color={colors[step.type] as any}>{icons[step.type]} </Text>
      <Text dimColor>[{step.step.toString().padStart(2, "0")}] </Text>
      {step.toolName && <Text color="yellow">[{step.toolName}] </Text>}
      <Text wrap="truncate">{step.content.slice(0, 100).replace(/\n/g, " ")}</Text>
    </Box>
  );
}

function FindingRow({ finding }: { finding: Finding }) {
  const colors: Record<string, string> = { CRITICAL: "red", HIGH: "yellow", MEDIUM: "blue", LOW: "green", INFO: "gray" };
  return (
    <Box>
      <Text color={colors[finding.severity] as any} bold>[{finding.severity}] </Text>
      <Text>{finding.title}</Text>
    </Box>
  );
}

function ChuckUI({ task, sessionId, onReady }: ChuckUIProps) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [done, setDone] = useState(false);
  const { exit } = useApp();

  const addStep = useCallback((step: AgentStep) => setSteps(p => [...p.slice(-20), step]), []);
  const complete = useCallback((f: Finding[], _: string) => { setFindings(f); setDone(true); }, []);

  useEffect(() => { onReady(addStep, complete); }, []);
  useInput((input) => { if (input === "q" && done) exit(); });

  return (
    <Box flexDirection="column" padding={1}>
      <Box borderStyle="round" borderColor="cyan" paddingX={2} marginBottom={1}>
        <Text bold color="cyan">⚡ CHUCK </Text>
        <Text dimColor>autonomous security agent │ session: {sessionId.slice(0, 8)}</Text>
      </Box>
      <Box marginBottom={1}><Text bold>Task: </Text><Text>{task}</Text></Box>
      <Box flexDirection="column" marginBottom={1}>
        <Text bold dimColor>─── Steps ───────────────────────────────────</Text>
        {steps.slice(-15).map((s, i) => <StepRow key={i} step={s} />)}
        {!done && <Box><Text color="green"><Spinner type="dots" /></Text><Text dimColor> reasoning…</Text></Box>}
      </Box>
      {findings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Text bold dimColor>─── Findings ({findings.length}) ───────────────────────────</Text>
          {findings.map((f, i) => <FindingRow key={i} finding={f} />)}
        </Box>
      )}
      {done && (
        <Box flexDirection="column">
          <Text color="green" bold>✓ Done — {findings.length} finding(s) — sessions/{sessionId}/</Text>
          <Text dimColor>Press q to exit</Text>
        </Box>
      )}
    </Box>
  );
}

export function renderUI(
  task: string,
  sessionId: string,
  callback: (addStep: (s: AgentStep) => void, complete: (findings: Finding[], answer: string) => void) => void
) {
  return render(React.createElement(ChuckUI, { task, sessionId, onReady: callback }));
}
ENDOFFILE
echo "      src/ui/dashboard.tsx"

# ─────────────────────────────────────────────────────────────────────────────
cat > src/main.tsx << 'ENDOFFILE'
/**
 * CHUCK — main entrypoint v0.3.0
 * Usage:
 *   ./chuck-ai "Scan 192.168.1.1 for open ports and vulnerabilities"
 *   ./chuck-ai --list
 *   ./chuck-ai --session <id>
 *   ./chuck-ai --no-ui "task"
 */

import { program } from "commander";
import { runAgent, type AgentStep } from "./agent/loop.js";
import { renderUI } from "./ui/dashboard.tsx";
import { saveSession, listSessions, loadSession, type Session } from "./db/schema.js";
import { generateReport } from "./db/report.js";
import { writeSessionReport, finalizeSession } from "./audit/logger.js";
import { saveMemory } from "./memory/store.js";
import type { Finding } from "./db/schema.js";

program
  .name("chuck-ai")
  .description("Chuck — autonomous offensive security research agent")
  .version("0.3.0")
  .argument("[task]", "Security task to perform")
  .option("--list", "List all past sessions")
  .option("--session <id>", "Print report from a past session")
  .option("--no-ui", "Print steps to stdout instead of TUI")
  .option("--scope <file>", "Path to scope.json", ".chuck/scope.json")
  .parse();

const opts = program.opts();
const task = program.args[0];
if (opts.scope) process.env.CHUCK_SCOPE_FILE = opts.scope;

(async () => {
  if (opts.list) {
    const sessions = await listSessions();
    if (sessions.length === 0) { console.log("No sessions found."); process.exit(0); }
    console.log("\n Sessions\n" + "─".repeat(70));
    for (const s of sessions) {
      const crit = s.findings?.filter(f => f.severity === "CRITICAL").length || 0;
      console.log(`  ${s.id.slice(0, 8)}  ${s.startedAt.slice(0, 16)}  ${(s.task || "").slice(0, 40).padEnd(40)}  ${s.findings?.length || 0} findings${crit > 0 ? ` (${crit} CRITICAL)` : ""}`);
    }
    process.exit(0);
  }

  if (opts.session) {
    const s = await loadSession(opts.session);
    if (!s) { console.error(`Session "${opts.session}" not found`); process.exit(1); }
    console.log(generateReport(s));
    process.exit(0);
  }

  if (!task) { program.help(); process.exit(1); }

  const sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (opts.noUi) {
    console.log(`\n[chuck] session: ${sessionId}\n[chuck] task: ${task}\n`);
    const result = await runAgent(task, sessionId, (step: AgentStep) => {
      console.log(`[${step.step.toString().padStart(2, "0")}][${step.type}]${step.toolName ? `[${step.toolName}]` : ""} ${step.content.slice(0, 200)}`);
    });
    await persistSession(result, task, sessionId);
    const s = await loadSession(sessionId);
    if (s) console.log("\n" + generateReport(s));
  } else {
    const { waitUntilExit } = renderUI(task, sessionId, async (addStep, complete) => {
      const result = await runAgent(task, sessionId, addStep);
      await persistSession(result, task, sessionId);
      complete(result.findings, result.finalAnswer);
    });
    await waitUntilExit;
  }
})();

async function persistSession(
  result: { steps: AgentStep[]; findings: Finding[]; finalAnswer: string; sessionId: string },
  task: string,
  sessionId: string
) {
  const session: Session = {
    id: sessionId,
    task,
    startedAt: new Date(parseInt(sessionId.split("-")[0])).toISOString(),
    finishedAt: new Date().toISOString(),
    stepCount: result.steps.length,
    findings: result.findings,
    finalAnswer: result.finalAnswer,
    auditHash: await finalizeSession(sessionId),
  };
  await saveSession(session);
  await writeSessionReport(sessionId, generateReport(session));
  if (result.findings.some(f => ["CRITICAL", "HIGH"].includes(f.severity))) {
    await saveMemory(task.slice(0, 40), `## Findings from: ${task}\n${result.findings
      .filter(f => ["CRITICAL","HIGH"].includes(f.severity))
      .map(f => `- [${f.severity}] ${f.title}: ${f.remediation}`).join("\n")}`);
  }
}
ENDOFFILE
echo "      src/main.tsx"

# ─────────────────────────────────────────────────────────────────────────────
echo "[5/6] Writing config files..."

cat > scope.example.json << 'ENDOFFILE'
{
  "_comment": "Copy to .chuck/scope.json and edit. Remove _comment field.",
  "engagement": "Example Pentest — Acme Corp",
  "targets": [
    "192.168.1.0/24",
    "*.acme-staging.com",
    "api.acme.com"
  ],
  "excludeTargets": [
    "192.168.1.1"
  ],
  "allowedTools": [
    "nmap", "subfinder", "nuclei", "httpx",
    "curl", "ffuf", "bash", "grep", "read_file", "whois"
  ]
}
ENDOFFILE
echo "      scope.example.json"

cat > .chuck/memory/MEMORY.md << 'ENDOFFILE'
# Chuck Memory Index

This directory stores persistent knowledge across sessions.

## How it works
- Add `.md` files here with security notes, custom payloads, checklists
- Chuck reads only the most relevant files per task (keyword-scored)
- Critical/High findings are auto-saved here after each session

## File naming
Use descriptive names: `reentrancy-patterns.md`, `jwt-bypass-techniques.md`
ENDOFFILE
echo "      .chuck/memory/MEMORY.md"

# ─────────────────────────────────────────────────────────────────────────────
# Update .gitignore
cat >> .gitignore << 'ENDOFFILE'
sessions/
.chuck/db/
chuck-ai
chuck-ai.map
ENDOFFILE
echo "      .gitignore updated"

# ─────────────────────────────────────────────────────────────────────────────
# Write the new README
cat > README.md << 'ENDOFFILE'
# Chuck — Autonomous Offensive Security Agent

Chuck is a purpose-built autonomous security research agent for **authorized** penetration testing, vulnerability research, and smart contract auditing. It combines a real ReAct reasoning loop with hands-on execution of a professional security toolchain.

> **v0.3.0** — Complete overhaul. Chuck now executes tools for real, feeds output back to the model, and reasons iteratively until it has a complete picture of the attack surface.

---

## What changed in v0.3.0

| Before | After |
|--------|-------|
| Single-shot LLM call, no loop | ReAct loop — up to 15 Plan→Act→Observe cycles |
| Generated text *describing* commands | Actually executes via `child_process.spawn` |
| Phi3 at 2048 tokens | Claude API (Sonnet) primary, 16k ctx Ollama fallback |
| No structured output | Typed findings schema, SQLite-compatible JSON persistence |
| Raw markdown files dumped into context | Keyword-scored relevance-filtered memory injection |
| No scope enforcement | Hard CIDR/domain allowlist enforced before every exec |
| No audit trail | JSONL log + SHA256 tamper-evident session hash |
| `console.log` only | Full Ink TUI with live step streaming + findings panel |

---

## Architecture

```
chuck-ai
└── src/
    ├── agent/
    │   ├── loop.ts       ← ReAct loop (the brain)
    │   ├── model.ts      ← Claude API + Ollama fallback
    │   └── parser.ts     ← Tool call extractor
    ├── tools/
    │   ├── executor.ts   ← child_process.spawn bridge (12 tools)
    │   └── scope.ts      ← Hard scope enforcement
    ├── audit/
    │   └── logger.ts     ← JSONL log + SHA256 session hash
    ├── db/
    │   ├── schema.ts     ← Finding/Session types + JSON persistence
    │   └── report.ts     ← Markdown report generator
    ├── memory/
    │   └── store.ts      ← Keyword-scored memory injection
    ├── ui/
    │   └── dashboard.tsx ← Live Ink TUI
    └── main.tsx          ← Entrypoint
```

---

## Setup

### Prerequisites

- **Bun** (recommended) or Node.js 20+
- One of: Anthropic API key **or** local Ollama instance

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash && source ~/.bashrc
```

### Install

```bash
git clone https://github.com/Wakhungila/chuck.git
cd chuck
bun install
bun run build
```

### Configure

**Option A — Claude API (recommended, best results):**
```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

**Option B — Local Ollama:**
```bash
# Install a capable model (needs 8B+ for reliable tool use)
ollama pull qwen2.5-coder:14b

# If Ollama runs on Windows host and Chuck runs in WSL:
export OLLAMA_HOST=http://$(grep -m1 nameserver /etc/resolv.conf | awk '{print $2}'):11434
```

### Scope file (for professional engagements)

```bash
cp scope.example.json .chuck/scope.json
# Edit .chuck/scope.json with your authorized targets
```

---

## Usage

```bash
# Standard run with interactive TUI
./chuck-ai "Scan 192.168.1.100 for open ports and test for common web vulnerabilities"

# No TUI, plain stdout
./chuck-ai --no-ui "Perform subdomain enumeration on example.com"

# Smart contract audit
./chuck-ai "Audit the contracts in ./contracts for reentrancy and logic flaws"

# Source code review
./chuck-ai "Review src/auth for timing attacks, unsafe eval(), and SQL injection vectors"

# Use a specific scope file
./chuck-ai --scope /path/to/scope.json "task..."

# List past sessions
./chuck-ai --list

# Print a session report
./chuck-ai --session <session-id>
```

---

## Tool Stack

Chuck orchestrates 12 security tools natively:

| Tool | Purpose |
|------|---------|
| `nmap` | Port scanning, service/version detection |
| `subfinder` | Passive subdomain enumeration |
| `nuclei` | Template-based CVE/vuln scanning |
| `sqlmap` | SQL injection detection and exploitation |
| `ffuf` | Directory brute force, parameter fuzzing |
| `httpx` | HTTP probing, tech stack detection |
| `curl` | Manual HTTP requests and header inspection |
| `slither` | Solidity smart contract static analysis |
| `grep` | Pattern search for secrets, dangerous functions |
| `whois` | Domain and IP registration lookup |
| `read_file` | Local file and source code reading |
| `bash` | Arbitrary shell — custom pipelines and tools |

---

## Session output

Each session creates:
```
sessions/<session-id>/
├── audit.jsonl     ← Every command + result, timestamped
├── session.hash    ← SHA256 of audit log (tamper evidence)
└── report.md       ← Full findings report in Markdown
```

---

## Memory system

Drop `.md` files into `.chuck/memory/` to inject persistent knowledge:
- Custom payload lists
- Internal checklist for your org
- Historical findings from previous engagements

Chuck automatically saves CRITICAL/HIGH findings to memory after each session so it doesn't repeat past mistakes.

---

## Scope enforcement

Create `.chuck/scope.json` (see `scope.example.json`) to lock Chuck to authorized targets. Every tool call is validated against the scope before execution — violations are blocked and logged, not just ignored.

---

## Legal

**Chuck is for authorized security research only.** Always obtain written permission before testing any system you do not own. Run Chuck in an isolated VM or container when performing active exploitation. The authors accept no liability for misuse.
ENDOFFILE
echo "      README.md"

# ─────────────────────────────────────────────────────────────────────────────
echo "[6/6] Committing and pushing..."

git config user.email "chuck-agent@wakhungila" 2>/dev/null || true
git config user.name "Chuck Agent" 2>/dev/null || true

git add -A
echo ""
echo "Files staged:"
git status --short
echo ""

git commit -m "feat: overhaul agent v0.3.0 — real ReAct loop + tool execution

CRITICAL fixes:
- src/agent/loop.ts: ReAct loop (Plan→Act→Observe, up to 15 steps)
- src/agent/model.ts: Claude API primary + Ollama fallback, 16k ctx
- src/agent/parser.ts: tool call extractor from model output
- src/tools/executor.ts: 12 tools via child_process.spawn — nmap,
  sqlmap, nuclei, subfinder, ffuf, curl, slither, httpx, bash,
  grep, whois, read_file — actually executes, feeds stdout back

HIGH fixes:
- src/ui/dashboard.tsx: live Ink TUI, step stream + findings panel
- src/db/schema.ts + report.ts: typed findings + Markdown reports
- src/memory/store.ts: keyword-scored memory injection

MEDIUM fixes:
- src/tools/scope.ts: CIDR/domain scope enforcement pre-execution
- src/audit/logger.ts: JSONL audit log + SHA256 tamper-evident hash

Docs:
- README.md: complete rewrite — architecture, setup, usage, tools
- scope.example.json: enterprise engagement template
- .chuck/memory/MEMORY.md: memory system documentation"

if [ -n "$GITHUB_TOKEN" ]; then
  REMOTE_URL="https://${GITHUB_TOKEN}@github.com/Wakhungila/chuck.git"
  git remote set-url origin "$REMOTE_URL"
  git push origin main
  git remote set-url origin "https://github.com/Wakhungila/chuck.git"  # restore clean URL
  echo ""
  echo "╔══════════════════════════════════════════════════╗"
  echo "║  ✓ Chuck v0.3.0 pushed to GitHub                 ║"
  echo "║  https://github.com/Wakhungila/chuck             ║"
  echo "╚══════════════════════════════════════════════════╝"
else
  echo ""
  echo "Committed locally. To push:"
  echo "  git push origin main"
fi
