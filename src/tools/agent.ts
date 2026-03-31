import { queryOllama } from '../services/ollama';
import { runCommand } from '../tools/shell';
import chalk from 'chalk';
import fs from 'node:fs/promises';
import path from 'node:path';

class TaskTracker {
  private tasks: { id: number; text: string; status: 'pending' | 'done' }[] = [];

  addTask(text: string) {
    this.tasks.push({ id: this.tasks.length + 1, text, status: 'pending' });
  }

  completeTask(id: number) {
    const task = this.tasks.find(t => t.id === id);
    if (task) task.status = 'done';
  }

  getSummary() {
    if (this.tasks.length === 0) return "No tasks defined.";
    return this.tasks.map(t => `[${t.id}] ${t.text} (${t.status})`).join('\n');
  }
}

export class ChuckAgent {
  private taskTracker = new TaskTracker();

  constructor(private model: string = 'llama3') {}

  async solve(goal: string) {
    console.log(chalk.blue(`[*] Chuck is thinking about: ${goal}`));
    
    const systemPrompt = `You are Chuck, a local autonomous operative. 
    You follow a recursive Goal -> Plan -> Execute -> Observe loop.
    To run a command, respond with: COMMAND: <cmd>.
    To document a vulnerability finding, respond with: FINDING: <details>.
    To manage your plan, use: TASK: ADD <description> or TASK: DONE <id>.
    If you are done, respond with: FINISHED: <summary>.
    
    Focus on high-impact vulnerabilities: RCE, SQLi, IDOR, SSRF, and Logic Flaws.`;

    let currentPrompt = `${systemPrompt}\nGoal: ${goal}\nTasks:\n${this.taskTracker.getSummary()}`;
    let iterations = 0;
    const maxIterations = 10; // Increased for autonomous exploration

    while (iterations < maxIterations) {
      const response = await queryOllama(currentPrompt, this.model);
      console.log(chalk.gray(`[Chuck]: ${response}`));

      if (response.includes('FINISHED:')) {
        console.log(chalk.green(`\n[+] Task Complete.`));
        break;
      }

      if (response.includes('TASK: ADD')) {
        const taskDesc = response.split('TASK: ADD')[1].split('\n')[0].trim();
        this.taskTracker.addTask(taskDesc);
        console.log(chalk.cyan(`[+] Added Task: ${taskDesc}`));
      }

      if (response.includes('TASK: DONE')) {
        const taskId = parseInt(response.split('TASK: DONE')[1].trim());
        this.taskTracker.completeTask(taskId);
        console.log(chalk.cyan(`[+] Completed Task: ${taskId}`));
      }

      if (response.includes('FINDING:')) {
        const finding = response.split('FINDING:')[1].trim();
        console.log(chalk.red(`\n[!] VULNERABILITY IDENTIFIED: ${finding}`));
      }

      if (response.includes('COMMAND:')) {
        const cmd = response.split('COMMAND:')[1].trim();
        console.log(source_default.yellow(`\n[>] Executing: ${cmd}`));
        
        const output = await runCommand(cmd);

        // Save observation for RAG
        const obsDir = path.join(process.cwd(), '.chuck', 'observations');
        await fs.mkdir(obsDir, { recursive: true });
        const obsPath = path.join(obsDir, `obs_${Date.now()}.txt`);
        await fs.writeFile(obsPath, `Command: ${cmd}\nOutput:\n${output}`);
        
        // The Observer Layer: Force the model to analyze the output specifically for anomalies
        const analysisPrompt = `Command executed: ${cmd}\nOutput:\n${output}\n\nAnalyze this output. Do you see any:
        1. Vulnerability indicators?
        2. New attack surface/endpoints?
        3. Errors to retry?
        Update your plan and provide the next step (COMMAND or FINISHED).`;
        
        currentPrompt += `\nObservation: ${analysisPrompt}\nTasks:\n${this.taskTracker.getSummary()}`;
      } else {
        break;
      }
      
      iterations++;
    }
  }
}