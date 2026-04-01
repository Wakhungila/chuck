import { z } from 'zod';
import { runCommand } from './shell';

export const HttpScanTool = {
  name: 'http_scan',
  description: 'Fingerprints web technologies, headers, and response metadata.',
  inputSchema: z.object({
    url: z.string().description('The target URL'),
    user_agent: z.string().optional().description('Custom User-Agent header')
  }),

  async call(input: { url: string; user_agent?: string }) {
    console.log(`[*] Fingerprinting ${input.url}...`);
    
    const ua = input.user_agent ? `-A "${input.user_agent}"` : '';
    const cmd = `curl -I -s --max-time 10 ${ua} ${input.url}`;
    
    const headers = await runCommand(cmd);
    return headers || "Could not retrieve headers.";
  }
};