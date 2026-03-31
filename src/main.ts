#!/usr/bin/env node
import { Command } from 'commander';
import { ChuckAgent } from './tools/agent';
import chalk from 'chalk';

const program = new Command();

program
  .name('chuck')
  .description('Chuck - Local Autonomous operative')
  .argument('<goal>', 'The task for Chuck to perform')
  .action(async (goal) => {
    const agent = new ChuckAgent();
    await agent.solve(goal);
  });

program.parse();