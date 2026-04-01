import { SessionState, Finding, PlanStep, SystemStage } from './Types';
import { PlannerAgent } from './PlannerAgent';
import { ToolRouter } from './ToolRouter';
import { CriticAgent } from './CriticAgent';
import { orchestratorUI } from '../services/SystemSpinner';
import { MemoryManager } from './MemoryManager';
import { VulnerabilityKB } from '../memory/VulnerabilityKB';
import chalk from 'chalk';

export class ExecutionLoop {
  private memory = new MemoryManager();
  private vkb = new VulnerabilityKB();

  // Heuristic: 1 token ~= 4 characters. 2048 tokens limit for local LLMs on 8GB RAM.
  private MAX_CONTEXT_CHARS = 6000; 

  constructor(
    private planner: PlannerAgent,
    private router: ToolRouter,
    private critic: CriticAgent
  ) {}

  async start(goal: string) {
    const state: SessionState = {
      goal,
      plan: [],
      findings: [],
      iteration: 0,
      targetsSeen: new Set()
    };

    await this.memory.initialize();
    await this.vkb.initialize();

    // 1. Planning
    orchestratorUI.start('PLANNER', 'Designing attack path...');
    // Retrieve context from tactical memory and the vulnerability knowledge base
    state.memoryContext = await this.memory.getContext(goal);
    state.kbContext = await this.vkb.searchPatterns(goal);

    this.truncateContext(state);

    state.plan = await this.planner.generateInitialPlan(`${goal}\n\n[HISTORICAL_CONTEXT]\n${state.memoryContext}\n\n[VULN_PATTERNS]\n${state.kbContext}`);
    
    while (state.iteration < 15) {
      for (const step of state.plan.filter(s => s.status === 'pending' || s.status === 'failed')) {
        const stageMap: Record<string, SystemStage> = {
          recon: 'RECON',
          scanner: 'ANALYZER',
          fuzz: 'FUZZER',
          analysis: 'ANALYZER',
          report: 'REPORT'
        };

        orchestratorUI.setStage(stageMap[step.agent] || 'ANALYZER', step.description);
        
        // 2. Execution via Tool Routing
        try {
          const toolResult = await this.router.executeStep(step, state);
          step.result = toolResult;
          step.status = 'completed';
        } catch (error) {
          step.result = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`[!] Step ${step.id} Failed: ${step.result}`));
          step.status = 'failed';
        }

        // Save raw observations for short-term search
        if (typeof toolResult === 'string') {
          await this.memory.remember(toolResult, 'result', { stepId: step.id });
        }

        // 3. Critique & Reflection
        this.truncateContext(state);
        orchestratorUI.setStage('ANALYZER', `Evaluating ${step.tool} results...`);
        const critique = await this.critic.review(step, state);
        
        if (critique.action === 'RETRY') {
          if (critique.correctedStep) {
            console.log(chalk.yellow(`[Self-Correction] Rewriting step ${step.id} based on critic feedback.`));
            step.tool = critique.correctedStep.tool;
            step.input = critique.correctedStep.input;
          }
          step.status = 'pending';
          continue;
        }

        if (critique.findings) {
          state.findings.push(...critique.findings);
          for (const f of critique.findings) {
            if (f.exploitable) orchestratorUI.stop(true, `Confirmed ${f.title}`);
          }
        }
        
        // 4. Dynamic Re-planning
        if (critique.newSteps) {
          state.plan.push(...critique.newSteps);
        }
      }

      if (state.plan.every(s => s.status === 'completed')) break;
      state.iteration++;
    }

    // Commit session findings to long-term memory
    await this.memory.syncSession(state);

    orchestratorUI.stop(true, "Campaign Finished");
    return state.findings;
  }

  private truncateContext(state: SessionState) {
    // Prioritize keeping findings, truncate historical/knowledge context if total exceeds RAM safety limit
    if ((state.memoryContext?.length || 0) + (state.kbContext?.length || 0) > this.MAX_CONTEXT_CHARS) {
      const half = Math.floor(this.MAX_CONTEXT_CHARS / 2);
      if (state.memoryContext) state.memoryContext = state.memoryContext.substring(0, half) + "... [Truncated]";
      if (state.kbContext) state.kbContext = state.kbContext.substring(0, half) + "... [Truncated]";
      console.log(chalk.dim(`[System] Context truncated to fit LLM window (RAM Optimization).`));
    }
  }
}