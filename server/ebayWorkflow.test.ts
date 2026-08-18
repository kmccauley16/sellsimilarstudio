import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gzipSync } from "node:zlib";
import {
  EBAY_CONTENT_LANGUAGE,
  EBAY_CURRENCY,
  EBAY_MARKETPLACE_ID,
  EBAY_NATIVE_DRAFT_FEED_TYPE,
  buildDraftPayloads,
  buildNativeSellerHubDraftCsv,
  createUnpublishedOffer,
  buildWarehouseLocationKey,
  createOAuthState,
  createOrReuseWarehouseLocation,
  decryptToken,
  encryptToken,
  getNativeSellerHubDraftFailureDetail,
  getNativeSellerHubDraftTask,
  isExpectedEmptyOfferLookupError,
  mapInventoryCondition,
  resolveGrantedScopes,
  sellerHubDraftUrl,
  submitNativeSellerHubDraft,
  verifyOAuthState,
} from "./ebayApi";
import { parseEbayListingUrl, sanitizeDescription } from "./ebayListing";
import { vi } from "vitest";

const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.EBAY_CLIENT_ID = "client-id";
  process.env.EBAY_CLIENT_SECRET = "client-secret";
  process.env.EBAY_REDIRECT_URI_NAME = "seller-studio-redirect";
  process.env.EBAY_TOKEN_ENCRYPTION_KEY = "unit-test-encryption-key";
  process.env.JWT_SECRET = "unit-test-jwt-secret";
});

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("eBay listing URL safety", () => {
  it("normalizes supported eBay US item URLs", () => {
    expect(parseEbayListingUrl("https://www.ebay.com/itm/Vintage-Camera/123456789012?hash=test")).toEqual({
      itemId: "123456789012",
      normalizedUrl: "https://www.ebay.com/itm/123456789012",
    });
  });

  it("accepts tracked item URLs and strips their query parameters before import", () => {
    expect(parseEbayListingUrl("https://www.ebay.com/itm/168520925688?_skw=mdp-1810&epid=79611526&itmmeta=tracking")).toEqual({
      itemId: "168520925688",
      normalizedUrl: "https://www.ebay.com/itm/168520925688",
    });
  });

  it("rejects deceptive and non-eBay hosts", () => {
    expect(() => parseEbayListingUrl("https://ebay.com.example.test/itm/123456789012")).toThrow(/eBay US/i);
    expect(() => parseEbayListingUrl("file:///etc/passwd")).toThrow(/secure eBay US/i);
  });
});

describe("description sanitization", () => {
  it("removes executable and embedded content while preserving safe formatting", () => {
    const output = sanitizeDescription('<p onclick="steal()">Good <strong>condition</strong></p><script>alert(1)</script><iframe src="https://evil.test"></iframe>');
    expect(output).toContain("<strong>condition</strong>");
    expect(output).not.toMatch(/onclick|script|iframe|alert\(1\)/i);
  });
});

describe("eBay OAuth protections", () => {
  it("binds a short-lived OAuth state to the signed-in user", () => {
    const now = 1_800_000_000_000;
    const state = createOAuthState(42, now);
    expect(verifyOAuthState(state, 42, now + 1_000).userId).toBe(42);
    expect(() => verifyOAuthState(state, 7, now + 1_000)).toThrow(/mismatched/i);
    expect(() => verifyOAuthState(state, 42, now + 11 * 60 * 1_000)).toThrow(/expired/i);
  });

  it("detects OAuth state tampering", () => {
    const state = createOAuthState(42);
    expect(() => verifyOAuthState(`${state.slice(0, -1)}x`, 42)).toThrow(/invalid/i);
  });

  it("encrypts seller tokens before persistence", () => {
    const encrypted = encryptToken("sensitive-access-token");
    expect(encrypted).not.toContain("sensitive-access-token");
    expect(decryptToken(encrypted)).toBe("sensitive-access-token");
  });

  it("uses the requested scopes when eBay omits scope from a token response", () => {
    const requested = resolveGrantedScopes();
    expect(resolveGrantedScopes(undefined)).toBe(requested);
    expect(resolveGrantedScopes("  granted-scope  ")).toBe("granted-scope");
  });
});

