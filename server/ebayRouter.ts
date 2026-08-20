import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import {
  buildAuthorizationUrl,
  buildDraftPayloads,
  createOrReuseWarehouseLocation,
  createUnpublishedOffer,
  defaultConditionOptions,
  EBAY_MARKETPLACE_ID,
  ebayListingUrl,
  encryptToken,
  exchangeAuthorizationCode,
  fetchConditionOptions,
  fetchSellerIdentity,
  fetchSellerSetup,
  getNativeSellerHubDraftFailureDetail,
  getNativeSellerHubDraftTask,
  getUsableAccessToken,
  isEbayConfigured,
  publishOffer,
  resolveGrantedScopes,
  sellerHubDraftUrl,
  verifyOAuthState,
} from "./ebayApi";
import { protectedProcedure, router } from "./_core/trpc";
import { logRedactedEbayFailure, safeEbayAuthorizationMessage } from "./ebayErrorSafety";
import {
  deriveEbayDeletionVerificationToken,
  EBAY_DELETION_PATH,
} from "./ebayDeletion";

async function requireConnection(userId: number) {
  const connection = await db.getEbayConnection(userId);
  if (!connection) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Connect your eBay US account first." });
  }
  return connection;
}

async function usableToken(userId: number) {
  const connection = await requireConnection(userId);
  const token = await getUsableAccessToken(connection, (encrypted, expiresAt) =>
    db.updateEbayAccessToken(userId, encrypted, expiresAt),
  );
  return { connection, token };
}

function connectionSummary(connection: Awaited<ReturnType<typeof db.getEbayConnection>>) {
  if (!connection) return null;
  return {
    marketplaceId: connection.marketplaceId,
    environment: connection.environment,
    ebayUserId: connection.ebayUserId,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    fulfillmentPolicyId: connection.fulfillmentPolicyId,
    paymentPolicyId: connection.paymentPolicyId,
    returnPolicyId: connection.returnPolicyId,
    merchantLocationKey: connection.merchantLocationKey,
    setupComplete: Boolean(
      connection.fulfillmentPolicyId &&
      connection.paymentPolicyId &&
      connection.returnPolicyId &&
      connection.merchantLocationKey,
    ),
  };
}

function publicRequestOrigin(req: { headers: Record<string, string | string[] | undefined>; protocol?: string }) {
  const header = (name: string) => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const host = (header("x-forwarded-host") || header("host") || "").split(",")[0].trim();
  const protocol = (header("x-forwarded-proto") || req.protocol || "https").split(",")[0].trim().toLowerCase();
  if (!host || protocol !== "https") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Open the securely deployed app before creating a Seller Hub draft with uploaded photos.",
    });
  }
  try {
    return new URL(`https://${host}`).origin;
  } catch {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "The public app URL could not be verified. Refresh the deployed app and try again.",
    });
  }
}

function listingHasOwnedPhoto(listing: Awaited<ReturnType<typeof db.getListingImport>>) {
  if (!listing) return false;
  try {
    const urls = JSON.parse(listing.ownedImageUrls) as unknown;
    return Array.isArray(urls) && urls.some(url => typeof url === "string" && url.startsWith("/storage/"));
  } catch {
    return false;
  }
}

function mapFeedTaskToLocalState(task: { status: string; successCount?: number; failureCount?: number }) {
  const status = task.status.toUpperCase();
  const successCount = task.successCount ?? 0;
  const failureCount = task.failureCount ?? 0;
  if (["COMPLETED", "COMPLETED_WITH_ERROR"].includes(status)) {
    if (successCount >= 1 && failureCount === 0) {
      return { listingStatus: "draft created" as const, message: undefined };
    }
    return {
      listingStatus: "failed" as const,
      message: "eBay could not create the Seller Hub draft. Open Seller Hub Reports to review the completed feed result before retrying.",
    };
  }
  if (status === "IN_PROCESS") return { listingStatus: "draft processing" as const, message: undefined };
  return { listingStatus: "draft submitted" as const, message: undefined };
}

