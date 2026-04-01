import { queryOllama } from '../services/ollama';
import { PlanStep, SessionState } from '../core/Types';

export class CriticAgent {
  async review(step: PlanStep, state: SessionState) {
    const prompt = `
    As a Senior Security Reviewer, evaluate the last action:
    Task: ${step.description}
    Result: ${JSON.stringify(step.result)}
    
    Current Findings: ${JSON.stringify(state.findings)}

    Is this a False Positive? Does this output suggest a new attack vector?
    Respond strictly in JSON:
    {
      "action": "CONTINUE|RETRY|ABORT",
      "reasoning": "...",
      "findings": [{ "title": "...", "severity": "...", "exploitable": true }],
      "newSteps": [{ "description": "...", "toolsRequired": [] }],
      "confidence": 0.9
    }
    `;

    const res = await queryOllama(prompt);
    try {
      return JSON.parse(res);
    } catch {
      return { action: 'CONTINUE', confidence: 0.5 };
    }
  }
}