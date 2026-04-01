import chalk from 'chalk';
import { VERB_POOL } from './VerbPool.js';

export type SystemStage = 'RECON' | 'ANALYZER' | 'EXPLOIT' | 'REPORT';

export class SystemSpinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private frameIndex = 0;
  private timer: NodeJS.Timeout | null = null;
  private verbTimer: NodeJS.Timeout | null = null;
  private currentVerb = "";
  private currentStage: SystemStage = 'ANALYZER';

  constructor() {}

  private getStageColor(stage: SystemStage) {
    switch (stage) {
      case 'RECON': return chalk.magenta;
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

  public start(stage: SystemStage = 'ANALYZER') {
    this.currentStage = stage;
    this.currentVerb = this.getRandomVerb(stage);
    
    // Rotate Verb every 1.5 seconds
    this.verbTimer = setInterval(() => {
      this.currentVerb = this.getRandomVerb(this.currentStage);
    }, 1500);

    // Render Spinner Frames
    this.timer = setInterval(() => {
      const frame = chalk.cyan(this.frames[this.frameIndex]);
      const stageTag = this.getStageColor(this.currentStage)(`[${this.currentStage}]`);
      const message = chalk.white(`${this.currentVerb}...`);
      
      process.stdout.write(`\r${frame} ${stageTag} ${message}\x1b[K`);
      this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    }, 80);
  }

  public setStage(stage: SystemStage) {
    this.currentStage = stage;
    this.currentVerb = this.getRandomVerb(stage);
  }

  public stop(success: boolean = true, finalMessage?: string) {
    if (this.timer) clearInterval(this.timer);
    if (this.verbTimer) clearInterval(this.verbTimer);
    
    const symbol = success ? chalk.green('✔') : chalk.red('✘');
    const msg = finalMessage || (success ? 'Task complete' : 'Operation failed');
    
    process.stdout.write(`\r${symbol} ${msg}\n`);
  }
}

export const orchestratorUI = new SystemSpinner();