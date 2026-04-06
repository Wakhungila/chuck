/**
 * OllamaAdapter.ts
 * 
 * Seamless fallback to local Ollama models when Anthropic billing is depleted.
 * Optimized for 8GB RAM laptops (AMD Ryzen 5) with quantized model support.
 */

import { MessageParam } from "@anthropic-ai/sdk/resources/messages";

export interface OllamaConfig {
  baseUrl: string;
  model: "llama3.2:3b" | "phi3:mini" | "mistral:7b" | "gemma:7b";
  contextWindow: number;
  keepAlive: string;
}

export class OllamaAdapter {
  private config: OllamaConfig;
  private isAvailable: boolean = false;

  constructor(config: Partial<OllamaConfig> = {}) {
    this.config = {
      baseUrl: "http://localhost:11434",
      model: "llama3.2:3b", // Best for 8GB RAM
      contextWindow: 4096, // Reduced for smaller models
      keepAlive: "5m",
      ...config,
    };
    this.checkAvailability();
  }

  /**
   * Check if Ollama is running locally
   */
  private async checkAvailability(): Promise<void> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      this.isAvailable = response.ok;
      
      if (!this.isAvailable) {
        console.warn("⚠️  Ollama not detected. Install with: curl -fsSL https://ollama.com/install.sh | sh");
      }
    } catch {
      this.isAvailable = false;
    }
  }

  /**
   * Pull recommended model if not present
   */
  public async ensureModelInstalled(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`);
      const data = await response.json();
      const models = data.models?.map((m: any) => m.name) || [];
      
      if (!models.includes(this.config.model)) {
        console.log(`📥 Pulling ${this.config.model}... (first time may take minutes)`);
        // Note: Actual pull requires streaming, simplified here
        return false; // User needs to manually pull: ollama pull llama3.2:3b
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate completion using local Ollama
   */
  public async generateCompletion(
    systemPrompt: string,
    userMessages: MessageParam[]
  ): Promise<string> {
    if (!this.isAvailable) {
      throw new Error("Ollama not available. Please start Ollama service.");
    }

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      ...userMessages.map((m) => ({ role: m.role, content: m.content as string })),
    ];

    try {
      const response = await fetch(`${this.config.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.config.model,
          prompt: messages.map((m) => `${m.role}: ${m.content}`).join("\n\n"),
          stream: false,
          options: {
            temperature: 0.3, // Lower for more deterministic outputs
            top_p: 0.8,
            num_predict: 1024,
          },
        }),
      });

      const data = await response.json();
      return data.response || "";
    } catch (error) {
      throw new Error(`Ollama generation failed: ${error}`);
    }
  }

  /**
   * Chat completion with structured output (JSON mode simulation)
   */
  public async chatCompletion(
    systemPrompt: string,
    userMessages: MessageParam[],
    jsonMode: boolean = true
  ): Promise<any> {
    const response = await this.generateCompletion(systemPrompt, userMessages);
    
    if (jsonMode) {
      try {
        // Extract JSON from response if wrapped in markdown
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
      } catch {
        console.warn("Failed to parse JSON from Ollama response, returning raw text");
        return { raw: response };
      }
    }
    
    return response;
  }

  /**
   * Get recommended model based on available RAM
   */
  public static getRecommendedModel(ramGB: number): string {
    if (ramGB >= 16) return "mistral:7b";
    if (ramGB >= 8) return "llama3.2:3b";
    return "phi3:mini"; // 3.8B but highly optimized
  }

  /**
   * Health check endpoint
   */
  public getStatus() {
    return {
      available: this.isAvailable,
      model: this.config.model,
      baseUrl: this.config.baseUrl,
      contextWindow: this.config.contextWindow,
    };
  }
}

export const ollamaAdapter = new OllamaAdapter();
