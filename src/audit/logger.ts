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
