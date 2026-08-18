import { afterEach, describe, expect, it, vi } from "vitest";
import {
  logRedactedEbayFailure,
  safeEbayAuthorizationDeclinedMessage,
  safeEbayAuthorizationMessage,
} from "./ebayErrorSafety";
import { parseEbayOAuthReturn } from "../shared/ebayOAuthReturn";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("safe eBay OAuth callback handling", () => {
  it("retains only the control-flow fields required for an accepted callback", () => {
    expect(parseEbayOAuthReturn("?code=one-time-code&state=signed-state")).toEqual({
      kind: "accepted",
      code: "one-time-code",
      state: "signed-state",
    });
  });

  it("classifies a declined callback without returning the provider description", () => {
    const result = parseEbayOAuthReturn("?error=access_denied&error_description=provider-token-or-detail");
    expect(result).toEqual({ kind: "declined" });
    expect(JSON.stringify(result)).not.toContain("provider-token-or-detail");
    expect(safeEbayAuthorizationDeclinedMessage()).not.toContain("provider-token-or-detail");
  });

  it("does not expose database query parameters or tokens through an authorization error", () => {
    const sensitiveError = new Error("Failed query: insert into ebay_connections; params: access-token-value, refresh-token-value");
    expect(safeEbayAuthorizationMessage()).not.toContain("access-token-value");
    expect(safeEbayAuthorizationMessage()).not.toContain("refresh-token-value");
    expect(safeEbayAuthorizationMessage()).toMatch(/could not be completed securely/i);

    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    logRedactedEbayFailure("complete seller authorization", Object.assign(sensitiveError, { code: "ER_DATA_TOO_LONG" }));
    expect(log).toHaveBeenCalledWith("[eBay] operation failed", {
      operation: "complete seller authorization",
      code: "ER_DATA_TOO_LONG",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("access-token-value");
    expect(JSON.stringify(log.mock.calls)).not.toContain("refresh-token-value");
  });
});
