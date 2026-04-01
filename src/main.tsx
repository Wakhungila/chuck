#!/usr/bin/env bun
import { render, Box } from 'ink';
import React from 'react';
import { Command } from 'commander';
import { verifyOllamaService } from './services/ollama';
import { ExecutionLoop } from './tools/ExecutionLoop';
import { PlannerAgent } from './tools/PlannerAgent';
import { ToolRouter } from './tools/ToolRouter';
import { CriticAgent } from './tools/CriticAgent';
import { WelcomeScreen } from './components/WelcomeScreen';

const program = new Command();

program
  .name('chuck')
  .description('Chuck - Local Autonomous Red Team Ranger')
  .argument('<goal>', 'The task for Chuck to perform')
  .action(async (goal: string) => {
    console.clear();

    // Show beautiful ranger welcome screen for 3 seconds
    const { unmount } = render(
      <Box flexDirection="column">
        <WelcomeScreen />
      </Box>
    );

    setTimeout(async () => {
      unmount();
      await startAgent(goal);
    }, 3000);
  });

async function startAgent(goal: string) {
  const model = process.env.CHUCK_CODE_OLLAMA_MODEL || 'phi3:mini';
  await verifyOllamaService(model);

  console.log(`\n[*] Chuck is thinking about: ${goal}\n`);

  const loop = new ExecutionLoop(
    new PlannerAgent(),
    new ToolRouter(),
    new CriticAgent()
  );
  await loop.start(goal);
}

program.parse();
