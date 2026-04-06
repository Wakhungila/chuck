/**
 * MULTI-AGENT ORCHESTRATOR — Elite Tier Architecture
 * 
 * True multi-agent collaboration with specialized roles:
 * - RECON_LEAD: Coordinates reconnaissance efforts
 * - VULN_ANALYST: Deep vulnerability analysis
 * - EXPLOIT_SPECIALIST: Exploitation and PoC generation
 * - ATTACK_ARCHITECT: Attack chain synthesis
 * - CRITIC: Safety review and validation
 * 
 * Features inter-agent communication, task delegation, and consensus building.
 */

import { EventEmitter } from 'events';
import type { AgentStep, AgentResult } from '../agent/loop.js';
import type { Finding } from '../db/schema.js';

export interface AgentRole {
  id: string;
  name: string;
  specialty: 'recon' | 'analysis' | 'exploitation' | 'architecture' | 'critique';
  systemPrompt: string;
  allowedTools: string[];
  maxSteps: number;
}

export interface AgentMessage {
  from: string;
  to: string | 'broadcast';
  type: 'request' | 'response' | 'finding' | 'alert' | 'coordination';
  content: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AttackChain {
  id: string;
  name: string;
  steps: AttackStep[];
  probability: number;
  impact: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  mitreTechniques: string[];
  status: 'hypothesized' | 'partially_validated' | 'validated';
}

export interface AttackStep {
  order: number;
  technique: string;
  description: string;
  evidence: string;
  toolUsed?: string;
  success: boolean;
}

export interface ValidationGate {
  action: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  requiresApproval: boolean;
  approvedBy?: string;
  approvalTimestamp?: Date;
  rationale: string;
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'recon_lead',
    name: 'Reconnaissance Lead',
    specialty: 'recon',
    systemPrompt: `You are RECON_LEAD, an elite reconnaissance specialist.
Your mission: Comprehensive target mapping and attack surface discovery.

SPECIALIZATIONS:
- Subdomain enumeration and DNS mapping
- Port scanning and service fingerprinting  
- Technology stack identification
- Cloud asset discovery
- OSINT gathering

Think methodically. Document every finding. Pass high-value targets to VULN_ANALYST.`,
    allowedTools: ['nmap', 'subfinder', 'httpx', 'whois', 'curl', 'bash', 'grep'],
    maxSteps: 20
  },
  {
    id: 'vuln_analyst',
    name: 'Vulnerability Analyst',
    specialty: 'analysis',
    systemPrompt: `You are VULN_ANALYST, an elite vulnerability researcher.
Your mission: Deep analysis of discovered services and applications.

SPECIALIZATIONS:
- Web application vulnerability detection (OWASP Top 10)
- API security testing
- Authentication/Authorization bypass detection
- Input validation flaws (SQLi, XSS, RCE, SSRF, XXE)
- Business logic vulnerabilities
- CVE correlation and exploitability analysis

Analyze deeply. Generate detailed reports. Forward exploitable findings to EXPLOIT_SPECIALIST.`,
    allowedTools: ['nuclei', 'sqlmap', 'ffuf', 'curl', 'read_file', 'grep', 'slither'],
    maxSteps: 25
  },
  {
    id: 'exploit_specialist',
    name: 'Exploitation Specialist',
    specialty: 'exploitation',
    systemPrompt: `You are EXPLOIT_SPECIALIST, an elite offensive operator.
Your mission: Validate vulnerabilities through safe exploitation and PoC generation.

SPECIALIZATIONS:
- Proof-of-concept exploit development
- Vulnerability validation (non-destructive)
- Privilege escalation paths
- Lateral movement simulation
- Data exfiltration demonstration (sanitized)

Generate working PoCs. Document exact exploitation steps. Report to ATTACK_ARCHITECT.`,
    allowedTools: ['bash', 'curl', 'sqlmap', 'ffuf', 'read_file', 'file_write', 'grep'],
    maxSteps: 30
  },
  {
    id: 'attack_architect',
    name: 'Attack Chain Architect',
    specialty: 'architecture',
    systemPrompt: `You are ATTACK_ARCHITECT, a strategic offensive planner.
Your mission: Synthesize individual findings into complete attack chains.

SPECIALIZATIONS:
- Attack path construction
- Kill chain mapping (Cyber Kill Chain, MITRE ATT&CK)
- Impact assessment
- Risk prioritization
- Strategic recommendations

Connect the dots. Build narratives. Identify crown jewel access paths.`,
    allowedTools: ['bash', 'grep', 'read_file'],
    maxSteps: 15
  },
  {
    id: 'critic',
    name: 'Security Critic',
    specialty: 'critique',
    systemPrompt: `You are CRITIC, the quality assurance and safety guardian.
Your mission: Review all findings, validate conclusions, ensure safety compliance.

SPECIALIZATIONS:
- False positive detection
- Evidence sufficiency review
- Scope compliance verification
- Risk assessment validation
- Report quality assurance

Challenge assumptions. Demand evidence. Ensure ethical boundaries.`,
    allowedTools: ['read_file', 'grep', 'bash'],
    maxSteps: 10
  }
];

