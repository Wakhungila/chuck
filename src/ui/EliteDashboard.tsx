/**
 * CHUCK ELITE CLI — Modern Terminal Interface
 * 
 * Premium terminal UI inspired by claudecli with:
 * - Real-time streaming output
 * - Interactive command palette
 * - Rich markdown rendering
 * - Session management
 * - Multi-panel dashboard
 */

import React, { useState, useEffect, useCallback } from 'react';
import { render, Box, Text, useInput, useApp, Static } from 'ink';
import Spinner from 'ink-spinner';
import chalk from 'chalk';
import { AgentStep } from '../agent/loop.js';
import { Finding } from '../db/schema.js';
import { AttackChain, ValidationGate } from '../agents/MultiAgentOrchestrator.js';

interface EliteUIProps {
  task: string;
  sessionId: string;
  onReady: (callbacks: UICallbacks) => void;
}

interface UICallbacks {
  addStep: (step: AgentStep) => void;
  addFinding: (finding: Finding) => void;
  updateAttackChain: (chain: AttackChain) => void;
  showApprovalGate: (gate: ValidationGate) => void;
  complete: (summary: MissionSummary) => void;
}

interface MissionSummary {
  findings: Finding[];
  attackChains: AttackChain[];
  duration: number;
  totalSteps: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: 'red',
  HIGH: 'yellow',
  MEDIUM: 'blue',
  LOW: 'green',
  INFO: 'gray'
};

const STEP_ICONS: Record<string, string> = {
  thinking: '💭',
  tool_call: '⚡',
  tool_result: '📊',
  final_answer: '✅',
  error: '❌'
};

function StepIndicator({ step, isActive }: { step: AgentStep; isActive: boolean }) {
  const icon = STEP_ICONS[step.type] || '•';
  const color = SEVERITY_COLORS[step.type] || 'white';
  
  return (
    <Box paddingY={0}>
      <Text>{icon} </Text>
      <Text dimColor>[{String(step.step).padStart(2, '0')}] </Text>
      {step.toolName && (
        <Text color="cyan" bold>[{step.toolName}] </Text>
      )}
      <Text color={isActive ? 'white' : 'gray'} wrap="truncate">
        {step.content.slice(0, 120).replace(/\n/g, ' ')}
      </Text>
    </Box>
  );
}

