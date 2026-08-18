import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getListingImport: vi.fn(),
  proposeDescriptionFromTitle: vi.fn(),
}));

vi.mock("./db", () => ({
  getListingImport: mocks.getListingImport,
  createListingImport: vi.fn(),
  updateListingReview: vi.fn(),
  listListingHistory: vi.fn(),
}));

vi.mock("./descriptionService", () => ({
  proposeDescriptionFromTitle: mocks.proposeDescriptionFromTitle,
}));

vi.mock("./keywordService", () => ({
  generateAutomaticKeywords: vi.fn(),
}));

vi.mock("./ebayListing", async importOriginal => {
  const actual = await importOriginal<typeof import("./ebayListing")>();
  return { ...actual, importEbayListing: vi.fn() };
});

import { listingRouter } from "./listingRouter";

const caller = listingRouter.createCaller({
  user: {
    id: 1,
    openId: "oauth-test-user",
    name: null,
    email: "oauth-test-user@example.com",
    passwordHash: "test-hash",
    loginMethod: null,
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  },
  req: {} as never,
  res: {} as never,
});

describe("listing.proposeDescription error safety", () => {
  beforeEach(() => {
    mocks.getListingImport.mockReset();
    mocks.proposeDescriptionFromTitle.mockReset();
  });

  it("allows a blank description to be generated from the seller-reviewed title", async () => {
    mocks.getListingImport.mockResolvedValue({ id: 42 });
    mocks.proposeDescriptionFromTitle.mockResolvedValue({
      description: "<p>Please review the photos and item specifics for the item details.</p>",
    });

    await expect(caller.proposeDescription({
      id: 42,
      title: "Vintage brass desk lamp",
      description: "",
    })).resolves.toEqual({
      description: "<p>Please review the photos and item specifics for the item details.</p>",
    });
    expect(mocks.proposeDescriptionFromTitle).toHaveBeenCalledWith({
      title: "Vintage brass desk lamp",
      description: "",
    });
  });

  it("redacts an unexpected provider failure while preserving the imported description", async () => {
    mocks.getListingImport.mockResolvedValue({ id: 42 });
    mocks.proposeDescriptionFromTitle.mockRejectedValue(
      new Error("Provider request failed: bearer secret-token-value and internal host details"),
    );

    await expect(caller.proposeDescription({
      id: 42,
      title: "Vintage brass desk lamp",
      description: "<p>Original imported description.</p>",
    })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "The description proposal could not be generated. Try again.",
    });

    await caller.proposeDescription({
      id: 42,
      title: "Vintage brass desk lamp",
      description: "<p>Original imported description.</p>",
    }).catch(error => {
      expect(error.message).not.toContain("secret-token-value");
      expect(error.message).not.toContain("internal host details");
    });
  });
});