describe("inventory location safeguards", () => {
  it("creates a deterministic, bounded key from Chicago warehouse input", () => {
    expect(buildWarehouseLocationKey({ city: "Chicago", stateOrProvince: "Illinois", country: "us" })).toBe("SSS-US-ILLINOIS-CHICAGO");
    expect(buildWarehouseLocationKey({ city: "  Chicago Heights  ", stateOrProvince: "Illinois", country: "US" })).toBe("SSS-US-ILLINOIS-CHICAGO-HEIGHTS");
  });

  it("reuses a matching eBay warehouse rather than creating another location", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      locations: [{
        merchantLocationKey: "existing-chicago",
        name: "Chicago warehouse",
        location: { address: { city: " Chicago ", stateOrProvince: "ILLINOIS", country: "us" } },
      }],
    }), { status: 200 }));

    try {
      await expect(createOrReuseWarehouseLocation("access-token", { city: "Chicago", stateOrProvince: "Illinois", country: "US" })).resolves.toEqual({
        created: false,
        location: {
          merchantLocationKey: "existing-chicago",
          name: "Chicago warehouse",
          city: "Chicago",
          stateOrProvince: "ILLINOIS",
          country: "US",
        },
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/sell/inventory/v1/location?limit=100");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("creates an enabled warehouse without updating an existing eBay location or publishing", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ locations: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    try {
      await expect(createOrReuseWarehouseLocation("access-token", { city: "Chicago", stateOrProvince: "Illinois", country: "US" })).resolves.toMatchObject({
        created: true,
        location: { merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO", name: "Chicago, Illinois" },
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [createUrl, createRequest] = fetchSpy.mock.calls[1] ?? [];
      expect(String(createUrl)).toContain("/sell/inventory/v1/location/SSS-US-ILLINOIS-CHICAGO");
      expect(createRequest).toMatchObject({ method: "POST" });
      expect(JSON.parse(String(createRequest?.body))).toEqual({
        name: "Chicago, Illinois",
        locationTypes: ["WAREHOUSE"],
        merchantLocationStatus: "ENABLED",
        location: { address: { city: "Chicago", stateOrProvince: "Illinois", country: "US" } },
      });
      expect(String(createUrl)).not.toContain("publish");
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe("US unpublished offer mapping", () => {
  it("uses only eBay US, USD, and en-US product constants", () => {
    expect(EBAY_MARKETPLACE_ID).toBe("EBAY_US");
    expect(EBAY_CURRENCY).toBe("USD");
    expect(EBAY_CONTENT_LANGUAGE).toBe("en-US");
  });

  it("maps common eBay condition IDs", () => {
    expect(mapInventoryCondition("1000", "New")).toBe("NEW");
    expect(mapInventoryCondition("3000", "Pre-owned")).toBe("USED_GOOD");
  });

  it("builds inventory and offer payloads without a publish operation", () => {
    const listing = {
      title: "Vintage 35mm camera",
      description: "Clean, tested camera.",
      ownedImageUrls: JSON.stringify(["/storage/owned/user-1/listing-2/camera.jpg"]),
      itemSpecifics: JSON.stringify([{ name: "Brand", value: "Example" }]),
      quantity: 1,
      conditionId: "3000",
      conditionName: "Pre-owned",
      categoryId: "15230",
      price: "129.50",
    } as any;
    const connection = {
      fulfillmentPolicyId: "fulfillment-1",
      paymentPolicyId: "payment-1",
      returnPolicyId: "return-1",
      merchantLocationKey: "warehouse-us",
    } as any;

    const payloads = buildDraftPayloads(listing, connection, "SSS-1-2", "https://seller.example");
    expect(payloads.offer).toMatchObject({
      marketplaceId: "EBAY_US",
      sku: "SSS-1-2",
      format: "FIXED_PRICE",
      pricingSummary: { price: { currency: "USD", value: "129.50" } },
    });
    expect(payloads.inventoryItem.product.aspects).toEqual({ Brand: ["Example"] });
    expect(payloads).not.toHaveProperty("publish");
    expect(JSON.stringify(payloads)).not.toContain("publishOffer");
  });

  it("continues from eBay’s exact empty-offer lookup response to create an unpublished offer", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: [{ message: "This Offer is not available." }] }), { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ offerId: "offer-123" }), { status: 201 }));

    try {
      await expect(createUnpublishedOffer("access-token", "SSS-1-2", {
        inventoryItem: { sku: "SSS-1-2" },
        offer: { sku: "SSS-1-2", marketplaceId: "EBAY_US", format: "FIXED_PRICE" },
      } as any)).resolves.toBe("offer-123");
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(fetchSpy.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
      expect(String(fetchSpy.mock.calls[2]?.[0])).toMatch(/\/sell\/inventory\/v1\/offer$/);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("matches only the expected eBay empty-offer lookup error", () => {
    expect(isExpectedEmptyOfferLookupError(new Error("This Offer is not available."))).toBe(true);
    expect(isExpectedEmptyOfferLookupError(new Error("eBay request failed (500)"))).toBe(false);
  });

  it("creates a stable Seller Hub draft search link", () => {
    expect(sellerHubDraftUrl("SSS 1/2")).toBe("https://www.ebay.com/sh/lst/drafts?keyword=SSS%201%2F2");
  });
});

describe("native Seller Hub draft feeds", () => {
  const nativeDraftListing = {
    title: "Vintage 35mm camera",
    description: "Clean, tested camera.",
    ownedImageUrls: JSON.stringify([
      "/storage/owned/user-1/listing-2/camera.jpg",
      "/storage/owned/user-1/listing-2/camera-two.jpg",
    ]),
    // Imported source images are deliberately retained only as non-draft-eligible reference data.
    selectedImageUrls: JSON.stringify(["https://i.ebayimg.com/images/g/source-camera/s-l1600.jpg"]),
    itemSpecifics: JSON.stringify([{ name: "Brand", value: "Example" }, { name: "Model", value: "35mm" }]),
    quantity: 1,
    conditionId: "3000",
    categoryId: "15230",
    price: "129.50",
  } as any;

  it("builds a native Seller Hub Draft CSV row with seller-owned images and item specifics", () => {
    const csv = buildNativeSellerHubDraftCsv(nativeDraftListing, "SSS-1-2", "https://seller.example");

    expect(csv).toContain("Action,Custom label (SKU),Category ID,Title,Condition ID,Item photo URL,Description,Format,Quantity,Start price,C:Brand,C:Model");
    expect(csv).toContain("Draft,SSS-1-2,15230,Vintage 35mm camera,3000");
    expect(csv).toContain("https://seller.example/storage/owned/user-1/listing-2/camera.jpg|https://seller.example/storage/owned/user-1/listing-2/camera-two.jpg");
    expect(csv).not.toContain("i.ebayimg.com");
    expect(csv).toContain("Clean, tested camera.");
    expect(csv).not.toMatch(/publish/i);
  });

  it("creates and uploads an FX_LISTING feed task without calling a publish endpoint", async () => {
    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, {
        status: 201,
        headers: { location: "https://api.ebay.com/sell/feed/v1/task/task-123" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    try {
      await expect(submitNativeSellerHubDraft("access-token", nativeDraftListing, "SSS-1-2", "https://seller.example")).resolves.toEqual({
        taskId: "task-123",
        status: "QUEUED",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const [taskUrl, taskRequest] = fetchSpy.mock.calls[0] ?? [];
      const [uploadUrl, uploadRequest] = fetchSpy.mock.calls[1] ?? [];
      expect(String(taskUrl)).toContain("/sell/feed/v1/task");
      expect(taskRequest).toMatchObject({ method: "POST" });
      expect(JSON.parse(String(taskRequest?.body))).toEqual({
        feedType: EBAY_NATIVE_DRAFT_FEED_TYPE,
        schemaVersion: "1.0",
      });
      expect(String(uploadUrl)).toContain("/sell/feed/v1/task/task-123/upload_file");
      expect(uploadRequest).toMatchObject({ method: "POST" });
      expect(String(taskUrl) + String(uploadUrl)).not.toMatch(/publish/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("creates a photo-pending Draft with a blank image field and never copies source images", async () => {
    const photoPendingListing = {
      ...nativeDraftListing,
      ownedImageUrls: JSON.stringify([]),
      selectedImageUrls: JSON.stringify(["https://i.ebayimg.com/images/g/source-camera/s-l1600.jpg"]),
    };
    const csv = buildNativeSellerHubDraftCsv(photoPendingListing, "SSS-1-2");
    expect(csv).toContain('Draft,SSS-1-2,15230,Vintage 35mm camera,3000,,"Clean, tested camera."');
    expect(csv).not.toContain("i.ebayimg.com");

    const fetchSpy = vi.spyOn(global, "fetch")
      .mockResolvedValueOnce(new Response(null, {
        status: 201,
        headers: { location: "https://api.ebay.com/sell/feed/v1/task/task-photo-pending" },
      }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    try {
      await expect(submitNativeSellerHubDraft("access-token", photoPendingListing, "SSS-1-2")).resolves.toEqual({
        taskId: "task-photo-pending",
        status: "QUEUED",
      });
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const uploadRequest = fetchSpy.mock.calls[1]?.[1] as RequestInit;
      const submittedFile = (uploadRequest.body as FormData).get("file") as Blob;
      await expect(submittedFile.text()).resolves.not.toContain("i.ebayimg.com");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("reads asynchronous task counts without claiming a draft was created", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(JSON.stringify({
      taskId: "task-123",
      status: "COMPLETED",
      uploadSummary: { successCount: 1, failureCount: 0 },
    }), { status: 200 }));

    try {
      await expect(getNativeSellerHubDraftTask("access-token", "task-123")).resolves.toEqual({
        taskId: "task-123",
        status: "COMPLETED",
        successCount: 1,
        failureCount: 0,
      });
      expect(String(fetchSpy.mock.calls[0]?.[0])).toContain("/sell/feed/v1/task/task-123");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("downloads a completed result file read-only and extracts the eBay validation detail", async () => {
    const result = gzipSync("<Errors><ErrorCode>25001</ErrorCode><LongMessage><![CDATA[A required field is missing.]]></LongMessage></Errors>");
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(result, {
      status: 200,
      headers: { "content-disposition": "attachment; filename=task-123-result.xml.gz" },
    }));

    try {
      await expect(getNativeSellerHubDraftFailureDetail("access-token", "task-123")).resolves.toBe(
        "eBay error 25001: A required field is missing.",
      );
      const [url, request] = fetchSpy.mock.calls[0] ?? [];
      expect(String(url)).toContain("/sell/feed/v1/task/task-123/download_result_file");
      expect(request).toMatchObject({
        headers: expect.objectContaining({ Authorization: "Bearer access-token" }),
      });
      expect((request as RequestInit).body).toBeUndefined();
      expect(String(url)).not.toMatch(/upload_file|publish/i);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
