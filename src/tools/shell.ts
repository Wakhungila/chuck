import { execa } from 'execa';
import { readFile as fsReadFile, writeFile as fsWriteFile } from 'fs/promises';

export async function runCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execa(command, { shell: true });
    return stdout || stderr;
  } catch (error: any) {
    return `Error: ${error.message}`;
  }
}

export async function readFile(path: string): Promise<string> {
  return await fsReadFile(path, 'utf-8');
}

export async function writeFile(path: string, content: string): Promise<void> {
  await fsWriteFile(path, content);
}