import axios from 'axios';
import { z } from 'zod';

export const CVESearchTool = {
  name: 'CVESearch',
  description: 'Search the NVD API for recent vulnerabilities associated with a specific software product and version.',
  inputSchema: z.object({
    keyword: z.string().description('The product name and version (e.g., "Apache 2.4.49" or "WordPress 5.8.1").'),
  }),

  async call(input: { keyword: string }) {
    const apiKey = process.env.NVD_API_KEY;
    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(input.keyword)}`;
    
    try {
      const response = await axios.get(url, {
        headers: apiKey ? { 'apiKey': apiKey } : {},
        timeout: 10000
      });

      const vulnerabilities = response.data.vulnerabilities || [];
      if (vulnerabilities.length === 0) {
        return `No CVEs found for "${input.keyword}".`;
      }

      const results = vulnerabilities.slice(0, 5).map((v: any) => {
        const cve = v.cve;
        const id = cve.id;
        const description = cve.descriptions.find((d: any) => d.lang === 'en')?.value || 'No description available.';
        const baseScore = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || 'N/A';
        return `[${id}] (Score: ${baseScore})\n${description}\n`;
      });

      return `Top 5 findings for "${input.keyword}":\n\n${results.join('\n')}`;
    } catch (error) {
      return `Error querying NVD API: ${error instanceof Error ? error.message : String(error)}`;
    }
  }
};