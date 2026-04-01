import { SessionState, Finding, PlanStep } from './Types';
import { PlannerAgent } from '../agents/PlannerAgent';
import { ToolRouter } from '../agents/ToolRouter';
import { CriticAgent } from '../agents/CriticAgent';
import { orchestratorUI } from '../utils/ux/SystemSpinner';

export class ExecutionLoop {
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
      iteration: 0
    };

    // 1. Planning
    orchestratorUI.start('RECON');
    state.plan = await this.planner.generateInitialPlan(goal);
    
    while (state.iteration < 15) {
      for (const step of state.plan.filter(s => s.status === 'pending')) {
        orchestratorUI.setStage('ANALYZER');
        
        // 2. Execution via Tool Routing
        const toolResult = await this.router.executeStep(step, state);
        step.result = toolResult;
        step.status = 'completed';

        // 3. Critique & Reflection
        orchestratorUI.setStage('EXPLOIT');
        const critique = await this.critic.review(step, state);
        
        if (critique.action === 'RETRY') {
          step.status = 'pending';
          continue;
        }

        if (critique.findings) {
          state.findings.push(...critique.findings);
        }
        
        // 4. Dynamic Re-planning
        if (critique.newSteps) {
          state.plan.push(...critique.newSteps);
        }
      }

      if (state.plan.every(s => s.status === 'completed')) break;
      state.iteration++;
    }

    orchestratorUI.stop(true, "Campaign Finished");
    return state.findings;
  }
}