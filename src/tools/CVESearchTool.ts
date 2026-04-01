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
    if (!apiKey) {
      console.warn('⚠️ NVD_API_KEY not set. Set with: export NVD_API_KEY=your_key');
      console.warn('   Get free key at: https://nvd.nist.gov/developers/request-an-api-key');
    }

    let allVulns: any[] = [];
    let startIndex = 0;
    const maxPages = 3; // Get up to 300 results

    // PAGINATE
    for (let page = 0; page < maxPages; page++) {
      try {
        const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?keywordSearch=${encodeURIComponent(input.keyword)}&startIndex=${startIndex}`;
        
        const response = await axios.get(url, {
          headers: apiKey ? { 'apiKey': apiKey } : {},
          timeout: 15000
        });

        const vulns = response.data.vulnerabilities || [];
        if (vulns.length === 0) break;
        
        allVulns.push(...vulns);
        startIndex += vulns.length;
      } catch (error) {
        if (page === 0) {
          return `CVE Search error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        }
        break; // Stop pagination on error
      }
    }

    if (allVulns.length === 0) {
      return `No CVEs found for "${input.keyword}".`;
    }

    // SORT BY SEVERITY
    const results = allVulns
      .sort((a, b) => {
        const scoreA = a.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || 0;
        const scoreB = b.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || 0;
        return scoreB - scoreA;
      })
      .slice(0, 10) // Top 10 results
      .map((v: any) => {
        const cve = v.cve;
        const id = cve.id;
        const description = cve.descriptions.find((d: any) => d.lang === 'en')?.value || 'No description';
        const baseScore = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseScore || 'N/A';
        const severity = typeof baseScore === 'number' 
          ? (baseScore >= 9 ? '🔴 CRITICAL' : baseScore >= 7 ? 'High' : baseScore >= 4 ? 'Medium' : 'Low')
          : 'UNKNOWN';
        
        return `[${severity}] ${id} (CVSS: ${baseScore})\\n${description}`;
      });

    return `Top ${results.length} CVEs for "${input.keyword}":\\n\\n${results.join('\\n\\n')}`;
  }
};