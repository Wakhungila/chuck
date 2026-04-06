/**
 * HybridModelRouter.ts
 * 
 * Intelligent router that switches between Anthropic Cloud and Local Ollama
 * based on billing status, task complexity, and resource availability.
 * 
 * STRATEGY:
 * - Complex reasoning → Anthropic (when credits available)
 * - Routine tasks → Local Ollama (free)
 * - Billing depleted → Auto-fallback to Ollama with reduced capabilities
 */

import { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { ollamaAdapter, OllamaAdapter } from "./OllamaAdapter";
import { TokenOptimizer } from "./TokenOptimizer";

export type ModelProvider = "anthropic" | "ollama" | "hybrid";

export interface RouterConfig {
  anthropicApiKey?: string;
  fallbackToOllama: boolean;
  complexTaskThreshold: number; // Tokens above this use cloud
  billingDepleted: boolean;
}

export class HybridModelRouter {
  private config: RouterConfig;
  private optimizer: TokenOptimizer;
  private ollama: OllamaAdapter;
  private tokenBudget: number = 0;
  private requestsToday: number = 0;

  constructor(config: Partial<RouterConfig> = {}) {
    this.config = {
      fallbackToOllama: true,
      complexTaskThreshold: 2000,
      billingDepleted: false,
      ...config,
    };
    this.optimizer = new TokenOptimizer();
    this.ollama = ollamaAdapter;
  }

  /**
   * Decide which provider to use for this request
   */
  private selectProvider(taskComplexity: number): ModelProvider {
    if (this.config.billingDepleted) {
      console.log("💸 Billing depleted → Using Ollama");
      return "ollama";
    }

    if (!this.config.anthropicApiKey) {
      return "ollama";
    }

    // High complexity tasks get cloud models
    if (taskComplexity > this.config.complexTaskThreshold) {
      console.log("🧠 High complexity → Using Anthropic");
      return "anthropic";
    }

    // Routine tasks go local to save money
    console.log("⚡ Routine task → Using Ollama (cost savings)");
    return "ollama";
  }

  /**
   * Main generation method with automatic routing
   */
  public async generate(
    systemPrompt: string,
    messages: MessageParam[],
    taskType: "recon" | "exploitation" | "analysis" | "reporting"
  ): Promise<any> {
    const taskComplexity = this.estimateTaskComplexity(messages);
    const provider = this.selectProvider(taskComplexity);

    // Optimize context before sending
    const optimizedMessages = this.optimizer.buildOptimizedContext(
      systemPrompt,
      messages
    );

    try {
      if (provider === "ollama") {
        return await this.handleOllama(systemPrompt, optimizedMessages, taskType);
      } else {
        return await this.handleAnthropic(systemPrompt, optimizedMessages, taskType);
      }
    } catch (error) {
      // Auto-fallback if cloud fails
      if (provider === "anthropic" && this.config.fallbackToOllama) {
        console.warn("⚠️  Anthropic failed, falling back to Ollama...");
        return await this.handleOllama(systemPrompt, optimizedMessages, taskType);
      }
      throw error;
    }
  }

  /**
   * Handle Ollama generation with task-specific prompts
   */
  private async handleOllama(
    systemPrompt: string,
    messages: MessageParam[],
    taskType: string
  ): Promise<any> {
    const adaptedPrompt = this.adaptPromptForSmallModel(systemPrompt, taskType);
    
    return await this.ollama.chatCompletion(adaptedPrompt, messages, true);
  }

  /**
   * Handle Anthropic generation (placeholder for actual SDK integration)
   */
  private async handleAnthropic(
    systemPrompt: string,
    messages: MessageParam[],
    taskType: string
  ): Promise<any> {
    // In production, integrate with @anthropic-ai/sdk
    // This is a placeholder showing the structure
    console.log("📤 Sending to Anthropic API...");
    
    // Simulated response structure
    return {
      content: "Anthropic response placeholder",
      usage: { input_tokens: 100, output_tokens: 200 },
    };
  }

  /**
   * Adapt prompts for smaller local models
   * Smaller models need more explicit instructions
   */
  private adaptPromptForSmallModel(prompt: string, taskType: string): string {
    const adaptations: Record<string, string> = {
      recon: `You are a reconnaissance assistant. Output ONLY JSON. Format: {"targets": [], "ports": [], "services": []}. Be concise.`,
      exploitation: `You are an exploitation assistant. Think step-by-step. Output JSON: {"vulnerability": "", "poc": "", "risk": ""}.`,
      analysis: `You are an analysis assistant. Summarize findings in simple terms. JSON: {"summary": "", "severity": "", "recommendations": []}.`,
      reporting: `You are a reporting assistant. Create clear bullet points. JSON: {"executive_summary": "", "findings": []}.`,
    };

    return `${adaptations[taskType] || adaptations.analysis}\n\n${prompt}`;
  }

  /**
   * Estimate task complexity based on message length and keywords
   */
  private estimateTaskComplexity(messages: MessageParam[]): number {
    const totalLength = messages.reduce((sum, m) => sum + (m.content as string).length, 0);
    const complexKeywords = ["exploit", "chain", "bypass", "advanced", "custom"];
    const hasComplexKeywords = messages.some((m) =>
      complexKeywords.some((kw) => (m.content as string).toLowerCase().includes(kw))
    );

    return totalLength / 4 + (hasComplexKeywords ? 1000 : 0); // Rough token estimate
  }

  /**
   * Set billing status (call this when you detect API errors)
   */
  public setBillingDepleted(depleted: boolean) {
    this.config.billingDepleted = depleted;
    if (depleted) {
      console.log("🚨 ANTHROPIC BILLING DEPLETED - Switching to LOCAL MODE");
    }
  }

  /**
   * Get current mode status
   */
  public getStatus() {
    return {
      provider: this.config.billingDepleted ? "ollama" : "hybrid",
      billingDepleted: this.config.billingDepleted,
      ollamaAvailable: this.ollama.getStatus().available,
      tokenSavings: this.optimizer.getEfficiencyReport(1000, 400),
    };
  }
}

export const hybridRouter = new HybridModelRouter();
