/**
 * Campaign Manager - Multi-target security research orchestration
 * Handles creation, tracking, and execution of pentesting campaigns
 */

import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import EventEmitter from 'node:events';

export type TargetType = 'api' | 'web' | 'smart_contract' | 'binary' | 'network' | 'database';
export type CampaignStatus = 'planning' | 'active' | 'paused' | 'completed' | 'failed';
export type TargetStatus = 'pending' | 'scanning' | 'exploiting' | 'completed' | 'failed';

export interface TestTarget {
  id: string;
  campaignId: string;
  type: TargetType;
  host: string;
  port?: number;
  protocol?: string;
  authentication?: Record<string, string>;
  metadata: Record<string, any>;
  status: TargetStatus;
  priority: number; // 1-10, higher = priority
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  findings: Vulnerability[];
}

export interface Vulnerability {
  id: string;
  targetId: string;
  type: string; // SQLi, XSS, RCE, etc.
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  cvss: number;
  description: string;
  evidence: string;
  exploitable: boolean;
  proof: string;
  discoveredAt: Date;
  tool: string; // which tool found it
}

export interface PentestCampaign {
  id: string;
  name: string;
  description: string;
  targets: TestTarget[];
  status: CampaignStatus;
  compliance: string[]; // 'PTES', 'OWASP', 'PCI-DSS', 'HIPAA'
  scope: string[]; // CIDRs/domains in scope
  excludedPaths: string[]; // paths to skip
  startTime: Date;
  endTime?: Date;
  artifacts: {
    vulnLog: string;
    evidenceDir: string;
    reportPath: string;
  };
  statistics: {
    totalTargets: number;
    completedTargets: number;
    vulnerabilitiesFound: number;
    criticalCount: number;
    startTime: Date;
  };
}

export interface JobQueueItem {
  id: string;
  campaignId: string;
  targetId: string;
  priority: number;
  tool: string; // which tool to use
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: any;
  error?: string;
}

export class CampaignManager extends EventEmitter {
  private campaigns: Map<string, PentestCampaign> = new Map();
  private targets: Map<string, TestTarget> = new Map();
  private jobQueue: JobQueueItem[] = [];
  private activeJobs: Map<string, JobQueueItem> = new Map();
  private dataDir: string;
  private maxConcurrentJobs: number = 5;
  private jobWorkers: number = 0;

