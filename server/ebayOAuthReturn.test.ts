import { describe, expect, it } from "vitest";
import { parseEbayOAuthReturn } from "@shared/ebayOAuthReturn";

describe("eBay OAuth return parsing", () => {
  it("accepts a normal authorization return only when both code and state are present", () => {
    expect(parseEbayOAuthReturn("?code=authorization-code&state=signed-state")).toEqual({
      kind: "accepted",
      code: "authorization-code",
      state: "signed-state",
    });
  });

  it("treats an explicit eBay decline as declined even if code and state are present", () => {
    const result = parseEbayOAuthReturn(
      "?error=access_denied&error_description=Sensitive+provider+detail&code=untrusted-code&state=untrusted-state",
    );

    expect(result).toEqual({ kind: "declined" });
    expect(JSON.stringify(result)).not.toContain("Sensitive provider detail");
    expect(JSON.stringify(result)).not.toContain("untrusted-code");
  });

  it("does not complete authorization for an incomplete return without an explicit decline", () => {
    expect(parseEbayOAuthReturn("?state=signed-state")).toEqual({ kind: "none" });
  });
});
