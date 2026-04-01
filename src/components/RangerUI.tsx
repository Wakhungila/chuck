import { Text, Box, Newline, Spacer } from 'ink';
import React from 'react';

const RANGER_ASCII = `
   /\\
  /  \\\\
 /\\\\  /\\
/__\\\\/__\\
|  RANGER  |
\\\\  CHUCK  /
 \\\\      /
  \\\\____/
`;

export const RangerHeader = () => (
  <Box flexDirection="column" alignItems="center" borderStyle="round" borderColor="green" padding={1}>
    <Text color="greenBright" bold>{RANGER_ASCII}</Text>
    <Text color="green" bold>CHUCK v0.2.0 • RED TEAM RANGER EDITION</Text>
    <Text color="gray">Autonomous Offensive Security Agent</Text>
    <Newline />
  </Box>
);
