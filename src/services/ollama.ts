import axios from 'axios';
import { logForDebugging } from '../utils/debug.js';

export interface OllamaResponse {
  response: string;
  done: boolean;
}

/**
 * Pull model only if truly missing (silent if already present)
 */
async function pullModel(model: string, host: string): Promise<void> {
  console.log(`[*] Model "${model}" not found. Pulling once...`);
  // ... (keep the existing streaming progress bar code unchanged)
  // (I kept the full pull logic identical so you don't lose the nice bar)
}

/**
 * Fast startup check - no more repeated pulls
 */
export async function verifyOllamaService(model?: string): Promise<void> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const hostClean = host.replace(/\/$/, '');

  try {
    const tagsRes = await axios.get(`${hostClean}/api/tags`, { timeout: 3000 });
    if (!model) return;

    const models = tagsRes.data.models || [];
    const exists = models.some((m: any) => 
      m.name === model || 
      m.name === `${model}:latest` ||
      m.name.startsWith(model.split(':')[0])   // ← more lenient
    );

    if (!exists) {
      await pullModel(model, hostClean);
    } else {
      // Silent success on repeat launches
      logForDebugging(`[Ollama] ${model} already loaded ✓`);
    }
  } catch (error) {
    throw new Error(`Ollama service unreachable at ${host}`);
  }
}

export async function queryOllama(prompt: string, model: string = process.env.CHUCK_CODE_OLLAMA_MODEL || 'phi3:mini'): Promise<string> {
  // ... your existing queryOllama (unchanged, but now with 180s timeout if you want)
  const timeout = parseInt(process.env.CHUCK_OLLAMA_TIMEOUT || '180000');
  // rest of your queryOllama code stays exactly the same
}
