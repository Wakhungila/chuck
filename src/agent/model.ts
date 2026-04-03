/**
 * CHUCK MODEL LAYER
 * Priority: Claude API (best) → Ollama fallback with capable model.
 * Context window: 16k minimum (was 2048 — completely broken).
 */

export type Message = {
  role: "user" | "assistant" | "system";
  content: string;
};

const CLAUDE_MODEL = "claude-sonnet-4-6";
const OLLAMA_FALLBACK_MODEL = process.env.CHUCK_OLLAMA_MODEL || "qwen2.5-coder:14b";
const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";

export async function queryModel(messages: Message[]): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return queryClaudeAPI(messages, apiKey);
  console.warn("[chuck] No ANTHROPIC_API_KEY — falling back to Ollama. Quality will be lower.");
  return queryOllama(messages);
}

async function queryClaudeAPI(messages: Message[], apiKey: string): Promise<string> {
  const system = messages.find(m => m.role === "system")?.content || "";
  const conversation = messages
    .filter(m => m.role !== "system")
    .map(m => ({ role: m.role, content: m.content }));

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 4096, system, messages: conversation }),
  });

  if (!response.ok) throw new Error(`Claude API error ${response.status}: ${await response.text()}`);
  const data = await response.json() as any;
  const textBlock = data.content?.find((b: any) => b.type === "text");
  if (!textBlock) throw new Error("Claude API returned no text block");
  return textBlock.text;
}

async function queryOllama(messages: Message[]): Promise<string> {
  const ollamaMessages = messages.map(m => ({ role: m.role, content: m.content }));
  const response = await fetch(`${OLLAMA_HOST}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_FALLBACK_MODEL,
      messages: ollamaMessages,
      stream: false,
      temperature: 0.2,
      options: { num_ctx: 16384, num_predict: 2048 },
    }),
  });

  if (!response.ok) throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
  const data = await response.json() as any;
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Ollama returned empty response");
  return content;
}
