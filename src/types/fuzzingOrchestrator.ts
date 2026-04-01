/**
 * Fuzzing Orchestrator - Manage libFuzzer, AFL++, Echidna campaigns
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';

export type FuzzerType = 'libfuzzer' | 'afl' | 'echidna' | 'custom';

export interface FuzzingTarget {
  id: string;
  name: string;
  path: string;
  maxLen?: number;
  timeout?: number;
}

export interface FuzzingSession {
  id: string;
  targetId: string;
  fuzzerType: FuzzerType;
  status: 'running' | 'paused' | 'completed' | 'failed';
  startTime: Date;
  crashes: any[];
  totalInputsTested: number;
  outputDir: string;
}

export class FuzzingOrchestrator extends EventEmitter {
  private sessions: Map<string, FuzzingSession> = new Map();
  private dataDir: string;

  constructor(dataDir: string = '.chuck/fuzzing') {
    super();
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.mkdir(join(this.dataDir, 'crashes'), { recursive: true });
    } catch (error) {
      console.error('Failed to create fuzzing directories:', error);
    }
  }

  async initLibFuzzerSession(target: FuzzingTarget, seedCorpus?: Buffer[]): Promise<string> {
    const sessionId = randomUUID();
    const outputDir = join(this.dataDir, `session_${sessionId}`);
    await fs.mkdir(outputDir, { recursive: true });

    const session: FuzzingSession = {
      id: sessionId,
      targetId: target.id,
      fuzzerType: 'libfuzzer',
      status: 'running',
      startTime: new Date(),
      crashes: [],
      totalInputsTested: 0,
      outputDir
    };

    this.sessions.set(sessionId, session);
    this.runLibFuzzer(sessionId, target);
    return sessionId;
  }

  private async runLibFuzzer(sessionId: string, target: FuzzingTarget): Promise<void> {
    const session = this.sessions.get(sessionId)!;
    try {
      const fuzzer = spawn('libFuzzer', [
        target.path,
        `-max_len=${target.maxLen || 1024}`,
        `-artifact_prefix=${session.outputDir}/crashes/`
      ]);

      fuzzer.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('SUMMARY')) {
          this.emit('fuzzing:crash', { sessionId, output });
        }
      });

      fuzzer.on('close', () => {
        session.status = 'completed';
        this.emit('session:completed', { sessionId });
      });
    } catch (error) {
      session.status = 'failed';
    }
  }

  async initEchidnaSession(contractPath: string, properties: string[]): Promise<string> {
    const sessionId = randomUUID();
    const outputDir = join(this.dataDir, `echidna_${sessionId}`);
    await fs.mkdir(outputDir, { recursive: true });

    const session: FuzzingSession = {
      id: sessionId,
      targetId: contractPath,
      fuzzerType: 'echidna',
      status: 'running',
      startTime: new Date(),
      crashes: [],
      totalInputsTested: 0,
      outputDir
    };

    this.sessions.set(sessionId, session);
    this.runEchidna(sessionId, contractPath, outputDir);
    return sessionId;
  }

  private async runEchidna(sessionId: string, contractPath: string, outputDir: string): Promise<void> {
    const session = this.sessions.get(sessionId)!;
    try {
      const echidna = spawn('echidna', [contractPath, '--corpus-dir', join(outputDir, 'corpus')]);
      echidna.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('FAILED')) {
          this.emit('fuzzing:crash', { sessionId, output });
        }
      });
      echidna.on('close', () => {
        session.status = 'completed';
      });
    } catch (error) {
      session.status = 'failed';
    }
  }
}