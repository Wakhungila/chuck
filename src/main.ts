#!/usr/bin/env node
import { Command } from 'commander';
import { ChuckAgent } from './tools/agent';
import chalk from 'chalk';
import { verifyOllamaService } from './services/ollama';

const program = new Command();

program
  .name('chuck')
  .description('Chuck - Local Autonomous operative')
  .argument('<goal>', 'The task for Chuck to perform')
  .action(async (goal) => {
    try {
      const model = process.env.CHUCK_CODE_OLLAMA_MODEL || 'phi3';
      await verifyOllamaService(model);
      const agent = new ChuckAgent();
      await agent.solve(goal);
    } catch (error) {
      console.error(chalk.red(`[!] Critical Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();