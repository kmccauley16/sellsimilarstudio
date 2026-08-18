import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
}));

vi.mock("./_core/env", () => ({
  ENV: {
    forgeApiUrl: "https://forge.example",
    forgeApiKey: "test-key",
  },
}));

import { invokeLLM } from "./_core/llm";

describe("invokeLLM max completion token support", () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the GPT visible-output cap as max_completion_tokens", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({
      id: "test",
      created: 0,
      model: "gpt-5-mini",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      }],
    }), { status: 200 }));

    await invokeLLM({
      maxCompletionTokens: 600,
      messages: [{ role: "user", content: "Generate a safe description." }],
    });

    const request = mocks.fetch.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(payload).toMatchObject({ max_completion_tokens: 600 });
    expect(payload).not.toHaveProperty("max_tokens");
  });
});
