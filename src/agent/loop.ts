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
