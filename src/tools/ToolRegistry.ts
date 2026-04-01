import { CVESearchTool } from './CVESearchTool';
import { ExploitSearchTool } from './ExploitSearchTool';
import { VulnerabilityReportTool } from './VulnerabilityReportTool';
import { NucleiTool } from './NucleiTool';
import { HttpScanTool } from './HttpScanTool';
import { FuzzingOrchestrator } from '../utils/FuzzingOrchestrator';
import { z } from 'zod';

/**
 * Central registry for all Chuck capabilities.
 */
export const toolRegistry: Record<string, any> = {
  'port_scan': HttpScanTool, // Maps generic planner terms to specific tools
  'tech_stack_detect': HttpScanTool,
  'vulnerability_scan': NucleiTool,
  'subdomain_enum': NucleiTool,
  'cve_search': CVESearchTool,
  'exploit_match': ExploitSearchTool,
  'vulnerability_summary': VulnerabilityReportTool,
  'fuzz_scan': {
    name: 'fuzz_scan',
    description: 'Stateful web fuzzer for authenticated and unauthenticated parameter mutation.',
    inputSchema: z.object({
      url: z.string(),
      method: z.string(),
      seed: z.any(),
      token: z.string().optional()
    }),
    call: (input: any) => new FuzzingOrchestrator().runWebFuzz({ ...input, seedData: input.seed })
  }
};

export function getRegisteredTools() {
  return Object.values(toolRegistry);
}