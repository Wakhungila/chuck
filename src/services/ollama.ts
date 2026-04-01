import axios from 'axios';
import fs from 'node:fs/promises';
import path from 'node:path';
import { logForDebugging } from '../utils/debug.js';

export interface OllamaResponse {
  response: string;
  done: boolean;
}

async function getRelevantObservations(prompt: string): Promise<string> {
  const obsDir = path.join(process.cwd(), '.chuck', 'observations');
  try {
    const files = await fs.readdir(obsDir);
    if (files.length === 0) return "";
  } catch (error) {
    // Silently handle missing directory on first run
    if ((error as any).code === 'ENOENT') {
      return "";
    }
    console.error('Error reading observations:', error);
    return "";
  }

  try {
    const files = await fs.readdir(obsDir);
    // EXTRACT KEYWORDS (better tokenization)
    const keywords = prompt
      .toLowerCase()
      .replace(/[^\\w\\s]/g, ' ')
      .split(/\\s+/)
      .filter(w => w.length > 2 && !['the', 'and', 'for', 'are'].includes(w));

    const scored: Array<{file: string; content: string; score: number; age: number}> = [];

    for (const file of files) {
      const filepath = path.join(obsDir, file);
      const stat = await fs.stat(filepath);
      const ageHours = (Date.now() - stat.mtimeMs) / (1000 * 60 * 60);
      
      const content = await fs.readFile(filepath, 'utf-8');
      
      // SEMANTIC MATCHING
      let score = 0;
      for (const keyword of keywords) {
        // Whole word match scores higher
        const wholeWordMatches = (content.match(new RegExp(`\\\\b${keyword}\\\\b`, 'gi')) || []).length;
        const partialMatches = (content.match(new RegExp(keyword, 'gi')) || []).length;
        score += (wholeWordMatches * 3) + (partialMatches * 1);
      }
      
      // RECENCY BOOST (recent findings weighted higher)
      const recencyBoost = Math.max(0.5, 1 - (ageHours / 720)); // Decay over 30 days
      score *= recencyBoost;
      
      if (score > 0) {
        scored.push({ file, content, score, age: ageHours });
      }
    }

    // RETURN TOP 5
    const top = scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    if (top.length === 0) return '';

    return top
      .map(f => {
        const ageStr = f.age < 1 ? 'now' : f.age < 24 ? `${Math.round(f.age)}h ago` : `${Math.round(f.age/24)}d ago`;
        return `[Observation from ${ageStr} (score: ${f.score.toFixed(1)})]:\\n${f.content}`;
      })
      .join('\\n\\n---\\n\\n');
  } catch (error) {
    console.error('Error reading observations:', error);
    return '';
  }
}

/**
 * Internal helper to pull a model from Ollama.
 */
async function pullModel(model: string, host: string): Promise<void> {
  const hostClean = host.replace(/\/$/, '');
  const endpoint = `${hostClean}/api/pull`;
  console.log(`[*] Model "${model}" not found. Attempting to pull from Ollama library...`);
  try {
    await axios.post(endpoint, { name: model, stream: false }, { timeout: 0 });
    console.log(`[+] Successfully pulled ${model}`);
  } catch (error) {
    throw new Error(`Failed to pull model "${model}": ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Verifies if the Ollama service is reachable and pulls the model if missing.
 */
export async function verifyOllamaService(model?: string): Promise<void> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const hostClean = host.replace(/\/$/, '');
  try {
    const tagsRes = await axios.get(`${hostClean}/api/tags`, { timeout: 5000 });
    if (model) {
      const models = tagsRes.data.models || [];
      // Exact match or prefix match (to handle :latest tags)
      const exists = models.some((m: any) => m.name === model || m.name === `${model}:latest`);
      if (!exists) {
        await pullModel(model, hostClean);
      }
    }
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      throw new Error(`Ollama error: ${error.message}`);
    }
    throw new Error(`Ollama service is not reachable at ${host}. Please ensure Ollama is running.`);
  }
}

export async function queryOllama(prompt: string, model: string = process.env.CHUCK_CODE_OLLAMA_MODEL || 'phi3'): Promise<string> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  // Ensure we append the correct path if only the base URL is provided
  const endpoint = host.endsWith('/api/generate') ? host : `${host.replace(/\/$/, '')}/api/generate`;
  
  // RETRY LOGIC - exponential backoff
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const obsContext = await getRelevantObservations(prompt);
      const enrichedPrompt = obsContext 
        ? `RELEVANT OBSERVATIONS:\\n${obsContext}\\n\\nTASK:\\n${prompt}`
        : prompt;

      logForDebugging(`Querying Ollama at: ${endpoint}`);

      const res = await axios.post(endpoint, {
        model,
        prompt: enrichedPrompt,
        stream: false,
        options: {
          temperature: 0.7,      // INCREASED - allow creativity
          top_k: 40,
          top_p: 0.9,
          num_ctx: 2048,         // INCREASED
          num_predict: 1024,     // DOUBLED
          num_thread: 4,         // ADAPTIVE
        }
      }, {
        timeout: 60000 // 60s timeout
      });

      return res.data.response;
    } catch (error) {
      if (attempt < 2) {
        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      let msg = error instanceof Error ? error.message : String(error);
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        msg = `Model "${model}" not found. Please run 'ollama pull ${model}' in your terminal.`;
      }
      throw new Error(`Ollama failed after 3 attempts: ${msg}`);
    }
  }
  return ""; // Fallback
}