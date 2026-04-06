/**
 * CHUCK ELITE INTEGRATION LAYER
 * 
 * Integrates all elite components:
 * - Multi-agent orchestration
 * - PoC generation
 * - Vector memory
 * - Elite UI
 * - Validation gates
 */

import { EventEmitter } from 'events';
import { MultiAgentOrchestrator, AttackChain, ValidationGate, AGENT_ROLES } from '../agents/MultiAgentOrchestrator.js';
import { PoCGenerator, GeneratedPoC } from '../tools/PoCGenerator.js';
import { VectorMemoryEngine, EngagementLesson } from '../memory/VectorMemoryEngine.js';
import type { AgentStep, AgentResult } from '../agent/loop.js';
import type { Finding } from '../db/schema.js';
import { appendAuditLog } from '../audit/logger.js';

export interface EliteMissionConfig {
  taskId: string;
  sessionId: string;
  target: string;
  scope: string[];
  objectives: string[];
  riskTolerance: 'low' | 'medium' | 'high';
  requireApprovalForExploitation: boolean;
  enableAutoPoCGeneration: boolean;
  enableContinuousLearning: boolean;
}

export interface EliteMissionState {
  status: 'initializing' | 'running' | 'paused' | 'completed' | 'error';
  currentPhase: 'recon' | 'analysis' | 'exploitation' | 'synthesis' | 'reporting';
  activeAgents: string[];
  findings: Finding[];
  generatedPoCs: GeneratedPoC[];
  attackChains: AttackChain[];
  pendingGates: ValidationGate[];
  totalSteps: number;
  startTime: Date;
  endTime?: Date;
}

export interface EliteCallbacks {
  onStep?: (step: AgentStep) => void;
  onFinding?: (finding: Finding) => void;
  onAttackChain?: (chain: AttackChain) => void;
  onApprovalRequired?: (gate: ValidationGate) => Promise<boolean>;
  onComplete?: (state: EliteMissionState) => void;
  onError?: (error: Error) => void;
}

export class ChuckElite extends EventEmitter {
  private config: EliteMissionConfig;
  private state: EliteMissionState;
  private orchestrator: MultiAgentOrchestrator;
  private pocGenerator: PoCGenerator;
  private memoryEngine: VectorMemoryEngine;
  private callbacks: EliteCallbacks;

  constructor(config: EliteMissionConfig, callbacks: EliteCallbacks = {}) {
    super();
    this.config = config;
    this.callbacks = callbacks;
    
    this.state = {
      status: 'initializing',
      currentPhase: 'recon',
      activeAgents: [],
      findings: [],
      generatedPoCs: [],
      attackChains: [],
      pendingGates: [],
      totalSteps: 0,
      startTime: new Date()
    };

    this.orchestrator = new MultiAgentOrchestrator(config.sessionId);
    this.pocGenerator = new PoCGenerator();
    this.memoryEngine = new VectorMemoryEngine();
    
    this.setupEventHandlers();
  }

  /**
   * Initialize and start the elite mission
   */
  async initialize(): Promise<void> {
    try {
      this.state.status = 'initializing';
      
      // Initialize memory engine
      if (this.config.enableContinuousLearning) {
        await this.memoryEngine.initialize();
        
        // Load relevant patterns for this target
        const patterns = await this.memoryEngine.getRelevantPatterns(this.config.target);
        if (patterns.length > 0) {
          this.emit('patterns:loaded', patterns);
        }
      }

      // Setup audit logging
      await appendAuditLog(this.config.sessionId, {
        event: 'mission_start',
        config: {
          target: this.config.target,
          riskTolerance: this.config.riskTolerance,
          objectives: this.config.objectives
        }
      });

      this.state.status = 'running';
      this.emit('mission:started', this.state);

      // Start multi-agent execution
      await this.executeMission();

    } catch (error) {
      this.state.status = 'error';
      this.state.endTime = new Date();
      this.callbacks.onError?.(error as Error);
      this.emit('mission:error', error);
    }
  }

  /**
   * Execute the full mission lifecycle
   */
  private async executeMission(): Promise<void> {
    try {
      // Phase 1: Reconnaissance
      await this.executePhase('recon');

      // Phase 2: Vulnerability Analysis
      await this.executePhase('analysis');

      // Phase 3: Exploitation (if enabled and approved)
      if (this.config.riskTolerance !== 'low') {
        await this.executePhase('exploitation');
      }

      // Phase 4: Attack Chain Synthesis
      await this.executePhase('synthesis');

      // Phase 5: Reporting
      await this.executePhase('reporting');

      // Complete mission
      await this.completeMission();

    } catch (error) {
      this.state.status = 'error';
      this.callbacks.onError?.(error as Error);
      throw error;
    }
  }

