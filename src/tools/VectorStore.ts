import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';

export interface MemoryEntry {
  text: string;
  metadata: any;
  embedding: number[];
}

export class VectorStore {
  private storagePath = path.join(process.cwd(), '.chuck', 'vector_store.json');
  private entries: MemoryEntry[] = [];

  async load() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      this.entries = JSON.parse(data);
    } catch {
      this.entries = [];
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(this.entries));
  }

  async add(text: string, metadata: any) {
    const embedding = await this.getEmbedding(text);
    this.entries.push({ text, metadata, embedding });
    await this.save();
  }

  async search(query: string, limit = 3): Promise<string[]> {
    const queryVector = await this.getEmbedding(query);
    
    const scored = this.entries.map(entry => ({
      text: entry.text,
      score: this.cosineSimilarity(queryVector, entry.embedding)
    }));

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(e => e.text);
  }

  private async getEmbedding(text: string): Promise<number[]> {
    const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
    const endpoint = `${host.replace(/\/api\/generate$/, '').replace(/\/$/, '')}/api/embeddings`;
    const res = await axios.post(endpoint, {
      model: process.env.CHUCK_CODE_OLLAMA_MODEL || 'mistral:7b-instruct-q4_0',
      prompt: text
    });
    return res.data.embedding;
  }

  private cosineSimilarity(v1: number[], v2: number[]): number {
    let dotProduct = 0;
    for (let i = 0; i < v1.length; i++) dotProduct += v1[i] * v2[i];
    const mag1 = Math.sqrt(v1.reduce((sum, val) => sum + val * val, 0));
    const mag2 = Math.sqrt(v2.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (mag1 * mag2);
  }
}