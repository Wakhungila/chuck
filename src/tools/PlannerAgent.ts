import { queryOllama } from '../services/ollama';
import { PlanStep } from './Types';
import chalk from 'chalk';

export class PlannerAgent {
  private model: string;

  constructor() {
    this.model = process.env.CHUCK_CODE_OLLAMA_MODEL || 'mistral:7b-instruct-q4_0';
  }

  /**
   * Generates a structured execution plan based on a high-level security goal.
   */
  async generateInitialPlan(goal: string): Promise<PlanStep[]> {
    const systemPrompt = `
    You are the Chuck Strategy Engine, a Senior Security Architect.
    Your task is to decompose a security audit goal into structured, actionable steps.
    
    Available Agents & Tools:
    - recon: [subdomain_enum, port_scan, tech_stack_detect]
    - fuzz: [dir_brute, parameter_fuzz, sqlmap_scan]
    - analysis: [cve_search, exploit_match, source_code_review]
    - report: [vulnerability_summary]

    Knowledge Base Utilization:
    - Use [VULN_PATTERNS] to guide your choice of payloads and fuzzing strategies.
    - If a pattern describes a specific exploit logic (e.g. "fuzz parameter 'id' with large ints"), prioritize testing it.

    Response Requirement:
    Respond ONLY with a JSON array of objects. No preamble, no markdown formatting.
    
    Format:
    [
      {
        "step": number,
        "agent": "recon" | "fuzz" | "analysis" | "report",
        "tool": "tool_name",
        "input": "target or specific arguments",
        "goal": "description of what this step achieves"
      }
    ]
    `;

    const userPrompt = `Goal: ${goal}`;

    try {
      const response = await queryOllama(`${systemPrompt}\n\n${userPrompt}`, this.model);
      
      // Clean the response in case the model included markdown blocks
      const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
      const rawSteps = JSON.parse(cleanJson);

      return this.validateAndMapSteps(rawSteps);
    } catch (error) {
      console.error(chalk.red(`[!] Planner Error: Failed to generate or parse plan. ${error}`));
      // Fallback to a basic discovery step if planning fails
      return [{
        id: '1',
        order: 1,
        agent: 'recon',
        tool: 'port_scan',
        input: goal,
        description: 'Initial discovery fallback',
        status: 'pending'
      }];
    }
  }

  /**
   * Validates the structure and maps it to the internal PlanStep interface.
   */
  private validateAndMapSteps(rawSteps: any[]): PlanStep[] {
    if (!Array.isArray(rawSteps)) throw new Error("Plan is not an array");

    return rawSteps.map((s: any) => {
      if (!s.agent || !s.tool || !s.goal) throw new Error(`Invalid step structure at step ${s.step}`);
      
      return {
        id: String(s.step),
        order: s.step,
        agent: s.agent,
        tool: s.tool,
        input: s.input,
        description: s.goal,
        status: 'pending'
      };
    });
  }
}