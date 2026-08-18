import { describe, expect, it } from "vitest";
import { buildAuthorizationUrl, decryptToken, ebayEndpoints, EBAY_SCOPES, encryptToken, isEbayConfigured } from "./ebayApi";

const EBAY_TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BASE_SCOPE = "https://api.ebay.com/oauth/api_scope";

describe("configured eBay Production credentials", () => {
  it("uses the dedicated Commerce Identity gateway for Production and Sandbox", () => {
    expect(ebayEndpoints("production").commerceIdentity).toBe("https://apiz.ebay.com");
    expect(ebayEndpoints("sandbox").commerceIdentity).toBe("https://apiz.sandbox.ebay.com");
  });

  it("recognizes the configured OAuth RuName and safely encrypts a token", () => {
    const redirectUriName = process.env.EBAY_REDIRECT_URI_NAME?.trim();
    const encryptionKey = process.env.EBAY_TOKEN_ENCRYPTION_KEY?.trim();

    expect(redirectUriName, "EBAY_REDIRECT_URI_NAME must be configured").toBeTruthy();
    expect(encryptionKey, "EBAY_TOKEN_ENCRYPTION_KEY must be configured").toMatch(/^[a-f0-9]{64}$/i);
    expect(isEbayConfigured()).toBe(true);

    const authorizationUrl = new URL(buildAuthorizationUrl(123));
    expect(authorizationUrl.origin).toBe("https://auth.ebay.com");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(redirectUriName);
    expect(authorizationUrl.searchParams.get("prompt")).toBe("login");
    expect(authorizationUrl.searchParams.get("locale")).toBe("en-US");
    expect(EBAY_SCOPES).toContain("https://api.ebay.com/oauth/api_scope/commerce.identity.readonly");
    expect(decryptToken(encryptToken("ebay-token-validation"))).toBe("ebay-token-validation");
  });

  it(
    "obtains an application access token for signed-notification verification",
    async () => {
      const clientId = process.env.EBAY_CLIENT_ID?.trim();
      const clientSecret = process.env.EBAY_CLIENT_SECRET?.trim();

      expect(clientId, "EBAY_CLIENT_ID must be configured").toBeTruthy();
      expect(clientSecret, "EBAY_CLIENT_SECRET must be configured").toBeTruthy();

      const response = await fetch(EBAY_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          scope: EBAY_BASE_SCOPE,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const payload = (await response.json()) as { access_token?: string; error?: string };

      expect(response.ok, payload.error ?? "eBay did not accept the configured credentials").toBe(true);
      expect(payload.access_token).toMatch(/^v\^1\./);
    },
    20_000,
  );
});
