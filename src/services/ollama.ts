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

    const keywords = prompt.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const relevantFiles = [];

    for (const file of files) {
      const content = await fs.readFile(path.join(obsDir, file), 'utf-8');
      const score = keywords.reduce((s, k) => s + (content.toLowerCase().includes(k) ? 1 : 0), 0);
      if (score > 0) relevantFiles.push({ file, content, score });
    }

    return relevantFiles
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(f => `[Historical Observation: ${f.file}]\n${f.content}`)
      .join('\n\n');
  } catch {
    return "";
  }
}

export async function queryOllama(prompt: string, model: string = process.env.CHUCK_CODE_OLLAMA_MODEL || 'llama3'): Promise<string> {
  const host = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  // Ensure we append the correct path if only the base URL is provided
  const endpoint = host.endsWith('/api/generate') ? host : `${host.replace(/\/$/, '')}/api/generate`;
  
  try {
    const obsContext = await getRelevantObservations(prompt);
    const enrichedPrompt = obsContext 
      ? `RELEVANT PAST OBSERVATIONS:\n${obsContext}\n\nCURRENT TASK:\n${prompt}`
      : prompt;

    logForDebugging(`Querying Ollama at: ${endpoint}`);

    const res = await axios.post(endpoint, {
      model,
      prompt: enrichedPrompt,
      stream: false,
      options: {
        temperature: 0.2
      }
    });

    return res.data.response;
  } catch (error) {
    throw new Error(`Ollama Connection Failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}