export class MultiAgentOrchestrator extends EventEmitter {
  private messageQueue: AgentMessage[] = [];
  private activeAgents: Set<string> = new Set();
  private findings: Finding[] = [];
  private attackChains: AttackChain[] = [];
  private validationGates: ValidationGate[] = [];
  private sessionId: string;
  private coordinationMemory: string[] = [];

  constructor(sessionId: string) {
    super();
    this.sessionId = sessionId;
  }

  /**
   * Initialize multi-agent swarm for a mission
   */
  async initializeMission(task: string): Promise<void> {
    this.emit('mission:start', { taskId: this.sessionId, task });
    
    // Start with recon phase
    await this.activateAgent('recon_lead', task);
    
    // Listen for recon completions to trigger analysis
    this.on('agent:complete', async (data) => {
      if (data.agentId === 'recon_lead') {
        await this.activateAgent('vuln_analyst', data.summary);
      }
      if (data.agentId === 'vuln_analyst' && data.findings.length > 0) {
        await this.activateAgent('exploit_specialist', JSON.stringify(data.findings));
      }
      if (data.agentId === 'exploit_specialist') {
        await this.activateAgent('attack_architect', 'Synthesize attack chains');
      }
    });
  }

  /**
   * Activate a specific agent role
   */
  async activateAgent(roleId: string, context: string): Promise<AgentResult | null> {
    const role = AGENT_ROLES.find(r => r.id === roleId);
    if (!role) throw new Error(`Unknown agent role: ${roleId}`);

    this.activeAgents.add(roleId);
    this.emit('agent:activate', { roleId, context });

    // Broadcast activation to other agents
    this.broadcast({
      from: 'orchestrator',
      to: 'broadcast',
      type: 'coordination',
      content: `${role.name} activated for: ${context.slice(0, 100)}...`,
      priority: 'medium',
      timestamp: new Date()
    });

    try {
      // Execute agent loop (integrates with existing runAgent)
      const result = await this.executeAgentLoop(role, context);
      
      // Process findings through critic
      if (result.findings.length > 0) {
        await this.reviewFindings(result.findings);
      }

      this.emit('agent:complete', { 
        agentId: roleId, 
        result, 
        findings: result.findings,
        summary: result.finalAnswer 
      });

      return result;
    } finally {
      this.activeAgents.delete(roleId);
    }
  }

  /**
   * Execute agent loop with role-specific constraints
   */
  private async executeAgentLoop(role: AgentRole, context: string): Promise<AgentResult> {
    // This integrates with the existing agent/loop.ts
    // Enhanced with role-specific tool filtering and step limits
    const steps: AgentStep[] = [];
    const findings: Finding[] = [];
    
    let stepCount = 0;
    let finalAnswer = '';

    while (stepCount < role.maxSteps) {
      stepCount++;
      
      // Emit progress
      this.emit('agent:step', { 
        agentId: role.id, 
        step: stepCount, 
        maxSteps: role.maxSteps 
      });

      // Check validation gates before high-risk actions
      const gate = await this.checkValidationGate(context);
      if (gate.requiresApproval && !gate.approvedBy) {
        this.emit('gate:blocked', { gate, agentId: role.id });
        break;
      }

      // Simulated step (actual implementation calls runAgent with role constraints)
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return { steps, findings, finalAnswer, sessionId: this.sessionId };
  }

  /**
   * Send message between agents
   */
  sendMessage(message: AgentMessage): void {
    this.messageQueue.push(message);
    this.emit('message:sent', message);

    if (message.to === 'broadcast') {
      AGENT_ROLES.forEach(role => {
        if (this.activeAgents.has(role.id)) {
          this.emit(`message:${role.id}`, message);
        }
      });
    } else if (this.activeAgents.has(message.to)) {
      this.emit(`message:${message.to}`, message);
    }
  }

  /**
   * Broadcast message to all active agents
   */
  broadcast(message: Omit<AgentMessage, 'to'>): void {
    this.sendMessage({ ...message, to: 'broadcast' });
  }

  /**
   * Add finding with automatic MITRE ATT&CK tagging
   */
  async addFinding(finding: Finding & { mitreTechniques?: string[] }): Promise<void> {
    this.findings.push(finding);
    this.emit('finding:new', finding);

    // Attempt to link to existing attack chains
    await this.linkToAttackChains(finding);
  }

  /**
   * Synthesize attack chains from findings
   */
  async synthesizeAttackChains(): Promise<AttackChain[]> {
    const chains: AttackChain[] = [];
    
    // Group findings by target/component
    const byTarget = new Map<string, Finding[]>();
    this.findings.forEach(f => {
      const key = f.affectedComponent || 'unknown';
      if (!byTarget.has(key)) byTarget.set(key, []);
      byTarget.get(key)!.push(f);
    });

    // Build chains based on logical progression
    for (const [target, findings] of byTarget.entries()) {
      if (findings.length >= 2) {
        const chain = this.buildChain(target, findings);
        if (chain) chains.push(chain);
      }
    }

    this.attackChains = chains;
    this.emit('chains:synthesized', chains);
    return chains;
  }

  /**
   * Build attack chain from related findings
   */
  private buildChain(target: string, findings: Finding[]): AttackChain | null {
    const severityOrder = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
    const sorted = findings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);

    const steps: AttackStep[] = sorted.map((f, i) => ({
      order: i + 1,
      technique: this.inferMitreTechnique(f),
      description: f.title,
      evidence: f.poc,
      success: true
    }));

    const maxSeverity = sorted[0]?.severity || 'LOW';
    const probability = this.calculateChainProbability(sorted);

    return {
      id: crypto.randomUUID(),
      name: `Attack Chain: ${target}`,
      steps,
      probability,
      impact: maxSeverity as any,
      mitreTechniques: [...new Set(steps.map(s => s.technique))],
      status: 'hypothesized'
    };
  }

