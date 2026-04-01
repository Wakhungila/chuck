import { Text, Box, Newline } from 'ink';
import React from 'react';
import { RangerHeader } from './RangerUI';

export const WelcomeScreen = () => (
  <Box flexDirection="column" padding={2}>
    <RangerHeader />
    <Box borderStyle="round" borderColor="green" padding={2}>
      <Text color="gray">
        Welcome to <Text color="greenBright" bold>CHUCK</Text> — your autonomous red-team ranger.
      </Text>
    </Box>
    <Newline />
    <Text color="yellowBright">Let’s get started.</Text>
    <Newline />
    <Text bold>Choose your patrol style:</Text>
    <Text color="green">1. Dark Ranger (default) ✓</Text>
    <Text color="gray">2. Light Scout</Text>
    <Text color="gray">3. Night Ops (colorblind-friendly)</Text>
    <Newline />
    <Text color="cyan">Type your mission goal below and press Enter...</Text>
  </Box>
);
