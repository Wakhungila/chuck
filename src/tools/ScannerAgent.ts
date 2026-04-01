import { BaseAgent } from './BaseAgent';
import { PlanStep, SessionState, AgentResponse } from './Types';
import { queryOllama } from '../services/ollama';

export class ScannerAgent implements BaseAgent {
  role = 'scanner';
  description = 'Vulnerability scanner specialized in template-based auditing (Nuclei) and CVE discovery.';

  async run(step: PlanStep, state: SessionState): Promise<AgentResponse> {
    const prompt = `
    Role: ${this.description}
    Task: ${step.description}
    Input: ${step.input}

    Decide which scan templates to run based on previous recon.
    Respond strictly in JSON:
    {
      "reasoning": "...",
      "action": { "tool": "vulnerability_scan", "input": { "target": "...", "template": "..." } },
      "confidence": 0.9
    }
    `;

    const response = await queryOllama(prompt);
    return JSON.parse(response);
  }
}