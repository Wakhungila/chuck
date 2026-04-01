import { VectorStore } from './VectorStore';
import { Finding, SessionState } from '../tools/Types';
import chalk from 'chalk';

export class MemoryManager {
  private vectorStore: VectorStore;

  constructor() {
    this.vectorStore = new VectorStore();
  }

  async initialize() {
    await this.vectorStore.load();
  }

  /**
   * Persists a tactical observation or finding to long-term memory.
   */
  async remember(content: string, type: 'target' | 'vuln' | 'result', metadata: any = {}) {
    console.log(chalk.dim(`[Memory] Learning new ${type}...`));
    const formatted = `[${type.toUpperCase()}] ${content}`;
    await this.vectorStore.add(formatted, metadata);
  }

  /**
   * Retrieves relevant historical context for the current goal.
   */
  async getContext(query: string): Promise<string> {
    const results = await this.vectorStore.search(query);
    if (results.length === 0) return "No prior knowledge available.";
    return results.join('\n---\n');
  }

  /**
   * Syncs short-term session findings to long-term memory.
   */
  async syncSession(state: SessionState) {
    for (const finding of state.findings) {
      await this.remember(
        `${finding.title}: ${finding.description}`, 
        'vuln', 
        { severity: finding.severity }
      );
    }
    for (const target of state.targetsSeen) {
      await this.remember(target, 'target');
    }
  }
}