async function refreshNativeDraftTask(userId: number, listingImportId: number, taskId: string) {
  const { token } = await usableToken(userId);
  const task = await getNativeSellerHubDraftTask(token, taskId);
  const state = mapFeedTaskToLocalState(task);
  let resultMessage = state.message;

  if (state.listingStatus === "failed") {
    try {
      const detail = await getNativeSellerHubDraftFailureDetail(token, taskId);
      if (detail) resultMessage = `eBay could not create the Seller Hub draft. ${detail}`;
    } catch (error) {
      // The task outcome remains available even when eBay's optional result file cannot be downloaded.
      logRedactedEbayFailure("download native Seller Hub draft result file", error, { listingImportId });
    }
  }

  const draft = await db.updateNativeDraftFeedResult(userId, listingImportId, {
    feedStatus: task.status,
    feedSuccessCount: task.successCount ?? null,
    feedFailureCount: task.failureCount ?? null,
    resultMessage: resultMessage ?? null,
  });
  await db.setListingStatus(userId, listingImportId, state.listingStatus, resultMessage);
  return {
    taskId: task.taskId,
    status: state.listingStatus,
    feedStatus: task.status,
    successCount: task.successCount ?? 0,
    failureCount: task.failureCount ?? 0,
    sellerHubUrl: draft?.sellerHubUrl ?? sellerHubDraftUrl(draft?.sku ?? `SSS-${userId}-${listingImportId}`),
    message: resultMessage,
  };
}

async function publishOneDraft(userId: number, listingImportId: number): Promise<
  | { success: true; listingId: string; url: string }
  | { success: false; code: "NOT_FOUND" | "BAD_GATEWAY"; message: string }
> {
  const draft = await db.getEbayDraftForListing(userId, listingImportId);
  if (!draft || draft.workflow !== "inventory_offer" || !draft.offerId) {
    return { success: false, code: "NOT_FOUND", message: "Create the eBay draft before publishing it." };
  }
  try {
    const { token } = await usableToken(userId);
    const { listingId } = await publishOffer(token, draft.offerId);
    const url = ebayListingUrl(listingId);
    await db.markOfferPublished(userId, listingImportId, { listingId, url });
    await db.setListingStatus(userId, listingImportId, "published");
    return { success: true, listingId, url };
  } catch (error) {
    logRedactedEbayFailure("publish eBay offer", error, { listingImportId });
    return {
      success: false,
      code: "BAD_GATEWAY",
      message: error instanceof Error ? error.message : "eBay could not publish this listing. Review the listing details and try again.",
    };
  }
}

