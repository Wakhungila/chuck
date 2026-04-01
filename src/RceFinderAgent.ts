import { SecurityOrchestrator } from '../services/security/securityOrchestrator.js';
import { ReasoningEngine } from '../services/reasoningEngine.js';
import { queryOllama } from '../services/ollama.js';
import { runCommand } from '../tools/shell.js';
import { Vulnerability } from '../services/complianceLogger.js';
import chalk from 'chalk';
import path from 'node:path';
import fs from 'node:fs/promises';

export class RceFinderAgent {
  private orchestrator: SecurityOrchestrator;
  private reasoningEngine: ReasoningEngine;
  private findings: Vulnerability[] = [];
  private campaignId: string | null = null;

  constructor(private model: string = process.env.CHUCK_CODE_OLLAMA_MODEL || 'phi3') {
    this.orchestrator = new SecurityOrchestrator();
    this.reasoningEngine = new ReasoningEngine(this.model);
    
    // Listen for vulnerabilities found by automated tools managed by the orchestrator
    this.orchestrator.on('vulnerability:discovered', (data) => {
      const { vulnerability } = data;
      if (vulnerability.severity === 'critical' || vulnerability.type.toLowerCase().includes('rce')) {
        console.log(chalk.red(`\n[!] CRITICAL RCE VECTOR DISCOVERED: ${vulnerability.description}`));
        this.findings.push(vulnerability);
      }
    });
  }

  async findRce(targetHost: string, targetType: 'web' | 'api' | 'binary') {
    console.log(chalk.blue(`[*] Starting RCE Discovery Campaign on ${targetHost}...`));

    // 1. Initialize a Campaign via the Orchestrator
    this.campaignId = await this.orchestrator.createSecurityAssessment({
      name: `RCE Search: ${targetHost}`,
      description: `Targeted search for Remote Code Execution vulnerabilities on ${targetHost}`,
      status: 'active',
      compliance: ['OWASP', 'PTES'],
      scope: [targetHost],
      excludedPaths: [],
      startTime: new Date(),
      targets: [{
        host: targetHost,
        type: targetType === 'binary' ? 'binary' : 'web',
        status: 'pending',
        priority: 10,
        metadata: { goal: 'RCE' }
      }]
    });

    const systemPrompt = `
You are an elite Adversarial Security Researcher focused ONLY on Remote Code Execution (RCE).
Target: ${targetHost}
Type: ${targetType}

Your goal is to identify points where user-controlled input reaches a sink that can execute code (e.g., system(), exec(), eval(), unsanitized deserialization).

Available Actions:
- COMMAND: <cmd> (Run shell tools like nmap, ffuf, etc.)
- ORCHESTRATE: <tool> (Ask the SecurityOrchestrator to start a specialized 'fuzzing' or 'symbolic' task)
- ANALYZE: Synthesize findings into an exploit chain.
- FINISHED: <summary>
`;

    let currentPrompt = `${systemPrompt}\nTask: Identify RCE entry points on ${targetHost}`;
    let iterations = 0;

    while (iterations < 10) {
      const response = await queryOllama(currentPrompt, this.model);
      console.log(chalk.gray(`[RceFinder]: ${response}`));

      if (response.includes('FINISHED:')) break;

      if (response.includes('ORCHESTRATE:')) {
        const taskType = response.split('ORCHESTRATE:')[1].split('\n')[0].trim();
        if (taskType === 'fuzzing') {
          console.log(chalk.magenta(`[*] Orchestrating fuzzing session for ${targetHost}...`));
          await this.orchestrator.getFuzzingOrchestrator().initLibFuzzerSession({
            id: targetHost,
            name: `RCE_Fuzz_${targetHost}`,
            path: targetHost // For web, this might be an endpoint path
          });
        }
      }

      if (response.includes('COMMAND:')) {
        const cmd = response.split('COMMAND:')[1].split('\n')[0].trim();
        console.log(chalk.yellow(`[>] Executing: ${cmd}`));
        const output = await runCommand(cmd);
        
        // Persist observation
        const obsPath = path.join('.chuck', 'observations', `rce_obs_${Date.now()}.txt`);
        await fs.mkdir(path.dirname(obsPath), { recursive: true });
        await fs.writeFile(obsPath, `Cmd: ${cmd}\nOutput: ${output}`);

        currentPrompt += `\nObservation: ${output}\nNext step?`;
      }

      // If we have critical findings, try to synthesize an exploit chain
      if (this.findings.length > 0 && response.includes('ANALYZE')) {
        console.log(chalk.cyan(`[*] Synthesizing exploit chain from ${this.findings.length} vectors...`));
        const plan = await this.reasoningEngine.synthesizeExploitChain(this.findings);
        
        console.log(chalk.green(`\n[+] PROPOSED EXPLOIT CHAIN:`));
        console.log(JSON.stringify(plan.chain, null, 2));
        console.log(chalk.red(`\n[!] POC CODE GENERATED:`));
        console.log(plan.poc_code);
        
        // Log findings to the campaign artifacts via orchestrator
        const report = await this.orchestrator.generateSecurityReport(this.campaignId, 'OWASP');
        console.log(chalk.blue(`\n[*] Final Campaign Report generated.`));
        break;
      }

      iterations++;
    }
  }
}