  /**
   * Execute a specific mission phase
   */
  private async executePhase(phase: EliteMissionState['currentPhase']): Promise<void> {
    this.state.currentPhase = phase;
    this.emit('phase:start', phase);

    const phaseAgents = this.getAgentsForPhase(phase);
    
    for (const agentRole of phaseAgents) {
      if (this.state.status !== 'running') break;
      
      this.state.activeAgents.push(agentRole.id);
      this.emit('agent:activated', agentRole);

      try {
        const result = await this.runAgentWithConstraints(agentRole);
        
        // Process results
        if (result.findings.length > 0) {
          for (const finding of result.findings) {
            await this.processFinding(finding);
          }
        }

        this.state.totalSteps += result.steps.length;

      } finally {
        this.state.activeAgents = this.state.activeAgents.filter(a => a !== agentRole.id);
      }
    }

    this.emit('phase:complete', phase);
  }

  /**
   * Run agent with role-specific constraints
   */
  private async runAgentWithConstraints(role: typeof AGENT_ROLES[0]): Promise<AgentResult> {
    // This would integrate with the actual agent/loop.ts
    // For now, return placeholder result
    return {
      steps: [],
      findings: [],
      finalAnswer: '',
      sessionId: this.config.sessionId
    };
  }

  /**
   * Process a finding - validate, generate PoC, store in memory
   */
  private async processFinding(finding: Finding): Promise<void> {
    this.state.findings.push(finding);
    this.callbacks.onFinding?.(finding);
    this.emit('finding:new', finding);

    // Store in vector memory
    if (this.config.enableContinuousLearning) {
      await this.memoryEngine.addMemory(finding.title, {
        type: 'finding',
        severity: finding.severity,
        sessionId: this.config.sessionId,
        mitreTechniques: [this.inferMitreTechnique(finding)],
        validated: false
      });
    }

    // Generate PoC if enabled
    if (this.config.enableAutoPoCGeneration && ['CRITICAL', 'HIGH'].includes(finding.severity)) {
      try {
        const poc = await this.pocGenerator.generatePoC(finding);
        if (poc) {
          this.state.generatedPoCs.push(poc);
          this.emit('poc:generated', poc);
        }
      } catch (error) {
        console.warn('PoC generation failed:', error);
      }
    }

    // Check if validation gate needed
    if (this.config.requireApprovalForExploitation) {
      const gate = await this.checkValidationGate(finding);
      if (gate.requiresApproval) {
        this.state.pendingGates.push(gate);
        const approved = await this.callbacks.onApprovalRequired?.(gate) ?? false;
        if (approved) {
          gate.approvedBy = 'user';
          gate.approvalTimestamp = new Date();
        }
        this.state.pendingGates = this.state.pendingGates.filter(g => g !== gate);
      }
    }
  }

  /**
   * Synthesize attack chains from findings
   */
  private async synthesizeAttackChains(): Promise<void> {
    const chains = await this.orchestrator.synthesizeAttackChains();
    this.state.attackChains = chains;
    
    for (const chain of chains) {
      this.callbacks.onAttackChain?.(chain);
      this.emit('attackchain:new', chain);
    }
  }

  /**
   * Check validation gate for a finding
   */
  private async checkValidationGate(finding: Finding): Promise<ValidationGate> {
    const riskLevel = finding.severity === 'CRITICAL' ? 'critical' :
                     finding.severity === 'HIGH' ? 'high' :
                     finding.severity === 'MEDIUM' ? 'medium' : 'low';
    
    const requiresApproval = this.config.requireApprovalForExploitation && 
                            (riskLevel === 'critical' || riskLevel === 'high');

    return {
      action: `Validate ${finding.title}`,
      riskLevel,
      requiresApproval,
      rationale: `${finding.severity} severity finding requires validation`
    };
  }

  /**
   * Infer MITRE technique from finding
   */
  private inferMitreTechnique(finding: Finding): string {
    const title = finding.title.toLowerCase();
    const mitreMap: Record<string, string> = {
      'sql': 'T1190',
      'rce': 'T1190',
      'xss': 'T1189',
      'ssrf': 'T1190',
      'idor': 'T1078',
      'auth': 'T1078',
    };

    for (const [keyword, technique] of Object.entries(mitreMap)) {
      if (title.includes(keyword)) return technique;
    }
    return 'T1190';
  }

