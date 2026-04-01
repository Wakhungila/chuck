import { z } from 'zod';
import { runCommand } from './shell';

export const NucleiTool = {
  name: 'nuclei',
  description: 'Advanced template-based vulnerability scanner. Best for finding specific CVEs, misconfigurations, and info leaks.',
  inputSchema: z.object({
    target: z.string().description('The URL or IP to scan'),
    template: z.string().optional().description('Specific template or category (e.g., "cves", "exposures")'),
    severity: z.enum(['info', 'low', 'medium', 'high', 'critical']).optional()
  }),

  async call(input: { target: string; template?: string; severity?: string }) {
    console.log(`[*] Running Nuclei scan on ${input.target}...`);
    
    let cmd = `nuclei -u ${input.target} -json -silent`;
    if (input.template) cmd += ` -t ${input.template}`;
    if (input.severity) cmd += ` -severity ${input.severity}`;

    const output = await runCommand(cmd);
    return output || "Nuclei finished with no findings.";
  }
};