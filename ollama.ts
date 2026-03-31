import { isEnvTruthy } from "../../utils/envUtils.js";

export async function queryOllama(messages: any[], model: string = "llama3") {
  const endpoint = process.env.OLLAMA_HOST || "http://localhost:11434";
  
  // Transform internal message format to Ollama/OpenAI format
  const ollamaMessages = messages.map(m => ({
    role: m.role || (m.type === 'assistant' ? 'assistant' : 'user'),
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
  }));

  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.CHUCK_CODE_OLLAMA_MODEL || model,
      messages: ollamaMessages,
      stream: false,
      temperature: 0.2 // Lower temperature for more reliable tool use
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama Error: ${await response.text()}`);
  }

  const data = await response.json() as any;
  return {
    text: data.choices[0].message.content,
    usage: {
      input_tokens: data.usage?.prompt_tokens || 0,
      output_tokens: data.usage?.completion_tokens || 0
    }
  };
}