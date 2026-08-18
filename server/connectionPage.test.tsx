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
          data: { configured: true, connection: { ebayUserId: "seller" } },
          isLoading: false,
        }),
      },
      complianceSetup: { useQuery: () => ({ data: { endpointPath: "", verificationToken: "" }, isLoading: false }) },
      startAuthorization: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      completeAuthorization: { useMutation: () => ({ mutate: mocks.completeAuthorization, isPending: false }) },
      disconnect: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
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

  it("shows native-draft safety and removes obsolete Inventory API policy and warehouse setup", () => {
    render(<Connection />);

    expect(screen.getByText(/ready for native Seller Hub draft submissions/i)).toBeTruthy();
    expect(screen.getByText(/never calls eBay’s publish endpoint/i)).toBeTruthy();
    expect(screen.queryByText(/^Seller policies$/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /set up chicago warehouse/i })).toBeNull();
    expect(screen.queryByLabelText(/fulfillment policy/i)).toBeNull();
    expect(screen.queryByLabelText(/inventory location/i)).toBeNull();
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
