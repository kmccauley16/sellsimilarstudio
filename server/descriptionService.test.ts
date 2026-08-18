import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: mocks.invokeLLM,
}));

import { proposeDescriptionFromTitle } from "./descriptionService";

describe("title-based description proposal", () => {
  beforeEach(() => {
    mocks.invokeLLM.mockReset();
  });

  it("uses one bounded gpt-5-mini request and returns a sanitized proposal", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            description: "<p>Antique brass finish ceiling fan with included light kit.</p><script>alert('x')</script>",
          }),
        },
      }],
    });

    await expect(proposeDescriptionFromTitle({
      title: "Antique Brass Ceiling Fan with Light Kit",
      description: "<p>Original description with a light kit.</p>",
    })).resolves.toEqual({
      description: "<p>Antique brass finish ceiling fan with included light kit.</p>",
    });

    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
    expect(mocks.invokeLLM).toHaveBeenCalledWith(expect.objectContaining({
      model: "gpt-5-mini",
      maxCompletionTokens: 600,
      maxRetries: 0,
      responseFormat: expect.objectContaining({ type: "json_schema" }),
    }));
  });

  it("limits the source description sent to the model while retaining local validation", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ description: "<p>Updated.</p>" }) } }],
    });
    const longDescription = `<p>${"a".repeat(13_000)}</p>`;

    await expect(proposeDescriptionFromTitle({
      title: "Test title",
      description: longDescription,
    })).resolves.toEqual({ description: "<p>Updated.</p>" });

    const request = mocks.invokeLLM.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = request.messages.find(message => message.role === "user");
    const payload = JSON.parse(userMessage?.content ?? "{}") as { currentDescription?: string };
    expect(payload.currentDescription).toHaveLength(12_000);
  });

  it("does not invoke the model when the title is missing", async () => {
    await expect(proposeDescriptionFromTitle({ title: "", description: "<p>Imported text.</p>" }))
      .rejects.toThrow("Enter a title before generating a description.");
    expect(mocks.invokeLLM).not.toHaveBeenCalled();
  });

  it("permits a blank description and clearly signals it to the conservative proposal prompt", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ description: "<p>Please review the photos and item specifics.</p>" }) } }],
    });

    await expect(proposeDescriptionFromTitle({ title: "A title", description: "" })).resolves.toEqual({
      description: "<p>Please review the photos and item specifics.</p>",
    });
    const request = mocks.invokeLLM.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = request.messages.find(message => message.role === "user");
    expect(JSON.parse(userMessage?.content ?? "{}")).toMatchObject({
      title: "A title",
      currentDescription: "",
      hasCurrentDescription: false,
    });
  });

  it("returns a conservative editable fallback when GPT consumes its output budget without content", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{ message: {} }],
    });

    await expect(proposeDescriptionFromTitle({ title: "A title", description: "" })).resolves.toEqual({
      description: "<p>Please review the item details and photos before purchase.</p>",
    });
  });
});
