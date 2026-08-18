import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  DEFAULT_MODEL: "claude-opus-5",
  getAnthropicClient: () => ({ messages: { parse: mocks.parse } }),
}));

import { generateAutomaticKeywords } from "./keywordService";

const source = {
  title: "Vintage 35mm Film Camera",
  description: "<p>A compact travel camera in clean working condition.</p>",
  itemSpecifics: [
    { name: "Brand", value: "Example" },
    { name: "Type", value: "Compact travel camera" },
  ],
  categoryName: "Cameras & Photo",
  conditionName: "Used",
};

describe("generateAutomaticKeywords", () => {
  beforeEach(() => {
    mocks.parse.mockReset();
  });

  it("uses a bounded Claude request and returns the model's suggestions", async () => {
    const keywords = Array.from({ length: 12 }, (_, index) => `Suggested phrase ${index + 1}`);
    mocks.parse.mockResolvedValue({ parsed_output: { keywords } });

    await expect(generateAutomaticKeywords(source)).resolves.toEqual(keywords);

    expect(mocks.parse).toHaveBeenCalledTimes(1);
    const [request, options] = mocks.parse.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(request).toMatchObject({ model: "claude-opus-5", max_tokens: 420 });
    expect(request.output_config).toBeDefined();
    expect(options).toEqual({ maxRetries: 0 });
  });

  it("falls back to source-derived keywords when the model returns nothing parseable", async () => {
    mocks.parse.mockResolvedValue({ parsed_output: null });

    const keywords = await generateAutomaticKeywords(source);

    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords).toContain("Vintage 35mm Film Camera");
  });

  it("falls back to source-derived keywords when the request fails", async () => {
    mocks.parse.mockRejectedValue(new Error("upstream unavailable"));

    const keywords = await generateAutomaticKeywords(source);

    expect(keywords.length).toBeGreaterThan(0);
  });
});
