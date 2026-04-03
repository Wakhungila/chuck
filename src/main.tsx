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
