import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  upsertEbayConnection: vi.fn(),
  verifyOAuthState: vi.fn(),
  exchangeAuthorizationCode: vi.fn(),
  fetchSellerIdentity: vi.fn(),
  getEbayConnection: vi.fn(),
  fetchSellerSetup: vi.fn(),
  createOrReuseWarehouseLocation: vi.fn(),
  getUsableAccessToken: vi.fn(),
  updateEbayConnectionSettings: vi.fn(),
  getListingImport: vi.fn(),
  getEbayDraftForListing: vi.fn(),
  createEbayDraft: vi.fn(),
  updateNativeDraftFeedResult: vi.fn(),
  setListingStatus: vi.fn(),
  submitNativeSellerHubDraft: vi.fn(),
  getNativeSellerHubDraftTask: vi.fn(),
  getNativeSellerHubDraftFailureDetail: vi.fn(),
  sellerHubDraftUrl: vi.fn(),
  encryptToken: vi.fn((value: string) => `encrypted:${value}`),
  log: vi.fn(),
}));

vi.mock("./db", () => ({
  getEbayConnection: mocks.getEbayConnection,
  upsertEbayConnection: mocks.upsertEbayConnection,
  updateEbayAccessToken: vi.fn(),
  updateEbayConnectionSettings: mocks.updateEbayConnectionSettings,
  deleteEbayConnection: vi.fn(),
  getListingImport: mocks.getListingImport,
  getEbayDraftForListing: mocks.getEbayDraftForListing,
  createEbayDraft: mocks.createEbayDraft,
  updateNativeDraftFeedResult: mocks.updateNativeDraftFeedResult,
  setListingStatus: mocks.setListingStatus,
  listListingHistory: vi.fn(),
}));

vi.mock("./ebayApi", () => ({
  EBAY_MARKETPLACE_ID: "EBAY_US",
  buildAuthorizationUrl: vi.fn(),
  buildDraftPayloads: vi.fn(),
  createOrReuseWarehouseLocation: mocks.createOrReuseWarehouseLocation,
  createUnpublishedOffer: vi.fn(),
  decryptToken: vi.fn(),
  encryptToken: mocks.encryptToken,
  exchangeAuthorizationCode: mocks.exchangeAuthorizationCode,
  fetchSellerIdentity: mocks.fetchSellerIdentity,
  fetchSellerSetup: mocks.fetchSellerSetup,
  getUsableAccessToken: mocks.getUsableAccessToken,
  isEbayConfigured: vi.fn(() => true),
  resolveGrantedScopes: vi.fn((scope?: string) => scope?.trim() || "fallback-requested-scopes"),
  sellerHubDraftUrl: mocks.sellerHubDraftUrl,
  submitNativeSellerHubDraft: mocks.submitNativeSellerHubDraft,
  getNativeSellerHubDraftTask: mocks.getNativeSellerHubDraftTask,
  getNativeSellerHubDraftFailureDetail: mocks.getNativeSellerHubDraftFailureDetail,
  verifyOAuthState: mocks.verifyOAuthState,
}));

vi.mock("./ebayErrorSafety", async importOriginal => {
  const actual = await importOriginal<typeof import("./ebayErrorSafety")>();
  return { ...actual, logRedactedEbayFailure: mocks.log };
});

import { ebayRouter } from "./ebayRouter";

const caller = ebayRouter.createCaller({
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
  req: {
    headers: {
      "x-forwarded-host": "app.example.test",
      "x-forwarded-proto": "https",
    },
  } as never,
  res: {} as never,
});

