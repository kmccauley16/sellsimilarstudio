import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { sanitizeDescription } from "./ebayListing";
import { DEFAULT_MODEL, getAnthropicClient } from "./_core/llm";

const MAX_TITLE_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 50_000;
const MAX_DESCRIPTION_PROMPT_LENGTH = 12_000;
const DESCRIPTION_PROPOSAL_MAX_TOKENS = 600;

export type DescriptionProposalInput = {
  title: string;
  description: string;
};

const DescriptionProposalSchema = z.object({
  description: z.string().max(MAX_DESCRIPTION_LENGTH),
});

function safeFallbackDescription(currentDescription: string) {
  return currentDescription || "<p>Please review the item details and photos before purchase.</p>";
}

export async function proposeDescriptionFromTitle(input: DescriptionProposalInput) {
  const title = input.title.trim().slice(0, MAX_TITLE_LENGTH);
  const originalDescription = sanitizeDescription(input.description).slice(0, MAX_DESCRIPTION_LENGTH);
  const promptDescription = originalDescription.slice(0, MAX_DESCRIPTION_PROMPT_LENGTH);

  if (!title) throw new Error("Enter a title before generating a description.");

  try {
    const response = await getAnthropicClient().messages.parse(
      {
        model: DEFAULT_MODEL,
        max_tokens: DESCRIPTION_PROPOSAL_MAX_TOKENS,
        system: [
          "You create or revise eBay listing descriptions conservatively.",
          "When a current description is supplied, preserve only facts that are present in that description. When it is blank, create only a minimal buyer-readable starting description that does not claim any condition, specifications, included accessories, compatibility, shipping, returns, warranties, guarantees, pricing, brand facts, or promotional facts.",
          "You may refer generically to the item in the supplied title, but do not repeat the title as a heading or add facts that are not supplied.",
          "Return concise HTML limited to paragraphs, simple lists, and basic emphasis.",
        ].join(" "),
        messages: [
          {
            role: "user",
            content: JSON.stringify({ title, currentDescription: promptDescription, hasCurrentDescription: Boolean(promptDescription) }),
          },
        ],
        output_config: { format: zodOutputFormat(DescriptionProposalSchema) },
      },
      // This is a user-triggered, bounded, single-shot action by design — no
      // background retries that would silently spend extra requests.
      { maxRetries: 0 },
    );

    const description = response.parsed_output
      ? sanitizeDescription(response.parsed_output.description).slice(0, MAX_DESCRIPTION_LENGTH)
      : "";
    if (description) return { description };
  } catch {
    // Keep this user-triggered flow useful without adding facts, even if the
    // model returned unparseable output or the request failed outright.
  }

  return { description: safeFallbackDescription(originalDescription) };
}
