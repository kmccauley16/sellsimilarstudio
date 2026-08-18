// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/DashboardLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    listing: {
      history: { useQuery: () => ({ data: [], isLoading: false }) },
      importFromUrl: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
  },
}));

vi.mock("wouter", () => ({
  useLocation: () => ["/", vi.fn()],
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import Home from "../client/src/pages/Home";

describe("Home native Seller Hub draft language", () => {
  it("describes confirmed Seller Hub drafts and not legacy unpublished Inventory offers", () => {
    render(<Home />);

    expect(screen.getByText(/sold listing → seller hub draft/i)).toBeTruthy();
    expect(screen.getByText("Seller Hub drafts")).toBeTruthy();
    expect(screen.getByText("Confirmed by eBay")).toBeTruthy();
    expect(screen.queryByText(/unpublished eBay offers/i)).toBeNull();
  });
});
