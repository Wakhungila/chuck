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
