import { BaseAgent } from './BaseAgent';
import { PlanStep, SessionState, AgentResponse } from './Types';
import { queryOllama } from '../services/ollama';

export class ReconAgent implements BaseAgent {
  role = 'recon';
  description = 'Discovery specialist focused on infrastructure mapping and technology fingerprinting.';

  async run(step: PlanStep, state: SessionState): Promise<AgentResponse> {
    const prompt = `
    Role: ${this.description}
    Task: ${step.description}
    Target: ${step.input}
    
    Current Context: ${state.findings.length} findings identified.

    Decide how to best perform reconnaissance. Use tools like http_scan or nmap.
    Respond strictly in JSON:
    {
      "reasoning": "...",
      "action": { "tool": "tool_name", "input": { ... } },
      "confidence": 0.95
    }
    `;

    const response = await queryOllama(prompt);
    try {
      return JSON.parse(response);
    } catch {
      return { reasoning: "Failed to parse recon plan", action: null, confidence: 0 };
    }
  }
}