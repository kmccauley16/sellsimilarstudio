import { describe, expect, it } from "vitest";
import {
  buildListingReviewUpdateValues,
  hasMaterialListingChanges,
  type ListingReviewMaterialSnapshot,
  type ListingReviewUpdate,
} from "./db";

const storedReview: ListingReviewMaterialSnapshot = {
  title: "Home Impressions 42-inch ceiling fan",
  description: "Used ceiling fan in the condition shown.",
  itemSpecifics: JSON.stringify([
    { name: "Brand", value: "Home Impressions" },
    { name: "Fan Width", value: "42 in" },
  ]),
  conditionId: "3000",
  conditionName: "Used",
  price: "45.00",
  categoryId: "112581",
  categoryName: "Ceiling Fans",
  quantity: 1,
};

const unchangedReview: ListingReviewUpdate = {
  title: storedReview.title,
  description: storedReview.description,
  itemSpecifics: JSON.parse(storedReview.itemSpecifics),
  keywords: ["42 inch ceiling fan"],
  conditionId: storedReview.conditionId ?? undefined,
  conditionName: storedReview.conditionName ?? undefined,
  price: storedReview.price ?? undefined,
  categoryId: storedReview.categoryId ?? undefined,
  categoryName: storedReview.categoryName ?? undefined,
  quantity: storedReview.quantity,
};

describe("listing review item-accuracy persistence", () => {
  it("keeps an existing accuracy confirmation on an unchanged or keyword-only save", () => {
    const materialFieldsChanged = hasMaterialListingChanges(storedReview, unchangedReview);
    const updateValues = buildListingReviewUpdateValues(unchangedReview, materialFieldsChanged);

    expect(materialFieldsChanged).toBe(false);
    expect(updateValues).not.toHaveProperty("itemAccuracyAttestedAt");
  });

  it("revokes the accuracy confirmation after a material listing change", () => {
    const editedReview = { ...unchangedReview, title: "Home Impressions 42-inch ceiling fan with light" };
    const materialFieldsChanged = hasMaterialListingChanges(storedReview, editedReview);
    const updateValues = buildListingReviewUpdateValues(editedReview, materialFieldsChanged);

    expect(materialFieldsChanged).toBe(true);
    expect(updateValues).toMatchObject({ itemAccuracyAttestedAt: null });
  });
});
