import { BaseAgent } from '../BaseAgent';
import { PlanStep, SessionState, AgentResponse } from '../../tools/Types';
import { queryOllama } from '../../services/ollama';

export class FuzzingAgent implements BaseAgent {
  role = 'fuzz';
  description = 'Stateful fuzzer capable of parameter mutation and exploit sequence orchestration.';

  async run(step: PlanStep, state: SessionState): Promise<AgentResponse> {
    const authContext = state.authContext?.isAuthenticated 
        ? `Authenticated with token: ${state.authContext.sessionCookie}`
        : "No active session found.";

    const prompt = `
    Role: ${this.description}
    Goal: ${step.description}
    Target: ${step.input}
    Status: ${authContext}

    Based on the target, suggest a fuzzing strategy.
    If we have a token, we must perform an "Authenticated Fuzz".
    
    Respond strictly in JSON:
    {
      "reasoning": "...",
      "action": { 
        "tool": "fuzz_scan", 
        "input": { 
          "url": "${step.input}", 
          "method": "POST",
          "seed": { "username": "admin" }
        } 
      },
      "confidence": 0.9
    }
    `;

    const response = await queryOllama(prompt);
    return JSON.parse(response);
  }
}