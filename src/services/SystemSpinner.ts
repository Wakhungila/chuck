import chalk from 'chalk';
import { VERB_POOL } from './VerbPool';
import { SystemStage } from '../tools/Types';

export class SystemSpinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private timer: NodeJS.Timeout | null = null;
  private verbTimer: NodeJS.Timeout | null = null;
  private currentVerb = "";
  private customMessage: string | null = null;
  private currentStage: SystemStage = 'ANALYZER';

  constructor() {}

  private getStageColor(stage: SystemStage) {
    switch (stage) {
      case 'PLANNER': return chalk.yellow;
      case 'RECON': return chalk.magenta;
      case 'FUZZER': return chalk.cyan;
      case 'ANALYZER': return chalk.blue;
      case 'EXPLOIT': return chalk.red;
      case 'REPORT': return chalk.green;
      default: return chalk.cyan;
    }
  }

  private getRandomVerb(stage: SystemStage): string {
    const pool = stage === 'REPORT' ? VERB_POOL.SYNTHESIS : VERB_POOL[stage as keyof typeof VERB_POOL] || VERB_POOL.RECON;
    // 10% chance for a quirky verb
    if (Math.random() > 0.9) return VERB_POOL.QUIRKY[Math.floor(Math.random() * VERB_POOL.QUIRKY.length)];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  public start(stage: SystemStage = 'ANALYZER', message?: string) {
    if (this.timer) this.stop(true);

    this.currentStage = stage;
    this.currentVerb = this.getRandomVerb(stage);
    this.customMessage = message || null;
    
    // Rotate Verb every 1.5 seconds
    this.verbTimer = setInterval(() => {
      this.currentVerb = this.getRandomVerb(this.currentStage);
    }, 1500);

    // Render Spinner Frames
    this.timer = setInterval(() => {
      const frame = chalk.cyan(this.frames[this.frameIndex]);
      const stageName = this.currentStage.charAt(0) + this.currentStage.slice(1).toLowerCase();
      const stageTag = this.getStageColor(this.currentStage)(`[${stageName}]`);
      const displayMsg = this.customMessage || `${this.currentVerb}...`;
      
      process.stdout.write(`\r${frame} ${stageTag} ${chalk.white(displayMsg)}\x1b[K`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  public setStage(stage: SystemStage, message?: string) {
    this.start(stage, message);
  }

  public stop(success: boolean = true, finalMessage?: string) {
    if (this.timer) clearInterval(this.timer);
    if (this.verbTimer) clearInterval(this.verbTimer);
    
    const symbol = success ? chalk.green('✔') : chalk.red('✘');
    const stageName = this.currentStage.charAt(0) + this.currentStage.slice(1).toLowerCase();
    const stageTag = this.getStageColor(this.currentStage)(`[${stageName}]`);
    const msg = finalMessage || (success ? `${this.customMessage || 'Complete'}` : 'Operation failed');
    
    process.stdout.write(`\r${chalk.green(`[${symbol}]`)} ${msg}\n`);
  }
}

export const orchestratorUI = new SystemSpinner();