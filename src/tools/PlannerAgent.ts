import { queryOllama } from '../services/ollama';

export class PlannerAgent {
  async generateInitialPlan(fullPrompt: string): Promise<any[]> {
    console.log(`[DEBUG] Planner received prompt length: ${fullPrompt.length}`);

    const systemPrompt = `You are Chuck, a red-team ranger. 
Create a short, valid JSON attack plan as an array of steps.
Example output:
[
  {"agent":"Recon","tool":"http_scan","target":"google.com","description":"Initial web recon"},
  {"agent":"Scanner","tool":"nuclei","target":"google.com","description":"Vulnerability scan"}
]

Respond with ONLY the JSON array. No explanations, no markdown.

${fullPrompt}`;

    try {
      const raw = await queryOllama(systemPrompt);
      console.log(`[DEBUG Planner Raw] ${raw?.substring(0, 400)}...`);

      if (!raw || typeof raw !== 'string') {
        throw new Error('Empty response from Ollama');
      }

      // Clean JSON wrappers
      let cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .replace(/^\s*[\[\{]/, '$&') // ensure starts with [ or {
        .trim();

      const plan = JSON.parse(cleaned);
      return Array.isArray(plan) ? plan : [];
    } catch (err: any) {
      console.error(`[!] Planner Error: ${err.message}`);
      // Solid fallback plan so it never dies
      return [
        { agent: "Recon", tool: "http_scan", target: "google.com", description: "Initial web recon" },
        { agent: "Scanner", tool: "nuclei", target: "google.com", description: "Run nuclei scan" },
        { agent: "Analyzer", tool: "analyze_results", target: "google.com", description: "Evaluate findings" }
      ];
    }
  }
}
