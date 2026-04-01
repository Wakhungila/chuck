export interface PlanStep {
  id: string;
  order: number;
  description: string;
  toolsRequired: string[];
  expectedOutput: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
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
}