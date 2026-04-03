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