function FindingCard({ finding, expanded = false }: { finding: Finding; expanded?: boolean }) {
  const severityColor = SEVERITY_COLORS[finding.severity] || 'white';
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={severityColor} paddingX={1} marginY={1}>
      <Box>
        <Text backgroundColor={severityColor} color="black" bold> {finding.severity} </Text>
        <Text bold> {finding.title}</Text>
      </Box>
      {expanded && (
        <>
          <Box marginTop={1}>
            <Text dimColor>Affected: </Text>
            <Text>{finding.affectedComponent}</Text>
          </Box>
          {finding.poc && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>PoC:</Text>
              <Text color="green">{finding.poc}</Text>
            </Box>
          )}
          {finding.remediation && (
            <Box marginTop={1} flexDirection="column">
              <Text dimColor>Remediation:</Text>
              <Text color="yellow">{finding.remediation}</Text>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}

function AttackChainPanel({ chain }: { chain: AttackChain }) {
  const impactColor = SEVERITY_COLORS[chain.impact] || 'white';
  const statusIcon = chain.status === 'validated' ? '✓' : chain.status === 'partially_validated' ? '~' : '?';
  
  return (
    <Box flexDirection="column" borderStyle="single" borderColor={impactColor} paddingX={1} marginY={1}>
      <Box>
        <Text color={impactColor} bold>⛓️  {chain.name}</Text>
        <Text dimColor> [{statusIcon}]</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Impact: </Text>
        <Text color={impactColor} bold>{chain.impact}</Text>
        <Text dimColor> │ Probability: </Text>
        <Text color="cyan">{(chain.probability * 100).toFixed(1)}%</Text>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>MITRE Techniques: </Text>
        <Text color="magenta">{chain.mitreTechniques.join(', ')}</Text>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Steps:</Text>
        {chain.steps.map((step, i) => (
          <Box key={i} paddingLeft={2}>
            <Text color="gray">{i + 1}. </Text>
            <Text>{step.description}</Text>
            <Text dimColor> ({step.technique})</Text>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function ApprovalGateModal({ gate, onApprove, onDeny }: { 
  gate: ValidationGate; 
  onApprove: () => void; 
  onDeny: () => void;
}) {
  const [selected, setSelected] = useState<'approve' | 'deny'>('approve');
  
  useInput((input) => {
    if (input === 'left') setSelected('deny');
    if (input === 'right') setSelected('approve');
    if (input === 'return') selected === 'approve' ? onApprove() : onDeny();
  });
  
  const riskColors = { low: 'green', medium: 'yellow', high: 'red', critical: 'redBright' };
  const riskColor = riskColors[gate.riskLevel];
  
  return (
    <Box flexDirection="column" borderStyle="double" borderColor={riskColor} padding={2}>
      <Text bold backgroundColor={riskColor} color="black"> ⚠️  APPROVAL REQUIRED </Text>
      
      <Box marginTop={2} flexDirection="column">
        <Text dimColor>Action:</Text>
        <Text bold>{gate.action}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text dimColor>Risk Level: </Text>
        <Text color={riskColor} bold uppercase>{gate.riskLevel.toUpperCase()}</Text>
      </Box>
      
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>Rationale:</Text>
        <Text>{gate.rationale}</Text>
      </Box>
      
      <Box marginTop={2}>
        <Text backgroundColor={selected === 'approve' ? 'green' : undefined} color={selected === 'approve' ? 'black' : 'green'}>
          {' '}[A]pprove{' '}
        </Text>
        <Text backgroundColor={selected === 'deny' ? 'red' : undefined} color={selected === 'deny' ? 'black' : 'red'}>
          {' '}[D]eny{' '}
        </Text>
      </Box>
    </Box>
  );
}

function StatusBar({ activeAgents, progress }: { activeAgents: string[]; progress: number }) {
  return (
    <Box borderTop={1} borderColor="gray" paddingTop={1} marginTop={1}>
      <Box flexGrow={1}>
        {activeAgents.length > 0 && (
          <>
            <Text dimColor>Active Agents: </Text>
            <Text color="cyan">{activeAgents.join(', ')}</Text>
          </>
        )}
      </Box>
      <Box>
        <Text dimColor>Progress: </Text>
        <Text color="green">{progress.toFixed(1)}%</Text>
      </Box>
    </Box>
  );
}

function ChuckEliteUI({ task, sessionId, onReady }: EliteUIProps) {
  const { exit } = useApp();
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [attackChains, setAttackChains] = useState<AttackChain[]>([]);
  const [pendingGate, setPendingGate] = useState<ValidationGate | null>(null);
  const [done, setDone] = useState(false);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [expandedFinding, setExpandedFinding] = useState<number | null>(null);

  const addStep = useCallback((step: AgentStep) => {
    setSteps(prev => [...prev.slice(-50), step]);
  }, []);

  const addFinding = useCallback((finding: Finding) => {
    setFindings(prev => [...prev, finding]);
  }, []);

  const updateAttackChain = useCallback((chain: AttackChain) => {
    setAttackChains(prev => {
      const idx = prev.findIndex(c => c.id === chain.id);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = chain;
        return updated;
      }
      return [...prev, chain];
    });
  }, []);

  const showApprovalGate = useCallback((gate: ValidationGate) => {
    setPendingGate(gate);
  }, []);

  const complete = useCallback((summary: MissionSummary) => {
    setDone(true);
  }, []);

  useEffect(() => {
    onReady({ addStep, addFinding, updateAttackChain, showApprovalGate, complete });
  }, []);

  useInput((input) => {
    if (input === 'q' && done) exit();
    if (input === 'h') setShowHelp(p => !p);
    if (input === 'e' && findings.length > 0) {
      setExpandedFinding(prev => prev === null ? 0 : null);
    }
    if (input === '1' && pendingGate) {
      setPendingGate(null); // Simulate approval
    }
    if (input === '2' && pendingGate) {
      setPendingGate(null); // Simulate denial
    }
  });

  const progress = steps.length > 0 ? Math.min(100, (steps.length / 100) * 100) : 0;

  return (
    <Box flexDirection="column" padding={1}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" paddingX={2} marginBottom={1}>
        <Text bold color="cyan" backgroundColor="black"> ⚡ CHUCK ELITE </Text>
        <Text dimColor> │ Autonomous Security Agent │ </Text>
        <Text dimColor>Session: {sessionId.slice(0, 8)}</Text>
      </Box>

      {/* Task */}
      <Box marginBottom={1} flexDirection="column">
        <Text bold>Mission: </Text>
        <Text italic wrap="wrap">{task}</Text>
      </Box>

      {/* Pending Approval Gate */}
      {pendingGate && (
        <ApprovalGateModal 
          gate={pendingGate}
          onApprove={() => setPendingGate(null)}
          onDeny={() => setPendingGate(null)}
        />
      )}

      {/* Main Content Area */}
      <Box flexDirection="column" marginBottom={1}>
        <Box>
          <Text bold dimColor>━━━ Activity Log ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
          <Text dimColor> ({steps.length} steps)</Text>
        </Box>
        
        <Box flexDirection="column" height={12}>
          {steps.slice(-10).map((s, i) => (
            <StepIndicator 
              key={i} 
              step={s} 
              isActive={i === steps.slice(-10).length - 1}
            />
          ))}
          {!done && !pendingGate && (
            <Box>
              <Text color="green"><Spinner type="dots" /></Text>
              <Text dimColor> Processing...</Text>
            </Box>
          )}
        </Box>
      </Box>

      {/* Findings Panel */}
      {findings.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold dimColor>━━━ Findings ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
            <Text dimColor> ({findings.length} total)</Text>
          </Box>
          
          {findings.slice(0, 3).map((f, i) => (
            <FindingCard 
              key={i} 
              finding={f} 
              expanded={i === expandedFinding}
            />
          ))}
        </Box>
      )}

      {/* Attack Chains Panel */}
      {attackChains.length > 0 && (
        <Box flexDirection="column" marginBottom={1}>
          <Box>
            <Text bold dimColor>━━━ Attack Chains ━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
            <Text dimColor> ({attackChains.length} chains)</Text>
          </Box>
          
          {attackChains.slice(0, 2).map((c, i) => (
            <AttackChainPanel key={i} chain={c} />
          ))}
        </Box>
      )}

      {/* Completion Summary */}
      {done && (
        <Box flexDirection="column" borderStyle="double" borderColor="green" padding={2}>
          <Text bold color="green" backgroundColor="black"> ✓ MISSION COMPLETE </Text>
          
          <Box marginTop={1}>
            <Text dimColor>Duration: </Text>
            <Text color="cyan">--:--</Text>
            <Text dimColor> │ Steps: </Text>
            <Text color="yellow">{steps.length}</Text>
            <Text dimColor> │ Findings: </Text>
            <Text color="red">{findings.length}</Text>
          </Box>
          
          <Box marginTop={1}>
            <Text dimColor>Press </Text>
            <Text bold color="yellow">Q</Text>
            <Text dimColor> to exit</Text>
          </Box>
        </Box>
      )}

      {/* Status Bar */}
      <StatusBar activeAgents={activeAgents} progress={progress} />

      {/* Help Overlay */}
      {showHelp && (
        <Box 
          position="absolute"
          top={5}
          left={10}
          right={10}
          borderStyle="round"
          borderColor="yellow"
          padding={2}
          backgroundColor="black"
        >
          <Text bold color="yellow" backgroundColor="black"> Keyboard Shortcuts </Text>
          <Box marginTop={1} flexDirection="column">
            <Text><Text bold color="cyan">Q</Text> Quit (when complete)</Text>
            <Text><Text bold color="cyan">H</Text> Toggle this help</Text>
            <Text><Text bold color="cyan">E</Text> Expand/collapse first finding</Text>
            <Text><Text bold color="cyan">←/→</Text> Navigate options (in dialogs)</Text>
            <Text><Text bold color="cyan">Enter</Text> Confirm selection</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}

export function renderEliteUI(
  task: string,
  sessionId: string,
  callback: (callbacks: UICallbacks) => void
) {
  return render(React.createElement(ChuckEliteUI, { task, sessionId, onReady: callback }));
}

export default ChuckEliteUI;
