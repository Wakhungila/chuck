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
