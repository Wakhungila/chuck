import type { QuerySource } from '../constants/querySource.js'
import { getCLISyspromptPrefix } from '../constants/system.js'
import { logEvent } from '../services/analytics/index.js'

export type SideQueryOptions = {
  /** Model to use for the query */
  model: string
  /**
   * System prompt - string or array of text blocks (will be prefixed with CLI attribution).
   *
   * The attribution header is always placed in its own TextBlockParam block to ensure
   * server-side parsing correctly extracts the cc_entrypoint value without including
   * system prompt content.
   */
  system?: string | any[]
  /** Messages to send (supports cache_control on content blocks) */
  messages: any[]
  /** Optional tools */
  tools?: any[]
  /** Optional tool choice (use { type: 'tool', name: 'x' } for forced output) */
  tool_choice?: any
  /** Optional JSON output format for structured responses */
  output_format?: any
  /** Max tokens (default: 1024) */
  max_tokens?: number
  /** Max retries (default: 2) */
  maxRetries?: number
  /** Abort signal */
  signal?: AbortSignal
  /** Skip CLI system prompt prefix (keeps attribution header for OAuth). For internal classifiers that provide their own prompt. */
  skipSystemPromptPrefix?: boolean
  /** Temperature override */
  temperature?: number
  /** Thinking budget (enables thinking), or `false` to send `{ type: 'disabled' }`. */
  thinking?: number | false
  /** Stop sequences — generation stops when any of these strings is emitted */
  stop_sequences?: string[]
  /** Attributes this call in tengu_api_success for COGS joining against reporting.sampling_calls. */
  querySource: QuerySource
}

/**
 * Extract text from first user message for fingerprint computation.
 */
function extractFirstUserMessageText(messages: MessageParam[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user')
  if (!firstUserMessage) return ''

  const content = firstUserMessage.content
  if (typeof content === 'string') return content

  // Array of content blocks - find first text block
  const textBlock = content.find(block => block.type === 'text')
  return textBlock?.type === 'text' ? textBlock.text : ''
}

/**
 * Lightweight API wrapper for "side queries" outside the main conversation loop.
 *
 * Use this instead of direct client.beta.messages.create() calls to ensure
 * proper OAuth token validation with fingerprint attribution headers.
 *
 * This handles:
 * - Fingerprint computation for OAuth validation
 * - Attribution header injection
 * - CLI system prompt prefix
 * - Proper betas for the model
 * - API metadata
 * - Model string normalization (strips [1m] suffix for API)
 *
 * @example
 * // Permission explainer
 * await sideQuery({ querySource: 'permission_explainer', model, system: SYSTEM_PROMPT, messages, tools, tool_choice })
 *
 * @example
 * // Session search
 * await sideQuery({ querySource: 'session_search', model, system: SEARCH_PROMPT, messages })
 *
 * @example
 * // Model validation
 * await sideQuery({ querySource: 'model_validation', model, max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] })
 */
export async function sideQuery(opts: SideQueryOptions): Promise<any> {
  const {
    model,
    system,
    messages,
    tools,
    tool_choice,
    output_format,
    max_tokens = 1024,
    maxRetries = 2,
    signal,
    skipSystemPromptPrefix,
    temperature,
    thinking,
    stop_sequences,
  } = opts

  // Redirect to local Ollama instance
  const ollamaMessages = [];
  if (system) {
    ollamaMessages.push({ role: 'system', content: Array.isArray(system) ? system.map(s => s.text || s).join('\n') : system });
  }
  ollamaMessages.push(...messages.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : m.content.map((c: any) => c.text || '').join('\n')
  })));

  const ollamaResponse = await fetch('http://localhost:11434/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.CHUCK_CODE_OLLAMA_MODEL || 'phi3',
      messages: ollamaMessages,
      max_tokens,
      temperature: temperature ?? 0.7,
      options: { num_ctx: 2048 }
    }),
    signal,
  })

  if (!ollamaResponse.ok) {
    const errorText = await ollamaResponse.text();
    throw new Error(`Ollama API error (${ollamaResponse.status}): ${errorText}`);
  }

  const data = await ollamaResponse.json() as any;
  
  if (!data.choices || data.choices.length === 0) {
    throw new Error('Ollama API returned an empty response');
  }

  return {
    content: [{ type: 'text', text: data.choices[0].message.content }],
    usage: { 
      input_tokens: data.usage?.prompt_tokens ?? 0, 
      output_tokens: data.usage?.completion_tokens ?? 0 
    },
    stop_reason: 'end_turn',
    _request_id: data.id
  }
}
