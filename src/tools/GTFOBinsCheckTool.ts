import axios from 'axios';
import { z } from 'zod';

export const GTFOBinsCheckTool = {
  name: 'GTFOBinsCheck',
  description: 'Checks if a binary has known privilege escalation vectors (SUID, sudo, etc.) on GTFOBins.',
  inputSchema: z.object({
    binary: z.string() .describe('The binary name to check (e.g., "find", "vim").'),
  }),

  async call(input: { binary: string }) {
    const bin = input.binary.toLowerCase().trim();
    const url = `https://gtfobins.github.io/gtfobins/${bin}/`;
    
    try {
      const response = await axios.get(url, { timeout: 5000 });
      if (response.status === 200) {
        return `[!] MATCH FOUND: ${bin} is on GTFOBins.\nURL: ${url}\nReview the page for SUID or sudo escalation vectors.`;
      }
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        return `No GTFOBins entry found for "${bin}".`;
      }
      return `Error checking GTFOBins for "${bin}": ${error.message}`;
    }
    return `No GTFOBins entry found for "${bin}".`;
  }
};