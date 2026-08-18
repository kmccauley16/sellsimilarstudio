import Anthropic from "@anthropic-ai/sdk";

// Model used for the AI-assisted description and keyword suggestions.
// Override with ANTHROPIC_MODEL if a different model is ever wanted — these are
// short, low-stakes, user-triggered generations, so a cheaper model like
// "claude-haiku-4-5" is a reasonable choice if cost matters more than quality.
export const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

let _client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  _client = new Anthropic();
  return _client;
}
