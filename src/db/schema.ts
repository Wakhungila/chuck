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
