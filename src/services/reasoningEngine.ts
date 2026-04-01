import { queryOllama } from '../ollama.js';
import { Vulnerability } from '../complianceLogger.js';

export interface ExploitStep {
  vuln_id: string;
  prerequisites: string[];
  action: string;
}

export interface ExploitPlan {
  chain: ExploitStep[];
  poc_code: string;
  success_criteria: string;
}

export class ReasoningEngine {
  constructor(private model: string = process.env.CHUCK_CODE_OLLAMA_MODEL || 'mistral:7b-instruct-q4_0') {}

  async synthesizeExploitChain(findings: Vulnerability[]): Promise<ExploitPlan> {
    const prompt = `
Analyze these vulnerabilities and develop an automated exploit chain:
${findings.map(v => `- [${v.id}] ${v.type}: ${v.description} (Severity: ${v.severity})`).join('\n')}

Requirement:
1. Chain multiple vulnerabilities into a single attack vector.
2. Identify prerequisites (e.g., "network access to port 443").
3. Generate proof-of-concept shell script code.

Respond strictly in JSON format:
{
  "chain": [{"vuln_id": "...", "prerequisites": [...], "action": "..."}],
  "poc_code": "#!/bin/bash...",
  "success_criteria": "presence of /etc/passwd in output"
}`;

    const response = await queryOllama(prompt, this.model);
    try {
      return JSON.parse(response);
    } catch {
      throw new Error("Failed to parse reasoning engine response into JSON.");
    }
  }
}