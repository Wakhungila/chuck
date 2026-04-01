import { queryOllama } from '../services/ollama';
import { PlanStep, SessionState } from '../core/Types';

export class CriticAgent {
  async review(step: PlanStep, state: SessionState) {
    const prompt = `
    As a Senior Security Reviewer, evaluate the last action:
    Task: ${step.description}
    Status: ${step.status}
    Result: ${JSON.stringify(step.result)}
    
    Current Findings: ${JSON.stringify(state.findings)}

    If the status is 'failed', analyze the error. Can the step be corrected (e.g., fixing syntax, changing ports, or using an alternative tool)?
    Is this a False Positive? Does this output suggest a new attack vector or a need to pivot?

    Respond strictly in JSON:
    {
      "action": "CONTINUE|RETRY|ABORT",
      "reasoning": "...",
      "correctedStep": { "tool": "tool_name", "input": "new_input_args" },
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