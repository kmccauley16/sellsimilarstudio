// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  completeAuthorization: vi.fn(),
  authorizationDeclined: vi.fn(),
}));

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      ebay: {
        invalidate: vi.fn(),
        status: { invalidate: vi.fn() },
      },
    }),
    ebay: {
      status: {
        useQuery: () => ({
          data: { configured: true, connection: { ebayUserId: "seller", setupComplete: false } },
          isLoading: false,
        }),
      },
      complianceSetup: { useQuery: () => ({ data: { endpointPath: "", verificationToken: "" }, isLoading: false }) },
      startAuthorization: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      completeAuthorization: { useMutation: () => ({ mutate: mocks.completeAuthorization, isPending: false }) },
      disconnect: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      sellerSetup: {
        useQuery: () => ({
          data: {
            fulfillmentPolicies: [{ id: "fulfillment-1", name: "Standard shipping" }],
            paymentPolicies: [{ id: "payment-1", name: "Standard payment" }],
            returnPolicies: [{ id: "return-1", name: "30-day returns" }],
            locations: [{ merchantLocationKey: "SSS-US-IL-CHICAGO", name: "Chicago, Illinois" }],
            connection: { fulfillmentPolicyId: null, paymentPolicyId: null, returnPolicyId: null, merchantLocationKey: null, setupComplete: false },
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
      createWarehouseLocation: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      saveSellerSetup: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: mocks.authorizationDeclined },
}));

import Connection from "../client/src/pages/Connection";

describe("Connection native Seller Hub draft workflow", () => {
  beforeEach(() => {
    mocks.completeAuthorization.mockReset();
    mocks.authorizationDeclined.mockReset();
    window.history.replaceState({}, "", "/connection");
  });

  it("shows draft-first safety and the seller setup form once connected", () => {
    render(<Connection />);

    expect(screen.getByText(/ready to save drafts and publish listings when you approve them/i)).toBeTruthy();
    expect(screen.getByText(/only called when you click Publish/i)).toBeTruthy();
    expect(screen.getByText(/^Seller setup$/i)).toBeTruthy();
    expect(screen.getByText(/Shipping \(fulfillment\) policy/i)).toBeTruthy();
    expect(screen.getByText(/^Inventory location$/i)).toBeTruthy();
  });

  it("scrubs a declined OAuth return and never invokes server-side authorization completion", async () => {
    window.history.replaceState(
      {},
      "",
      "/connection?error=access_denied&error_description=Sensitive+provider+detail",
    );

    render(<Connection />);

    await waitFor(() => {
      expect(mocks.authorizationDeclined).toHaveBeenCalledWith(
        "eBay authorization was not completed. No eBay connection was saved.",
      );
    });
    expect(mocks.completeAuthorization).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/connection");
    expect(window.location.search).toBe("");
  });
});
