import { PlanStep, SessionState, AgentResponse } from '../tools/Types';

/**
 * Core contract for all specialized Chuck agents.
 */
export interface BaseAgent {
  role: string;
  description: string;
  run(step: PlanStep, state: SessionState): Promise<AgentResponse>;
}