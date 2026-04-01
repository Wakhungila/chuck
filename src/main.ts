#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { verifyOllamaService } from './services/ollama';
import { ExecutionLoop } from './tools/ExecutionLoop';
import { PlannerAgent } from './tools/PlannerAgent';
import { ToolRouter } from './tools/ToolRouter';
import { CriticAgent } from './tools/CriticAgent';
import './tools/ToolRegistry'; // Ensure tools are initialized

const program = new Command();

program
  .name('chuck')
  .description('Chuck - Local Autonomous operative')
  .argument('<goal>', 'The task for Chuck to perform')
  .action(async (goal) => {
    try {
      const model = process.env.CHUCK_CODE_OLLAMA_MODEL || 'mistral:7b-instruct-q4_0';
      await verifyOllamaService(model);

      const loop = new ExecutionLoop(
        new PlannerAgent(),
        new ToolRouter(),
        new CriticAgent()
      );
      await loop.start(goal);
    } catch (error) {
      console.error(chalk.red(`[!] Critical Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

program.parse();