import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: mocks.invokeLLM,
}));

import { proposeDescriptionFromTitle } from "./descriptionService";

afterEach(() => {
  mocks.invokeLLM.mockReset();
});

describe("proposeDescriptionFromTitle", () => {
  it("reads a structured proposal returned as an output-text content part", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: [{
            type: "output_text",
            text: '{"description":"<p>Carefully reviewed item description.</p>"}',
          }],
        },
      }],
    });

    await expect(proposeDescriptionFromTitle({
      title: "Vintage brass desk lamp",
      description: "",
    })).resolves.toEqual({
      description: "<p>Carefully reviewed item description.</p>",
    });
  });

  it("reads a structured proposal returned as an output-json content part", async () => {
    mocks.invokeLLM.mockResolvedValue({
      choices: [{
        message: {
          content: [{
            type: "output_json",
            json: { description: "<p>Minimal buyer-readable starting point.</p>" },
          }],
        },
      }],
    });

    await expect(proposeDescriptionFromTitle({
      title: "Vintage brass desk lamp",
      description: "",
    })).resolves.toEqual({
      description: "<p>Minimal buyer-readable starting point.</p>",
    });
  });
});
