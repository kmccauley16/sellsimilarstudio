import { sanitizeDescription } from "./ebayListing";
import { invokeLLM } from "./_core/llm";

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 50_000;
const MAX_DESCRIPTION_PROMPT_LENGTH = 12_000;
const DESCRIPTION_PROPOSAL_MODEL = "gpt-5-mini";
const DESCRIPTION_PROPOSAL_MAX_COMPLETION_TOKENS = 600;

export type DescriptionProposalInput = {
  title: string;
  description: string;
};

type DescriptionResponsePart = {
  type?: unknown;
  text?: unknown;
  content?: unknown;
  json?: unknown;
};

function responseText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map(part => {
      if (!part || typeof part !== "object") return "";
      const candidate = part as DescriptionResponsePart;
      if (typeof candidate.text === "string") return candidate.text;
      if (typeof candidate.content === "string") return candidate.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function responseJson(content: unknown): Record<string, unknown> | null {
  if (!Array.isArray(content)) return null;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const candidate = part as DescriptionResponsePart;
    if (candidate.json && typeof candidate.json === "object" && !Array.isArray(candidate.json)) {
      return candidate.json as Record<string, unknown>;
    }
  }

  return null;
}

function parseProposal(content: unknown): { description?: unknown } {
  const structured = responseJson(content);
  if (structured) return structured;

  const raw = responseText(content).trim();
  if (!raw) throw new Error("The description proposal could not be read. Try again.");

  const jsonCandidate = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1] ?? raw;
  try {
    return JSON.parse(jsonCandidate) as { description?: unknown };
  } catch {
    throw new Error("The description proposal could not be read. Try again.");
  }
}

function safeFallbackDescription(currentDescription: string) {
  return currentDescription || "<p>Please review the item details and photos before purchase.</p>";
}

export async function proposeDescriptionFromTitle(input: DescriptionProposalInput) {
  const title = input.title.trim().slice(0, MAX_TITLE_LENGTH);
  const originalDescription = sanitizeDescription(input.description).slice(0, MAX_DESCRIPTION_LENGTH);
  const promptDescription = originalDescription.slice(0, MAX_DESCRIPTION_PROMPT_LENGTH);

  if (!title) throw new Error("Enter a title before generating a description.");

  const result = await invokeLLM({
    model: DESCRIPTION_PROPOSAL_MODEL,
    maxCompletionTokens: DESCRIPTION_PROPOSAL_MAX_COMPLETION_TOKENS,
    maxRetries: 0,
    messages: [
      {
        role: "system",
        content: [
          "You create or revise eBay listing descriptions conservatively.",
          "When a current description is supplied, preserve only facts that are present in that description. When it is blank, create only a minimal buyer-readable starting description that does not claim any condition, specifications, included accessories, compatibility, shipping, returns, warranties, guarantees, pricing, brand facts, or promotional facts.",
          "You may refer generically to the item in the supplied title, but do not repeat the title as a heading or add facts that are not supplied.",
          "Return concise HTML limited to paragraphs, simple lists, and basic emphasis.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({ title, currentDescription: promptDescription, hasCurrentDescription: Boolean(promptDescription) }),
      },
    ],
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: "listing_description_proposal",
        strict: true,
        schema: {
          type: "object",
          properties: {
            description: { type: "string", maxLength: MAX_DESCRIPTION_LENGTH },
          },
          required: ["description"],
          additionalProperties: false,
        },
      },
    },
  });

  try {
    const parsed = parseProposal(result.choices[0]?.message.content);
    const description = sanitizeDescription(parsed.description).slice(0, MAX_DESCRIPTION_LENGTH);
    if (description) return { description };
  } catch {
    // GPT-family models can consume their visible-output budget on reasoning and
    // return no content. Keep this user-triggered flow useful without adding facts.
  }

  return { description: safeFallbackDescription(originalDescription) };
}
