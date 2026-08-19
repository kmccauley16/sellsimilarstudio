// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const listing = {
    id: 42,
    status: "ready",
    title: "Vintage brass desk lamp",
    description: "<p>Original lamp description.</p>",
    itemSpecifics: [],
    keywords: [],
    selectedImageUrls: [],
    ownedImageUrls: [],
    photoRightsAttestedAt: null,
    itemAccuracyAttestedAt: null as number | null,
    imageUrls: ["https://example.test/lamp.jpg"],
    conditionId: "3000",
    conditionName: "Used",
    price: "25.00",
    categoryId: "123",
    categoryName: "Lamps",
    quantity: 1,
  };
  const state = {
    listing,
    proposalOptions: undefined as undefined | {
      onSuccess?: (result: { description: string }) => void;
      onError?: (error: Error) => void;
    },
    proposalError: null as Error | null,
    proposalMutate: vi.fn(() => {
      if (state.proposalError) {
        state.proposalOptions?.onError?.(state.proposalError);
        return;
      }
      state.proposalOptions?.onSuccess?.({ description: "<p>Proposed lamp description.</p>" });
    }),
    saveReviewMutate: vi.fn(),
    createDraftMutate: vi.fn((_vars: unknown, options?: { onSuccess?: () => void }) => options?.onSuccess?.()),
    publishDraftMutate: vi.fn(),
    uploadOwnedPhotoMutate: vi.fn(),
    removeOwnedPhotoMutate: vi.fn(),
    attestPhotoRightsMutate: vi.fn(),
    attestItemAccuracyMutate: vi.fn(),
    enhancePhotoBackgroundMutate: vi.fn(),
    toastSuccess: vi.fn(),
    toastError: vi.fn(),
  };
  return state;
});

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      listing: {
        get: { setData: vi.fn(), invalidate: vi.fn() },
        history: { invalidate: vi.fn() },
      },
    }),
    listing: {
      get: { useQuery: () => ({ data: mocks.listing, isLoading: false, error: null }) },
      update: {
        useMutation: () => ({
          mutate: mocks.saveReviewMutate,
          mutateAsync: mocks.saveReviewMutate,
          isPending: false,
        }),
      },
      proposeDescription: {
        useMutation: (options: typeof mocks.proposalOptions) => {
          mocks.proposalOptions = options;
          return { mutate: mocks.proposalMutate, isPending: false };
        },
      },
      uploadOwnedPhoto: { useMutation: () => ({ mutate: mocks.uploadOwnedPhotoMutate, isPending: false }) },
      removeOwnedPhoto: { useMutation: () => ({ mutate: mocks.removeOwnedPhotoMutate, isPending: false }) },
      attestPhotoRights: { useMutation: () => ({ mutate: mocks.attestPhotoRightsMutate, isPending: false }) },
      attestItemAccuracy: { useMutation: () => ({ mutate: mocks.attestItemAccuracyMutate, isPending: false }) },
      enhancePhotoBackground: { useMutation: () => ({ mutate: mocks.enhancePhotoBackgroundMutate, isPending: false }) },
    },
    ebay: {
      status: { useQuery: () => ({ data: { connection: { setupComplete: true } }, isLoading: false }) },
      createDraft: { useMutation: () => ({ mutate: mocks.createDraftMutate, mutateAsync: mocks.createDraftMutate, isPending: false }) },
      publishDraft: { useMutation: () => ({ mutate: mocks.publishDraftMutate, mutateAsync: mocks.publishDraftMutate, isPending: false }) },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/review/42", vi.fn()],
  useRoute: () => [true, { id: "42" }],
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn() },
}));

import Review from "../client/src/pages/Review";

afterEach(() => {
  cleanup();
  mocks.proposalOptions = undefined;
  mocks.proposalError = null;
  mocks.proposalMutate.mockClear();
  mocks.saveReviewMutate.mockClear();
  mocks.createDraftMutate.mockClear();
  mocks.publishDraftMutate.mockClear();
  mocks.uploadOwnedPhotoMutate.mockClear();
  mocks.removeOwnedPhotoMutate.mockClear();
  mocks.attestPhotoRightsMutate.mockClear();
  mocks.attestItemAccuracyMutate.mockClear();
  mocks.enhancePhotoBackgroundMutate.mockClear();
  mocks.toastSuccess.mockClear();
  mocks.toastError.mockClear();
});

describe("Review AI description proposal", () => {
  it("shows a proposal without changing or saving the listing until the user explicitly applies it", async () => {
    const user = userEvent.setup();
    render(<Review />);

    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    expect(description.value).toBe("<p>Original lamp description.</p>");

    await user.click(screen.getByRole("button", { name: "Revise with AI" }));
    expect(mocks.proposalMutate).toHaveBeenCalledWith({
      id: 42,
      title: "Vintage brass desk lamp",
      description: "<p>Original lamp description.</p>",
    });

    expect(await screen.findByText("Proposed description")).not.toBeNull();
    expect(description.value).toBe("<p>Original lamp description.</p>");
    expect(mocks.saveReviewMutate).not.toHaveBeenCalled();
    expect(mocks.createDraftMutate).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply proposal" }));
    expect(description.value).toBe("<p>Proposed lamp description.</p>");
    expect(mocks.saveReviewMutate).not.toHaveBeenCalled();
    expect(mocks.createDraftMutate).not.toHaveBeenCalled();
  });

  it("shows a safe proposal error and retains the original description when generation fails", async () => {
    mocks.proposalError = new Error("The description proposal could not be generated. Try again.");
    const user = userEvent.setup();
    render(<Review />);

    const description = screen.getByLabelText("Description") as HTMLTextAreaElement;
    await user.click(screen.getByRole("button", { name: "Revise with AI" }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith(
      "The description proposal could not be generated. Try again.",
    ));
    expect(description.value).toBe("<p>Original lamp description.</p>");
    expect(screen.queryByText("Proposed description")).toBeNull();
    expect(mocks.saveReviewMutate).not.toHaveBeenCalled();
    expect(mocks.createDraftMutate).not.toHaveBeenCalled();
  });

  it("allows a photo-pending draft without an item-accuracy confirmation or source-photo reuse", async () => {
    const user = userEvent.setup();
    render(<Review />);

    expect(screen.getByText(/No photo is required to save this draft\./)).not.toBeNull();
    expect(screen.queryByText(/This listing accurately describes the item I have/i)).toBeNull();
    await user.click(screen.getAllByRole("button", { name: "Save photo-pending draft" })[0]);
    expect(mocks.createDraftMutate).toHaveBeenCalledWith({ listingImportId: 42 }, expect.anything());
    expect(mocks.attestPhotoRightsMutate).not.toHaveBeenCalled();
  });

  it("turns an unsaved edit into a visible save action without a final-details confirmation control", async () => {
    const user = userEvent.setup();
    render(<Review />);

    expect(screen.queryByRole("checkbox", { name: /This listing accurately describes the item I have/i })).toBeNull();
    expect(screen.queryByRole("button", { name: "Confirm final details" })).toBeNull();

    const description = screen.getByLabelText("Description");
    await user.type(description, " Revised after inspection.");

    await user.click(screen.getAllByRole("button", { name: "Save review to continue" })[0]);
    expect(mocks.saveReviewMutate).toHaveBeenCalledWith(expect.objectContaining({
      id: 42,
      description: "<p>Original lamp description.</p> Revised after inspection.",
    }));
    expect(mocks.createDraftMutate).not.toHaveBeenCalled();
  });
});
