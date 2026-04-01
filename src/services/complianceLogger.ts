import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface Vulnerability {
  id: string;
  type: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  cvss?: number;
  evidence_uri?: string;
}

export interface AuditEvent {
  timestamp: Date;
  tool: string;
  target: string;
  input_hash: string;
  output_hash: string;
  compliance_tags: string[];
  evidence_uri: string;
}

export class ComplianceLogger {
  private logQueue: AuditEvent[] = [];

  private sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  async logToolExecution(tool: string, input: string, output: string, target: string): Promise<void> {
    const evidenceFileName = `evidence_${Date.now()}_${tool}.log`;
    const evidenceDir = path.join(process.cwd(), '.chuck', 'evidence');
    await fs.mkdir(evidenceDir, { recursive: true });
    
    const evidenceUri = path.join(evidenceDir, evidenceFileName);
    await fs.writeFile(evidenceUri, output);

    const event: AuditEvent = {
      timestamp: new Date(),
      tool,
      target,
      input_hash: this.sha256(input),
      output_hash: this.sha256(output),
      compliance_tags: this.extractComplianceTags(tool),
      evidence_uri: evidenceUri
    };

    this.logQueue.push(event);
    await this.persistAuditLog(event);
  }

  private extractComplianceTags(tool: string): string[] {
    const tags = ['PTES'];
    if (tool.includes('sqlmap')) tags.push('OWASP_TOP_10');
    if (tool.includes('nmap')) tags.push('NETWORK_ENUM');
    return tags;
  }

  private async persistAuditLog(event: AuditEvent): Promise<void> {
    const auditPath = path.join(process.cwd(), '.chuck', 'audit_trail.jsonl');
    await fs.appendFile(auditPath, JSON.stringify(event) + '\n');
  }

  async generateComplianceReport(campaignId: string, standard: 'PTES' | 'OWASP' | 'PCI-DSS'): Promise<string> {
    const standardMap = {
      'PTES': 'Penetration Testing Execution Standard',
      'OWASP': 'OWASP Top 10 Mapping',
      'PCI-DSS': 'PCI Data Security Standard'
    };

    const report = [
      `# Compliance Report: ${standardMap[standard]}`,
      `Campaign ID: ${campaignId}`,
      `Generated: ${new Date().toISOString()}`,
      '\n## Execution Timeline',
      ...this.logQueue.map(e => `- ${e.timestamp.toISOString()}: ${e.tool} executed on ${e.target} (Evidence: ${e.evidence_uri})`)
    ];

    const reportPath = path.join(process.cwd(), '.chuck', `report_${standard}_${campaignId}.md`);
    await fs.writeFile(reportPath, report.join('\n'));
    return reportPath;
  }
}