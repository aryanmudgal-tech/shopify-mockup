// The model the check uses to read text (spec 8.4).
//
// - Fast tier: claude-haiku-5-5, checked against the current model list on
//   2026-11-15 (Claude API skill, cached 2026-11-03).
// - Structured output is enforced by a forced, strict tool call: tool_choice
//   names the tool, and strict: true makes the input match the schema.
// - No temperature. The spec asked for temperature 0, but Haiku 5.5 rejects any
//   non-default sampling value with a 400, and on API version 2026-10-21 (what
//   this SDK sends) every model does. Repeatability comes from the strict schema
//   and from the extraction cache instead (server/modelCache.ts).
// - The key lives in .env (git-ignored) and is read only on the server.

import Anthropic from "@anthropic-ai/sdk";

export const MODEL_ID = "claude-haiku-5-5";

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: object;
}

export interface ToolRequest {
  system: string;
  messages: Anthropic.MessageParam[];
  tool: ToolSpec;
}

export interface ToolResponse {
  input: unknown;
  /** The assistant turn, to send back with a tool_result when retrying. */
  assistant: Anthropic.MessageParam;
  toolUseId: string;
}

export interface ModelClient {
  readonly model: string;
  callTool(req: ToolRequest): Promise<ToolResponse>;
}

export class ModelError extends Error {}

export class AnthropicModel implements ModelClient {
  readonly model = MODEL_ID;

  constructor(private readonly client: Anthropic = new Anthropic()) {}

  async callTool(req: ToolRequest): Promise<ToolResponse> {
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        system: req.system,
        messages: req.messages,
        tools: [{ ...req.tool, input_schema: req.tool.input_schema as Anthropic.Tool.InputSchema, strict: true }],
        tool_choice: { type: "tool", name: req.tool.name },
      });
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) throw new ModelError("The Anthropic API key in .env was rejected.");
      if (err instanceof Anthropic.RateLimitError) throw new ModelError("The Anthropic API is rate limiting this key; try again shortly.");
      if (err instanceof Anthropic.APIError) throw new ModelError(`The Anthropic API returned an error (${err.status ?? "network"}).`);
      throw err;
    }

    if (response.stop_reason === "refusal") throw new ModelError("The model declined to read this text.");
    if (response.stop_reason === "max_tokens") throw new ModelError("The model ran out of room before finishing.");
    const block = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === req.tool.name);
    if (!block) throw new ModelError("The model didn't call the tool.");
    return { input: block.input, assistant: { role: "assistant", content: response.content }, toolUseId: block.id };
  }
}

/** The model, if a key is configured; otherwise null and the check runs on cached reads only. */
export function modelFromEnv(): ModelClient | null {
  return process.env.ANTHROPIC_API_KEY ? new AnthropicModel() : null;
}