  constructor(dataDir: string = '.chuck/campaigns') {
    super();
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(join(this.dataDir, 'evidence'), { recursive: true });
      await fs.mkdir(join(this.dataDir, 'reports'), { recursive: true });
    } catch (error) {
      console.error('Failed to create campaign directories:', error);
    }
  }

  async createCampaign(config: Omit<PentestCampaign, 'id' | 'artifacts' | 'statistics'>): Promise<string> {
    const id = randomUUID();
    const campaign: PentestCampaign = {
      ...config,
      id,
      targets: [],
      artifacts: {
        vulnLog: join(this.dataDir, `${id}_vulns.jsonl`),
        evidenceDir: join(this.dataDir, 'evidence', id),
        reportPath: join(this.dataDir, 'reports', `${id}_report.md`)
      },
      statistics: {
        totalTargets: 0,
        completedTargets: 0,
        vulnerabilitiesFound: 0,
        criticalCount: 0,
        startTime: new Date()
      }
    };

    this.campaigns.set(id, campaign);
    await this.persistCampaign(id);
    this.emit('campaign:created', { campaignId: id, campaign });
    return id;
  }

  async addTarget(campaignId: string, target: Omit<TestTarget, 'id' | 'campaignId' | 'findings' | 'createdAt'>): Promise<string> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const targetId = randomUUID();
    const newTarget: TestTarget = {
      ...target,
      id: targetId,
      campaignId,
      findings: [],
      createdAt: new Date()
    };

    this.targets.set(targetId, newTarget);
    campaign.targets.push(newTarget);
    campaign.statistics.totalTargets++;

    this.queueJob({
      campaignId,
      targetId,
      tool: 'nmap',
      priority: target.priority || 5
    });

    await this.persistCampaign(campaignId);
    this.emit('target:added', { campaignId, targetId, target: newTarget });
    return targetId;
  }

  async queueJob(job: Omit<JobQueueItem, 'id' | 'status' | 'createdAt'>): Promise<string> {
    const jobId = randomUUID();
    const queueItem: JobQueueItem = {
      ...job,
      id: jobId,
      status: 'queued',
      createdAt: new Date()
    };

    this.jobQueue.push(queueItem);
    this.jobQueue.sort((a, b) => b.priority - a.priority);

    this.emit('job:queued', { jobId, job: queueItem });
    this.processQueue();
    return jobId;
  }

  private async processQueue(): Promise<void> {
    while (this.jobWorkers < this.maxConcurrentJobs && this.jobQueue.length > 0) {
      const job = this.jobQueue.shift()!;
      if (job.status === 'queued') {
        this.jobWorkers++;
        this.executeJob(job).finally(() => {
          this.jobWorkers--;
          this.processQueue();
        });
      }
    }
  }

  private async executeJob(job: JobQueueItem): Promise<void> {
    job.status = 'running';
    job.startedAt = new Date();

    const target = this.targets.get(job.targetId)!;
    const campaign = this.campaigns.get(job.campaignId)!;
    target.status = 'scanning';

    this.emit('job:started', { jobId: job.id, job });

    try {
      const result = await this.runSecurityTool(job.tool, target, campaign);

      job.result = result;
      job.status = 'completed';
      job.completedAt = new Date();

      if (result.vulnerabilities && Array.isArray(result.vulnerabilities)) {
        for (const vuln of result.vulnerabilities) {
          await this.recordVulnerability(job.targetId, vuln, job.tool);
        }
      }

      target.status = 'completed';
      this.emit('job:completed', { jobId: job.id, job, result });
    } catch (error) {
      job.error = error instanceof Error ? error.message : String(error);
      job.status = 'failed';
      job.completedAt = new Date();
      target.status = 'failed';

      this.emit('job:failed', { jobId: job.id, job, error });
    }

    await this.persistCampaign(job.campaignId);
  }

  private async recordVulnerability(
    targetId: string,
    vuln: Omit<Vulnerability, 'id' | 'targetId' | 'discoveredAt'>,
    tool: string
  ): Promise<void> {
    const target = this.targets.get(targetId)!;
    const vulnerability: Vulnerability = {
      ...vuln,
      id: randomUUID(),
      targetId,
      tool,
      discoveredAt: new Date()
    };

    target.findings.push(vulnerability);

    const campaign = this.campaigns.get(target.campaignId)!;
    campaign.statistics.vulnerabilitiesFound++;
    if (vuln.severity === 'critical') {
      campaign.statistics.criticalCount++;
    }

    await fs.appendFile(
      campaign.artifacts.vulnLog,
      JSON.stringify(vulnerability) + '\n'
    );

    this.emit('vulnerability:discovered', { targetId, vulnerability });
  }

  private async runSecurityTool(tool: string, target: TestTarget, campaign: PentestCampaign): Promise<any> {
    switch (tool) {
      case 'nmap':
        return { vulnerabilities: [{ type: 'Open Port', severity: 'info', cvss: 0, description: `Port ${target.port} is open`, evidence: `nmap ${target.host}`, exploitable: false, proof: '' }] };
      default:
        return { vulnerabilities: [] };
    }
  }

  getCampaign(campaignId: string): PentestCampaign | undefined {
    return this.campaigns.get(campaignId);
  }

  async completeCampaign(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    campaign.status = 'completed';
    campaign.endTime = new Date();
    await this.persistCampaign(campaignId);
    await this.generateFinalReport(campaignId);
    this.emit('campaign:completed', { campaignId });
  }

  private async persistCampaign(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;
    const filePath = join(this.dataDir, `${campaignId}.json`);
    await fs.writeFile(filePath, JSON.stringify(campaign, null, 2));
  }

  private async generateFinalReport(campaignId: string): Promise<void> {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    const report = `# Security Assessment Report\nCampaign: ${campaign.name}\nDate: ${new Date().toISOString()}\n\n## Summary\n- Total Targets: ${campaign.statistics.totalTargets}\n- Completed: ${campaign.statistics.completedTargets}\n- Vulnerabilities Found: ${campaign.statistics.vulnerabilitiesFound}\n- Critical Issues: ${campaign.statistics.criticalCount}\n\n## Compliance Status\nStandards: ${campaign.compliance.join(', ')}\n`;

    await fs.writeFile(campaign.artifacts.reportPath, report);
  }
}