export const ebayRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => ({
    configured: isEbayConfigured(),
    connection: connectionSummary(await db.getEbayConnection(ctx.user.id)),
  })),

  complianceSetup: protectedProcedure.query(() => ({
    endpointPath: EBAY_DELETION_PATH,
    verificationToken: deriveEbayDeletionVerificationToken(),
  })),

  startAuthorization: protectedProcedure.mutation(({ ctx }) => {
    if (!isEbayConfigured()) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "The eBay developer credentials have not been configured yet.",
      });
    }
    return { url: buildAuthorizationUrl(ctx.user.id) };
  }),

  completeAuthorization: protectedProcedure
    .input(z.object({ code: z.string().trim().min(1).max(4096), state: z.string().trim().min(1).max(4096) }))
    .mutation(async ({ ctx, input }) => {
      let stage = "validate_state";
      let ebayUserIdLength: number | undefined;
      let encryptedAccessTokenLength: number | undefined;
      let encryptedRefreshTokenLength: number | undefined;
      let scopesLength: number | undefined;

      try {
        verifyOAuthState(input.state, ctx.user.id);
        stage = "exchange_authorization_code";
        const tokens = await exchangeAuthorizationCode(input.code);
        const scopes = resolveGrantedScopes(tokens.scope);
        stage = "validate_refresh_token";
        if (!tokens.refresh_token) throw new Error("eBay did not return a refresh token. Revoke access and reconnect.");
        stage = "fetch_seller_identity";
        const identity = await fetchSellerIdentity(tokens.access_token);
        ebayUserIdLength = identity.userId.length;
        stage = "encrypt_tokens";
        const accessTokenEncrypted = encryptToken(tokens.access_token);
        const refreshTokenEncrypted = encryptToken(tokens.refresh_token);
        encryptedAccessTokenLength = accessTokenEncrypted.length;
        encryptedRefreshTokenLength = refreshTokenEncrypted.length;
        scopesLength = scopes.length;
        stage = "persist_connection";
        const now = Date.now();
        const connection = await db.upsertEbayConnection({
          userId: ctx.user.id,
          marketplaceId: EBAY_MARKETPLACE_ID,
          environment: process.env.EBAY_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
          ebayUserId: identity.userId,
          accessTokenEncrypted,
          refreshTokenEncrypted,
          accessTokenExpiresAt: new Date(now + tokens.expires_in * 1000),
          refreshTokenExpiresAt: tokens.refresh_token_expires_in
            ? new Date(now + tokens.refresh_token_expires_in * 1000)
            : null,
          scopes,
        });
        return { connection: connectionSummary(connection) };
      } catch (error) {
        // Provider and database errors can embed OAuth tokens or query parameters in their text.
        // Log only structured, non-secret context and return an invariant safe message.
        logRedactedEbayFailure("complete seller authorization", error, {
          stage,
          ebayUserIdLength,
          encryptedAccessTokenLength,
          encryptedRefreshTokenLength,
          scopesLength,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: safeEbayAuthorizationMessage(),
        });
      }
    }),

  sellerSetup: protectedProcedure.query(async ({ ctx }) => {
    try {
      const { connection, token } = await usableToken(ctx.user.id);
      return { ...await fetchSellerSetup(token), connection: connectionSummary(connection) };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      throw new TRPCError({
        code: "BAD_GATEWAY",
        message: error instanceof Error ? error.message : "Your eBay seller settings could not be loaded.",
        cause: error,
      });
    }
  }),

  createWarehouseLocation: protectedProcedure
    .input(z.object({
      city: z.string().trim().min(1).max(128),
      stateOrProvince: z.string().trim().min(1).max(128),
      country: z.string().trim().length(2).transform(value => value.toUpperCase()),
      confirmCreate: z.literal(true),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        const { confirmCreate: _confirmCreate, ...warehouse } = input;
        const { token } = await usableToken(ctx.user.id);
        return await createOrReuseWarehouseLocation(token, warehouse);
      } catch (error) {
        logRedactedEbayFailure("create warehouse location", error, {
          cityLength: input.city.length,
          stateOrProvinceLength: input.stateOrProvince.length,
          country: input.country,
        });
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "eBay could not create or verify that inventory location. Review the city, state, and country, then try again.",
        });
      }
    }),

  saveSellerSetup: protectedProcedure
    .input(z.object({
      fulfillmentPolicyId: z.string().trim().min(1).max(64),
      paymentPolicyId: z.string().trim().min(1).max(64),
      returnPolicyId: z.string().trim().min(1).max(64),
      merchantLocationKey: z.string().trim().min(1).max(64),
    }))
    .mutation(async ({ ctx, input }) => {
      const { token } = await usableToken(ctx.user.id);
      const setup = await fetchSellerSetup(token);
      const valid =
        setup.fulfillmentPolicies.some(item => item.id === input.fulfillmentPolicyId) &&
        setup.paymentPolicies.some(item => item.id === input.paymentPolicyId) &&
        setup.returnPolicies.some(item => item.id === input.returnPolicyId) &&
        setup.locations.some(item => item.merchantLocationKey === input.merchantLocationKey);
      if (!valid) throw new TRPCError({ code: "BAD_REQUEST", message: "Choose valid policies and a location from your eBay US account." });
      const connection = await db.updateEbayConnectionSettings(ctx.user.id, input);
      return { connection: connectionSummary(connection) };
    }),

  conditionOptions: protectedProcedure
    .input(z.object({ categoryId: z.string().trim().max(64).optional() }))
    .query(async ({ ctx, input }) => {
      const connection = await db.getEbayConnection(ctx.user.id);
      if (!connection) return defaultConditionOptions();
      try {
        const token = await getUsableAccessToken(connection, (encrypted, expiresAt) =>
          db.updateEbayAccessToken(ctx.user.id, encrypted, expiresAt),
        );
        return await fetchConditionOptions(token, input.categoryId);
      } catch (error) {
        // A seller must always see a usable condition list even when the live eBay lookup fails.
        logRedactedEbayFailure("fetch item condition options", error, { categoryId: input.categoryId });
        return defaultConditionOptions();
      }
    }),

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await db.deleteEbayConnection(ctx.user.id);
    return { success: true as const };
  }),

  createDraft: protectedProcedure
    .input(z.object({ listingImportId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await db.getListingImport(ctx.user.id, input.listingImportId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });

      const hasOwnedPhoto = listingHasOwnedPhoto(listing);
      if (hasOwnedPhoto && !listing.photoRightsAttestedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Confirm that you own or are authorized to use the uploaded photos before creating a draft.",
        });
      }

      const connection = await requireConnection(ctx.user.id);
      if (!connection.fulfillmentPolicyId || !connection.paymentPolicyId || !connection.returnPolicyId || !connection.merchantLocationKey) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Finish eBay seller setup (shipping, payment, and return policies, plus an inventory location) on the eBay connection page before creating a draft.",
        });
      }

      const sku = `SSS-${ctx.user.id}-${listing.id}`.slice(0, 50);
      // eBay allows an offer with no photos, but publishing an image-less offer will fail;
      // only pass a public origin when there are seller-owned photos to include.
      const publicOrigin = hasOwnedPhoto ? publicRequestOrigin(ctx.req) : undefined;

      let payloads: ReturnType<typeof buildDraftPayloads>;
      try {
        payloads = buildDraftPayloads(listing, connection, sku, publicOrigin);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "This listing is not ready for a draft yet." });
      }

      try {
        const { token } = await usableToken(ctx.user.id);
        const offerId = await createUnpublishedOffer(token, sku, payloads);
        await db.createEbayDraft({
          userId: ctx.user.id,
          listingImportId: listing.id,
          sku,
          workflow: "inventory_offer",
          offerId,
          listingId: null,
          feedTaskId: null,
          feedStatus: null,
          feedSuccessCount: null,
          feedFailureCount: null,
          resultMessage: null,
          marketplaceId: EBAY_MARKETPLACE_ID,
          sellerHubUrl: null,
        });
        await db.setListingStatus(ctx.user.id, listing.id, "draft created");
        return {
          offerId,
          status: "draft created" as const,
          message: "Saved as an unpublished eBay offer. Nothing is live until you publish it.",
        };
      } catch (error) {
        logRedactedEbayFailure("create unpublished eBay offer", error, { listingImportId: listing.id });
        const message = error instanceof Error ? error.message : "eBay could not save this draft. Review the listing fields and try again.";
        await db.setListingStatus(ctx.user.id, listing.id, "failed", message);
        throw new TRPCError({ code: "BAD_GATEWAY", message });
      }
    }),

  publishDraft: protectedProcedure
    .input(z.object({ listingImportId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const result = await publishOneDraft(ctx.user.id, input.listingImportId);
      if (!result.success) throw new TRPCError({ code: result.code, message: result.message });
      return { listingId: result.listingId, url: result.url };
    }),

  publishMany: protectedProcedure
    .input(z.object({ listingImportIds: z.array(z.number().int().positive()).min(1).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const results = [];
      for (const listingImportId of input.listingImportIds) {
        results.push({ listingImportId, ...await publishOneDraft(ctx.user.id, listingImportId) });
      }
      return { results };
    }),

  refreshDraftStatus: protectedProcedure
    .input(z.object({ listingImportId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const draft = await db.getEbayDraftForListing(ctx.user.id, input.listingImportId);
      if (!draft || draft.workflow !== "seller_hub_feed" || !draft.feedTaskId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No native Seller Hub draft task was found for this review." });
      }
      try {
        return await refreshNativeDraftTask(ctx.user.id, input.listingImportId, draft.feedTaskId);
      } catch (error) {
        logRedactedEbayFailure("refresh native Seller Hub draft task", error, { listingImportId: input.listingImportId });
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "eBay could not verify the Seller Hub draft task. Wait a moment, then check its status again.",
        });
      }
    }),
});
