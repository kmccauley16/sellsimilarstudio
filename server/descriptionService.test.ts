import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  DEFAULT_MODEL: "claude-opus-5",
  getAnthropicClient: () => ({ messages: { parse: mocks.parse } }),
}));

import { proposeDescriptionFromTitle } from "./descriptionService";

describe("title-based description proposal", () => {
  beforeEach(() => {
    mocks.parse.mockReset();
  });

  it("uses one bounded Claude request and returns a sanitized proposal", async () => {
    mocks.parse.mockResolvedValue({
      parsed_output: {
        description: "<p>Antique brass finish ceiling fan with included light kit.</p><script>alert('x')</script>",
      },
    });

    await expect(proposeDescriptionFromTitle({
      title: "Antique Brass Ceiling Fan with Light Kit",
      description: "<p>Original description with a light kit.</p>",
    })).resolves.toEqual({
      description: "<p>Antique brass finish ceiling fan with included light kit.</p>",
    });

    expect(mocks.parse).toHaveBeenCalledTimes(1);
    const [request, options] = mocks.parse.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(request).toMatchObject({ model: "claude-opus-5", max_tokens: 600 });
    expect(request.output_config).toBeDefined();
    expect(options).toEqual({ maxRetries: 0 });
  });

  it("limits the source description sent to the model while retaining local validation", async () => {
    mocks.parse.mockResolvedValue({ parsed_output: { description: "<p>Updated.</p>" } });
    const longDescription = `<p>${"a".repeat(13_000)}</p>`;

    await expect(proposeDescriptionFromTitle({
      title: "Test title",
      description: longDescription,
    })).resolves.toEqual({ description: "<p>Updated.</p>" });

    const request = mocks.parse.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = request.messages.find(message => message.role === "user");
    const payload = JSON.parse(userMessage?.content ?? "{}") as { currentDescription?: string };
    expect(payload.currentDescription).toHaveLength(12_000);
  });

  it("does not invoke the model when the title is missing", async () => {
    await expect(proposeDescriptionFromTitle({ title: "", description: "<p>Imported text.</p>" }))
      .rejects.toThrow("Enter a title before generating a description.");
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("permits a blank description and clearly signals it to the conservative proposal prompt", async () => {
    mocks.parse.mockResolvedValue({
      parsed_output: { description: "<p>Please review the photos and item specifics.</p>" },
    });

    await expect(proposeDescriptionFromTitle({ title: "A title", description: "" })).resolves.toEqual({
      description: "<p>Please review the photos and item specifics.</p>",
    });
    const request = mocks.parse.mock.calls[0]?.[0] as { messages: Array<{ role: string; content: string }> };
    const userMessage = request.messages.find(message => message.role === "user");
    expect(JSON.parse(userMessage?.content ?? "{}")).toMatchObject({
      title: "A title",
      currentDescription: "",
      hasCurrentDescription: false,
    });
  });

  it("returns a conservative editable fallback when the model returns no parseable output", async () => {
    mocks.parse.mockResolvedValue({ parsed_output: null });

    await expect(proposeDescriptionFromTitle({ title: "A title", description: "" })).resolves.toEqual({
      description: "<p>Please review the item details and photos before purchase.</p>",
    });
  });

  it("returns a conservative editable fallback when the request itself fails", async () => {
    mocks.parse.mockRejectedValue(new Error("upstream unavailable"));

    await expect(proposeDescriptionFromTitle({ title: "A title", description: "<p>Kept as-is.</p>" })).resolves.toEqual({
      description: "<p>Kept as-is.</p>",
    });
  });
});
