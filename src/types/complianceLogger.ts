/**
 * Compliance Logger - Track all testing activities for audit and compliance
 * Supports PTES, OWASP, PCI-DSS, HIPAA standards
 */

import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export type ComplianceStandard = 'PTES' | 'OWASP' | 'PCI-DSS' | 'HIPAA';

export interface AuditEvent {
  timestamp: Date;
  campaignId: string;
  targetId: string;
  tool: string;
  action: string;
  input: string;
  inputHash: string;
  output: string;
  outputHash: string;
  severity: string;
  complianceTags: string[];
  evidenceUri: string;
  actor: string;
}

export interface ComplianceRule {
  standard: ComplianceStandard;
  requirement: string;
  controlId: string;
  requires: string[]; // tags that satisfy this requirement
}

export class ComplianceLogger {
  private eventLog: AuditEvent[] = [];
  private logFile: string;
  private dataDir: string;
  private standardRules: Map<ComplianceStandard, ComplianceRule[]> = new Map();

  constructor(dataDir: string = '.chuck/compliance') {
    this.dataDir = dataDir;
    this.logFile = join(dataDir, 'audit.log');
    this.initializeStandardRules();
    this.ensureDataDir();
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(join(this.dataDir, 'evidence'), { recursive: true });
    } catch (error) {
      console.error('Failed to create compliance directories:', error);
    }
  }

  private initializeStandardRules(): void {
    this.standardRules.set('PTES', [
      { standard: 'PTES', requirement: 'Information Gathering', controlId: 'PTES-1', requires: ['nmap', 'dns_recon'] },
      { standard: 'PTES', requirement: 'Vulnerability Analysis', controlId: 'PTES-3', requires: ['vuln_scan', 'exploit_test'] }
    ]);
    this.standardRules.set('OWASP', [
      { standard: 'OWASP', requirement: 'Injection Testing', controlId: 'OWASP-A3', requires: ['sqlmap', 'xss_test'] }
    ]);
  }

  async logToolExecution(
    campaignId: string,
    targetId: string,
    tool: string,
    action: string,
    input: string,
    output: string,
    severity: string,
    actor: string
  ): Promise<void> {
    const inputHash = createHash('sha256').update(input).digest('hex');
    const outputHash = createHash('sha256').update(output).digest('hex');
    const evidenceUri = await this.storeEvidence(campaignId, targetId, tool, output);

    const event: AuditEvent = {
      timestamp: new Date(),
      campaignId,
      targetId,
      tool,
      action,
      input,
      inputHash,
      output,
      outputHash,
      severity,
      complianceTags: this.extractComplianceTags(tool),
      evidenceUri,
      actor
    };

    this.eventLog.push(event);
    await this.appendToLog(event);
  }

  private extractComplianceTags(tool: string): string[] {
    const tagMap: Record<string, string[]> = {
      nmap: ['port_scan', 'network_scan'],
      sqlmap: ['injection', 'database_test'],
      echidna: ['smart_contract_test', 'property_test']
    };
    return tagMap[tool] || [tool];
  }

  private async storeEvidence(campaignId: string, targetId: string, tool: string, data: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `${campaignId}_${targetId}_${tool}_${timestamp}.txt`;
    const filepath = join(this.dataDir, 'evidence', filename);
    await fs.writeFile(filepath, data);
    return filepath;
  }

  private async appendToLog(event: AuditEvent): Promise<void> {
    await fs.appendFile(this.logFile, JSON.stringify(event) + '\n');
  }

  async generateComplianceReport(campaignId: string, standard: ComplianceStandard): Promise<string> {
    const rules = this.standardRules.get(standard) || [];
    const campaignEvents = this.eventLog.filter(e => e.campaignId === campaignId);
    let report = `# ${standard} Compliance Report\n\nCampaign: ${campaignId}\n\n`;

    for (const rule of rules) {
      const satisfied = campaignEvents.some(e => rule.requires.some(req => e.complianceTags.includes(req)));
      report += `### ${rule.controlId}: ${rule.requirement}\nStatus: ${satisfied ? '✅' : '❌'}\n\n`;
    }
    return report;
  }
}