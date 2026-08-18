import { describe, expect, it } from "vitest";
import {
  MAX_REVIEW_KEYWORDS,
  getKeywordCoverage,
  insertKeywordIntoDescription,
  insertKeywordIntoItemSpecificValue,
  insertKeywordIntoTitle,
  normalizeKeywordPhrases,
} from "@shared/keywords";

describe("listing keyword normalization", () => {
  it("normalizes whitespace and prevents case or punctuation duplicate phrases", () => {
    expect(
      normalizeKeywordPhrases([
        "  Vintage   Film Camera ",
        "vintage-film camera",
        "Compact Travel Camera",
        "",
        "Compact travel camera",
      ]),
    ).toEqual(["Vintage Film Camera", "Compact Travel Camera"]);
  });

  it("discards unsafe control characters and overlong phrases", () => {
    const longPhrase = "a".repeat(81);
    expect(normalizeKeywordPhrases(["camera\u0000 lens", longPhrase])).toEqual(["camera lens"]);
  });

  it("uses the exported review-keyword maximum when no custom limit is supplied", () => {
    const phrases = Array.from(
      { length: MAX_REVIEW_KEYWORDS + 1 },
      (_, index) => `Keyword ${index + 1}`,
    );
    expect(normalizeKeywordPhrases(phrases)).toHaveLength(MAX_REVIEW_KEYWORDS);
  });
});

describe("listing keyword coverage", () => {
  it("reports whether a phrase appears in visible title, description, and item specifics", () => {
    const coverage = getKeywordCoverage("compact travel camera", {
      title: "Vintage 35mm Camera",
      description: "<p>A compact travel camera in clean working condition.</p>",
      itemSpecifics: [
        { name: "Brand", value: "Example" },
        { name: "Type", value: "Compact travel camera" },
      ],
    });

    expect(coverage).toEqual({
      title: false,
      description: true,
      itemSpecifics: true,
    });
  });
});

describe("safe keyword insertion", () => {
  it("adds a phrase to a title only when it fits and is not already present", () => {
    expect(insertKeywordIntoTitle("Vintage 35mm Camera", "Travel Camera")).toEqual({
      value: "Vintage 35mm Camera Travel Camera",
      status: "inserted",
    });
    expect(insertKeywordIntoTitle("Vintage Travel Camera", "travel-camera")).toEqual({
      value: "Vintage Travel Camera",
      status: "already_present",
    });
  });

  it("does not exceed eBay's 80-character title limit", () => {
    const existingTitle = "A".repeat(75);
    expect(insertKeywordIntoTitle(existingTitle, "camera lens")).toEqual({
      value: existingTitle,
      status: "too_long",
    });
  });

  it("escapes a phrase when appending it to an HTML description", () => {
    expect(insertKeywordIntoDescription("<p>Clean item.</p>", "Lens < kit")).toEqual({
      value: "<p>Clean item.</p><p>Lens &lt; kit</p>",
      status: "inserted",
    });
  });

  it("uses the same duplicate and length protections for item-specific values", () => {
    expect(insertKeywordIntoItemSpecificValue("Black", "Travel Camera")).toEqual({
      value: "Black Travel Camera",
      status: "inserted",
    });
    expect(insertKeywordIntoItemSpecificValue("Travel Camera", "travel camera").status).toBe("already_present");
  });
});