describe("ebay warehouse location safety", () => {
  it("creates or reuses the confirmed warehouse without persisting seller setup", async () => {
    mocks.getEbayConnection.mockResolvedValue({
      userId: 1,
      marketplaceId: "EBAY_US",
      environment: "production",
      ebayUserId: "opaque-seller-id",
      accessTokenEncrypted: "encrypted-access-token",
      refreshTokenEncrypted: "encrypted-refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      fulfillmentPolicyId: null,
      paymentPolicyId: null,
      returnPolicyId: null,
      merchantLocationKey: null,
    });
    mocks.getUsableAccessToken.mockResolvedValue("access-token");
    mocks.createOrReuseWarehouseLocation.mockResolvedValue({
      created: true,
      location: { merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO", name: "Chicago, Illinois", city: "Chicago", stateOrProvince: "Illinois", country: "US" },
    });
    mocks.updateEbayConnectionSettings.mockClear();

    await expect(caller.createWarehouseLocation({
      city: "Chicago",
      stateOrProvince: "Illinois",
      country: "US",
      confirmCreate: true,
    })).resolves.toMatchObject({
      created: true,
      location: { merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO" },
    });

    expect(mocks.createOrReuseWarehouseLocation).toHaveBeenCalledWith("access-token", {
      city: "Chicago",
      stateOrProvince: "Illinois",
      country: "US",
    });
    expect(mocks.updateEbayConnectionSettings).not.toHaveBeenCalled();
  });

  it("persists the selected Chicago location only during the later explicit save", async () => {
    const connection = {
      userId: 1,
      marketplaceId: "EBAY_US",
      environment: "production",
      ebayUserId: "opaque-seller-id",
      accessTokenEncrypted: "encrypted-access-token",
      refreshTokenEncrypted: "encrypted-refresh-token",
      accessTokenExpiresAt: new Date(Date.now() + 60_000),
      refreshTokenExpiresAt: new Date(Date.now() + 60_000),
      fulfillmentPolicyId: null,
      paymentPolicyId: null,
      returnPolicyId: null,
      merchantLocationKey: null,
    };
    mocks.getEbayConnection.mockResolvedValue(connection);
    mocks.getUsableAccessToken.mockResolvedValue("access-token");
    mocks.createOrReuseWarehouseLocation.mockResolvedValue({
      created: false,
      location: { merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO", name: "Chicago, Illinois", city: "Chicago", stateOrProvince: "Illinois", country: "US" },
    });
    mocks.fetchSellerSetup.mockResolvedValue({
      fulfillmentPolicies: [{ id: "fulfillment-1", name: "Fulfillment" }],
      paymentPolicies: [{ id: "payment-1", name: "Payment" }],
      returnPolicies: [{ id: "return-1", name: "Returns" }],
      locations: [{ merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO", name: "Chicago, Illinois" }],
    });
    mocks.updateEbayConnectionSettings.mockResolvedValue({
      ...connection,
      fulfillmentPolicyId: "fulfillment-1",
      paymentPolicyId: "payment-1",
      returnPolicyId: "return-1",
      merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO",
    });
    mocks.updateEbayConnectionSettings.mockClear();

    const created = await caller.createWarehouseLocation({
      city: "Chicago",
      stateOrProvince: "Illinois",
      country: "US",
      confirmCreate: true,
    });
    const selectedForForm = {
      fulfillmentPolicyId: "fulfillment-1",
      paymentPolicyId: "payment-1",
      returnPolicyId: "return-1",
      merchantLocationKey: created.location.merchantLocationKey,
    };
    expect(mocks.updateEbayConnectionSettings).not.toHaveBeenCalled();

    await expect(caller.saveSellerSetup(selectedForForm)).resolves.toMatchObject({
      connection: { merchantLocationKey: "SSS-US-ILLINOIS-CHICAGO", setupComplete: true },
    });
    expect(mocks.updateEbayConnectionSettings).toHaveBeenCalledWith(1, selectedForForm);
  });

  it("rejects an unconfirmed warehouse write before calling eBay", async () => {
    mocks.createOrReuseWarehouseLocation.mockClear();

    await expect(caller.createWarehouseLocation({
      city: "Chicago",
      stateOrProvince: "Illinois",
      country: "US",
      confirmCreate: false as never,
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });

    expect(mocks.createOrReuseWarehouseLocation).not.toHaveBeenCalled();
  });
});

describe("ebay.completeAuthorization error safety", () => {
  it("redacts a sensitive database persistence failure from the caller", async () => {
    mocks.exchangeAuthorizationCode.mockResolvedValue({
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
      expires_in: 7_200,
      refresh_token_expires_in: 31_536_000,
      scope: "https://api.ebay.com/oauth/api_scope",
    });
    mocks.fetchSellerIdentity.mockResolvedValue({ userId: "opaque-commerce-identity-value" });
    mocks.upsertEbayConnection.mockRejectedValue(
      Object.assign(
        new Error("Failed query: params: access-token-value, refresh-token-value"),
        { code: "ER_DATA_TOO_LONG" },
      ),
    );

    await expect(caller.completeAuthorization({ code: "one-time-code", state: "signed-state" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "eBay authorization could not be completed securely. Please start authorization again.",
    });

    await caller.completeAuthorization({ code: "one-time-code", state: "signed-state" }).catch(error => {
      expect(error.message).not.toContain("access-token-value");
      expect(error.message).not.toContain("refresh-token-value");
    });
    expect(mocks.log).toHaveBeenCalledWith("complete seller authorization", expect.any(Error), {
      stage: "persist_connection",
      ebayUserIdLength: "opaque-commerce-identity-value".length,
      encryptedAccessTokenLength: "encrypted:access-token-value".length,
      encryptedRefreshTokenLength: "encrypted:refresh-token-value".length,
      scopesLength: "https://api.ebay.com/oauth/api_scope".length,
    });
  });

  it("persists requested scopes when eBay omits scope from a successful token response", async () => {
    mocks.exchangeAuthorizationCode.mockResolvedValue({
      access_token: "access-token-value",
      refresh_token: "refresh-token-value",
      expires_in: 7_200,
      refresh_token_expires_in: 31_536_000,
    });
    mocks.fetchSellerIdentity.mockResolvedValue({ userId: "opaque-commerce-identity-value" });
    mocks.upsertEbayConnection.mockResolvedValue({
      marketplaceId: "EBAY_US",
      environment: "production",
      ebayUserId: "opaque-commerce-identity-value",
      accessTokenExpiresAt: new Date(),
      fulfillmentPolicyId: null,
      paymentPolicyId: null,
      returnPolicyId: null,
      merchantLocationKey: null,
    });

    await expect(caller.completeAuthorization({ code: "one-time-code", state: "signed-state" })).resolves.toMatchObject({
      connection: { ebayUserId: "opaque-commerce-identity-value" },
    });

    expect(mocks.upsertEbayConnection).toHaveBeenLastCalledWith(expect.objectContaining({
      scopes: "fallback-requested-scopes",
    }));
  });
});

describe("native Seller Hub draft task safety", () => {
  const connection = {
    userId: 1,
    marketplaceId: "EBAY_US",
    environment: "production",
    ebayUserId: "opaque-seller-id",
    accessTokenEncrypted: "encrypted-access-token",
    refreshTokenEncrypted: "encrypted-refresh-token",
    accessTokenExpiresAt: new Date(Date.now() + 60_000),
    refreshTokenExpiresAt: new Date(Date.now() + 60_000),
    fulfillmentPolicyId: null,
    paymentPolicyId: null,
    returnPolicyId: null,
    merchantLocationKey: null,
  };
  const listing = {
    id: 200,
    userId: 1,
    title: "Test lamp",
    status: "review",
    ownedImageUrls: JSON.stringify(["/manus-storage/owned/user-1/listing-200/lamp.jpg"]),
    photoRightsAttestedAt: new Date(),
    itemAccuracyAttestedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getEbayConnection.mockResolvedValue(connection);
    mocks.getUsableAccessToken.mockResolvedValue("access-token");
    mocks.getListingImport.mockResolvedValue(listing);
    mocks.getEbayDraftForListing.mockResolvedValue(undefined);
    mocks.createEbayDraft.mockResolvedValue(undefined);
    mocks.updateNativeDraftFeedResult.mockResolvedValue({ sku: "SSS-1-200", sellerHubUrl: "https://www.ebay.com/sh/lst/drafts?keyword=SSS-1-200" });
    mocks.setListingStatus.mockResolvedValue(undefined);
    mocks.submitNativeSellerHubDraft.mockResolvedValue({ taskId: "task-200", status: "QUEUED" });
    mocks.getNativeSellerHubDraftTask.mockResolvedValue({ taskId: "task-200", status: "IN_PROCESS", successCount: 0, failureCount: 0 });
    mocks.getNativeSellerHubDraftFailureDetail.mockResolvedValue(undefined);
    mocks.sellerHubDraftUrl.mockReturnValue("https://www.ebay.com/sh/lst/drafts?keyword=SSS-1-200");
    mocks.log.mockClear();
  });

  it("records only a submitted native task until eBay confirms a completed draft", async () => {
    await expect(caller.createDraft({ listingImportId: 200 })).resolves.toMatchObject({
      taskId: "task-200",
      status: "draft submitted",
      feedStatus: "QUEUED",
    });

    expect(mocks.submitNativeSellerHubDraft).toHaveBeenCalledWith("access-token", listing, "SSS-1-200", "https://app.example.test");
    expect(mocks.createEbayDraft).toHaveBeenCalledWith(expect.objectContaining({
      workflow: "seller_hub_feed",
      offerId: null,
      feedTaskId: "task-200",
      feedStatus: "QUEUED",
    }));
    expect(mocks.setListingStatus).toHaveBeenCalledWith(1, 200, "draft submitted");
    expect(mocks.getNativeSellerHubDraftTask).not.toHaveBeenCalled();
  });

  it("does not require an item-accuracy confirmation to create a photo-pending native task", async () => {
    mocks.getListingImport.mockResolvedValue({
      ...listing,
      itemAccuracyAttestedAt: null,
    });

    await expect(caller.createDraft({ listingImportId: 200 })).resolves.toMatchObject({
      taskId: "task-200",
      status: "draft submitted",
    });
    expect(mocks.submitNativeSellerHubDraft).toHaveBeenCalledOnce();
    expect(mocks.createEbayDraft).toHaveBeenCalledOnce();
  });

  it("marks a native Seller Hub draft as created only after eBay reports a successful completed task", async () => {
    mocks.getEbayDraftForListing.mockResolvedValue({
      userId: 1,
      listingImportId: 200,
      workflow: "seller_hub_feed",
      feedTaskId: "task-200",
      sku: "SSS-1-200",
      sellerHubUrl: "https://www.ebay.com/sh/lst/drafts?keyword=SSS-1-200",
    });
    mocks.getNativeSellerHubDraftTask.mockResolvedValue({
      taskId: "task-200",
      status: "COMPLETED",
      successCount: 1,
      failureCount: 0,
    });

    await expect(caller.refreshDraftStatus({ listingImportId: 200 })).resolves.toMatchObject({
      status: "draft created",
      successCount: 1,
      failureCount: 0,
    });

    expect(mocks.updateNativeDraftFeedResult).toHaveBeenCalledWith(1, 200, {
      feedStatus: "COMPLETED",
      feedSuccessCount: 1,
      feedFailureCount: 0,
      resultMessage: null,
    });
    expect(mocks.setListingStatus).toHaveBeenCalledWith(1, 200, "draft created", undefined);
    expect(mocks.submitNativeSellerHubDraft).not.toHaveBeenCalled();
  });

  it("surfaces a completed failed task detail without creating another native submission", async () => {
    mocks.getEbayDraftForListing.mockResolvedValue({
      userId: 1,
      listingImportId: 200,
      workflow: "seller_hub_feed",
      feedTaskId: "task-200",
      sku: "SSS-1-200",
      sellerHubUrl: "https://www.ebay.com/sh/lst/drafts?keyword=SSS-1-200",
    });
    mocks.getNativeSellerHubDraftTask.mockResolvedValue({
      taskId: "task-200",
      status: "COMPLETED_WITH_ERROR",
      successCount: 0,
      failureCount: 1,
    });
    mocks.getNativeSellerHubDraftFailureDetail.mockResolvedValue("eBay error 25001: A required field is missing.");

    await expect(caller.refreshDraftStatus({ listingImportId: 200 })).resolves.toMatchObject({
      status: "failed",
      message: "eBay could not create the Seller Hub draft. eBay error 25001: A required field is missing.",
    });

    expect(mocks.getNativeSellerHubDraftFailureDetail).toHaveBeenCalledWith("access-token", "task-200");
    expect(mocks.updateNativeDraftFeedResult).toHaveBeenCalledWith(1, 200, expect.objectContaining({
      resultMessage: "eBay could not create the Seller Hub draft. eBay error 25001: A required field is missing.",
    }));
    expect(mocks.submitNativeSellerHubDraft).not.toHaveBeenCalled();
  });

  it("does not allow an existing native task to be resubmitted while it is still pending", async () => {
    mocks.getEbayDraftForListing.mockResolvedValue({
      userId: 1,
      listingImportId: 200,
      workflow: "seller_hub_feed",
      feedTaskId: "task-200",
      sku: "SSS-1-200",
      sellerHubUrl: "https://www.ebay.com/sh/lst/drafts?keyword=SSS-1-200",
    });

    await expect(caller.createDraft({ listingImportId: 200 })).resolves.toMatchObject({
      taskId: "task-200",
      status: "draft processing",
    });

    expect(mocks.submitNativeSellerHubDraft).not.toHaveBeenCalled();
    expect(mocks.getNativeSellerHubDraftTask).toHaveBeenCalledWith("access-token", "task-200");
  });
});