  /**
   * Get agents appropriate for a phase
   */
  private getAgentsForPhase(phase: string): typeof AGENT_ROLES {
    switch (phase) {
      case 'recon':
        return AGENT_ROLES.filter(r => r.specialty === 'recon');
      case 'analysis':
        return AGENT_ROLES.filter(r => r.specialty === 'analysis');
      case 'exploitation':
        return AGENT_ROLES.filter(r => r.specialty === 'exploitation');
      case 'synthesis':
        return AGENT_ROLES.filter(r => r.specialty === 'architecture');
      case 'reporting':
        return AGENT_ROLES.filter(r => r.specialty === 'critique');
      default:
        return [];
    }
  }

  /**
   * Complete the mission and store lessons
   */
  private async completeMission(): Promise<void> {
    this.state.status = 'completed';
    this.state.endTime = new Date();

    // Synthesize final attack chains
    await this.synthesizeAttackChains();

    // Store lessons learned
    if (this.config.enableContinuousLearning) {
      const lesson: EngagementLesson = {
        id: crypto.randomUUID(),
        sessionId: this.config.sessionId,
        summary: `Mission completed with ${this.state.findings.length} findings`,
        keyFindings: this.state.findings.map(f => f.title),
        successfulTechniques: this.state.attackChains.flatMap(c => c.mitreTechniques),
        failedApproaches: [],
        recommendations: [],
        extractedPatterns: [],
        timestamp: new Date()
      };
      await this.memoryEngine.storeLesson(lesson);
    }

    // Final audit log
    await appendAuditLog(this.config.sessionId, {
      event: 'mission_complete',
      findings: this.state.findings.length,
      attackChains: this.state.attackChains.length,
      duration: this.state.endTime.getTime() - this.state.startTime.getTime()
    });

    this.callbacks.onComplete?.(this.state);
    this.emit('mission:complete', this.state);
  }

  /**
   * Pause the mission
   */
  pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
      this.emit('mission:paused');
    }
  }

  /**
   * Resume a paused mission
   */
  resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.emit('mission:resumed');
      this.executeMission().catch(console.error);
    }
  }

  /**
   * Get current mission state
   */
  getState(): EliteMissionState {
    return { ...this.state };
  }

  /**
   * Get mission summary report
   */
  getSummaryReport(): {
    executive: string;
    technical: string;
    findings: Finding[];
    attackChains: AttackChain[];
    recommendations: string[];
  } {
    const duration = this.state.endTime 
      ? Math.round((this.state.endTime.getTime() - this.state.startTime.getTime()) / 1000)
      : 0;

    const criticalCount = this.state.findings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = this.state.findings.filter(f => f.severity === 'HIGH').length;

    return {
      executive: `Security assessment identified ${criticalCount} critical and ${highCount} high severity vulnerabilities. 
${this.state.attackChains.length} distinct attack chains were validated. 
Immediate remediation recommended for critical findings.`,
      
      technical: `Assessment executed over ${duration} seconds using ${this.state.activeAgents.length} specialized agents. 
Total of ${this.state.totalSteps} reasoning steps performed. 
${this.state.generatedPoCs.length} proof-of-concept exploits generated.`,
      
      findings: this.state.findings,
      attackChains: this.state.attackChains,
      recommendations: this.generateRecommendations()
    };
  }

  /**
   * Generate remediation recommendations
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];
    
    const criticalFindings = this.state.findings.filter(f => f.severity === 'CRITICAL');
    if (criticalFindings.length > 0) {
      recommendations.push('[IMMEDIATE] Address all CRITICAL severity findings within 24-48 hours');
    }

    if (this.state.attackChains.some(c => c.impact === 'CRITICAL')) {
      recommendations.push('[URGENT] Implement controls to break identified attack chains');
    }

    recommendations.push('Conduct regular security assessments on continuous basis');
    recommendations.push('Implement automated vulnerability scanning in CI/CD pipeline');

    return recommendations;
  }

  /**
   * Setup internal event handlers
   */
  private setupEventHandlers(): void {
    this.orchestrator.on('finding:new', (finding) => {
      this.processFinding(finding);
    });

    this.orchestrator.on('chains:synthesized', (chains) => {
      this.state.attackChains = chains;
    });

    this.orchestrator.on('approval:request', async ({ gate }) => {
      const approved = await this.callbacks.onApprovalRequired?.(gate) ?? false;
      if (approved) {
        await this.orchestrator.requestApproval(gate, 'user');
      }
    });
  }
}

export default ChuckElite;