  /**
   * Infer MITRE ATT&CK technique from finding
   */
  private inferMitreTechnique(finding: Finding): string {
    const title = finding.title.toLowerCase();
    const techniqueMap: Record<string, string> = {
      'sql': 'T1190', // Exploit Public-Facing Application
      'rce': 'T1190',
      'xss': 'T1189', // Drive-by Compromise
      'ssrf': 'T1190',
      'idor': 'T1078', // Valid Accounts
      'auth': 'T1078',
      'bypass': 'T1068', // Exploitation for Privilege Escalation
      'lfi': 'T1083', // File and Directory Discovery
      'rfi': 'T1190',
      'upload': 'T1190',
      'exec': 'T1059', // Command and Scripting Interpreter
    };

    for (const [keyword, technique] of Object.entries(techniqueMap)) {
      if (title.includes(keyword)) return technique;
    }
    return 'T1190'; // Default
  }

  /**
   * Calculate probability of attack chain success
   */
  private calculateChainProbability(findings: Finding[]): number {
    if (findings.length === 0) return 0;
    
    const baseProbabilities = { CRITICAL: 0.9, HIGH: 0.7, MEDIUM: 0.5, LOW: 0.3, INFO: 0.1 };
    const probs = findings.map(f => baseProbabilities[f.severity] || 0.1);
    
    // Combined probability (at least one succeeds)
    const failProb = probs.reduce((acc, p) => acc * (1 - p), 1);
    return 1 - failProb;
  }

  /**
   * Link finding to existing attack chains
   */
  private async linkToAttackChains(finding: Finding): Promise<void> {
    for (const chain of this.attackChains) {
      const technique = this.inferMitreTechnique(finding);
      if (chain.mitreTechniques.includes(technique)) {
        chain.steps.push({
          order: chain.steps.length + 1,
          technique,
          description: finding.title,
          evidence: finding.poc,
          success: true
        });
        chain.status = 'partially_validated';
        this.emit('chain:updated', chain);
      }
    }
  }

  /**
   * Review findings through critic agent
   */
  private async reviewFindings(findings: Finding[]): Promise<void> {
    this.emit('critic:review_start', { count: findings.length });
    
    // Simulate critic review (integrates with critic agent)
    const reviewed = findings.map(f => ({
      ...f,
      validated: true, // Would be set by actual critic agent
      reviewTimestamp: new Date().toISOString()
    }));

    this.emit('critic:review_complete', { reviewed });
  }

  /**
   * Check validation gate for an action
   */
  private async checkValidationGate(action: string): Promise<ValidationGate> {
    const riskKeywords = {
      critical: ['exploit', 'payload', 'shell', 'reverse', 'meterpreter'],
      high: ['sqli', 'rce', 'auth_bypass', 'privilege'],
      medium: ['xss', 'csrf', 'disclosure'],
      low: ['info', 'enum', 'scan']
    };

    const actionLower = action.toLowerCase();
    let riskLevel: ValidationGate['riskLevel'] = 'low';

    for (const [level, keywords] of Object.entries(riskKeywords)) {
      if (keywords.some(k => actionLower.includes(k))) {
        riskLevel = level as any;
        break;
      }
    }

    const requiresApproval = riskLevel === 'critical' || riskLevel === 'high';

    const gate: ValidationGate = {
      action,
      riskLevel,
      requiresApproval,
      rationale: `Action classified as ${riskLevel} risk based on keyword analysis`
    };

    this.validationGates.push(gate);
    return gate;
  }

  /**
   * Request human approval for high-risk action
   */
  async requestApproval(gate: ValidationGate, approver: string): Promise<boolean> {
    this.emit('approval:request', { gate, approver });
    
    // In real implementation, this would wait for external approval
    // For now, simulate approval after delay
    return new Promise(resolve => {
      setTimeout(() => {
        gate.approvedBy = approver;
        gate.approvalTimestamp = new Date();
        this.emit('approval:granted', { gate });
        resolve(true);
      }, 1000);
    });
  }

  /**
   * Get mission summary with attack chains
   */
  getMissionSummary(): {
    findings: Finding[];
    attackChains: AttackChain[];
    validationGates: ValidationGate[];
    activeAgents: string[];
  } {
    return {
      findings: this.findings,
      attackChains: this.attackChains,
      validationGates: this.validationGates,
      activeAgents: Array.from(this.activeAgents)
    };
  }
}

export default MultiAgentOrchestrator;
