export type SystemStage = 'PLANNER' | 'RECON' | 'ANALYZER' | 'EXPLOIT' | 'REPORT' | 'FUZZER';

export interface PlanStep {
  id: string; // Map from 'step'
  order: number; // Map from 'step'
  agent: 'recon' | 'scanner' | 'fuzz' | 'analysis' | 'report';
  tool: string;
  input: string;
  description: string; // Map from 'goal'
  status: 'pending' | 'running' | 'completed' | 'failed';
  expectedOutput?: string;
  result?: any;
}

export interface Finding {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  title: string;
  description: string;
  evidence: string;
  exploitable: boolean;
  confidence: number;
  discoveredBy: string;
}

export interface AgentResponse {
  reasoning: string;
  action: any;
  confidence: number;
}

export interface SessionState {
  goal: string;
  plan: PlanStep[];
  findings: Finding[];
  iteration: number;
  targetsSeen: Set<string>;
  memoryContext?: string;
  kbContext?: string;
  authContext?: {
    isAuthenticated: boolean;
    sessionCookie?: string;
  };
}