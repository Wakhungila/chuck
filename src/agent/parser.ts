/**
 * CHUCK PARSER — Extract tool calls from model text output
 * Handles clean JSON blocks and sloppy model output gracefully.
 */

export interface ToolCall {
  tool: string;
  args: Record<string, string>;
}

const TOOL_BLOCK_RE = /```tool\s*([\s\S]*?)```/m;
const JSON_INLINE_RE = /\{"tool"\s*:\s*"([^"]+)"[^}]*"args"\s*:\s*(\{[^}]*\})/;

export function parseToolCall(text: string): ToolCall | null {
  const blockMatch = text.match(TOOL_BLOCK_RE);
  if (blockMatch) {
    try {
      const parsed = JSON.parse(blockMatch[1].trim());
      if (parsed.tool && typeof parsed.tool === "string") {
        return { tool: parsed.tool, args: parsed.args || {} };
      }
    } catch { /* fall through */ }
  }

  const inlineMatch = text.match(JSON_INLINE_RE);
  if (inlineMatch) {
    try {
      const args = JSON.parse(inlineMatch[2]);
      return { tool: inlineMatch[1], args };
    } catch { /* fall through */ }
  }

  const actionMatch = text.match(/(?:ACTION|TOOL|EXECUTE):\s*(\w+)\s*\(([^)]*)\)/i);
  if (actionMatch) {
    const rawArgs = actionMatch[2];
    const args: Record<string, string> = {};
    const kvPairs = rawArgs.match(/(\w+)\s*=\s*"?([^,"]+)"?/g) || [];
    if (kvPairs.length > 0) {
      for (const pair of kvPairs) {
        const [k, ...v] = pair.split("=");
        args[k.trim()] = v.join("=").trim().replace(/^"|"$/g, "");
      }
    } else if (rawArgs.trim()) {
      args["target"] = rawArgs.trim().replace(/^"|"$/g, "");
    }
    return { tool: actionMatch[1].toLowerCase(), args };
  }

  return null;
}
