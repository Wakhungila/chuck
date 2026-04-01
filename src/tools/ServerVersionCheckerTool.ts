import axios from 'axios';
import { z } from 'zod';

export const ServerVersionCheckerTool = {
  name: 'ServerVersionChecker',
  description: 'Fetches the HTTP headers from a URL to identify the server software and versions (e.g., Apache, Nginx, PHP).',
  inputSchema: z.object({
    url: z.string() .describe('The target URL to check (e.g., "http://example.com").'),
  }),

  async call(input: { url: string }) {
    try {
      const response = await axios.head(input.url, {
        timeout: 5000,
        validateStatus: () => true, // Accept any status code to see headers
        headers: {
          'User-Agent': 'Mozilla/5.0 (Authorized Security Research)'
        }
      });

      const server = response.headers['server'] || 'Unknown';
      const poweredBy = response.headers['x-powered-by'] || 'Unknown';
      
      return `Tech Stack Identification for ${input.url}:
- Server Header: ${server}
- X-Powered-By: ${poweredBy}

Heuristic: Use the version strings found above with the CVESearch tool to check for known vulnerabilities.`;
    } catch (error) {
      return `Error fetching headers for ${input.url}: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};