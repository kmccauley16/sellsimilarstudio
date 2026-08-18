import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import {
  buildAuthorizationUrl,
  createOrReuseWarehouseLocation,
  EBAY_MARKETPLACE_ID,
  encryptToken,
  exchangeAuthorizationCode,
  fetchSellerIdentity,
  fetchSellerSetup,
  getNativeSellerHubDraftFailureDetail,
  getNativeSellerHubDraftTask,
  getUsableAccessToken,
  isEbayConfigured,
  resolveGrantedScopes,
  sellerHubDraftUrl,
  submitNativeSellerHubDraft,
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
    return Array.isArray(urls) && urls.some(url => typeof url === "string" && url.startsWith("/manus-storage/"));
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

  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    await db.deleteEbayConnection(ctx.user.id);
    return { success: true as const };
  }),

  createDraft: protectedProcedure
    .input(z.object({ listingImportId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await db.getListingImport(ctx.user.id, input.listingImportId);
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });

      const existing = await db.getEbayDraftForListing(ctx.user.id, listing.id);
      if (existing?.workflow === "seller_hub_feed" && existing.feedTaskId && listing.status !== "failed") {
        try {
          return await refreshNativeDraftTask(ctx.user.id, listing.id, existing.feedTaskId);
        } catch (error) {
          logRedactedEbayFailure("refresh native Seller Hub draft task", error, { listingImportId: listing.id });
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "eBay could not verify the Seller Hub draft task. Wait a moment, then check its status again.",
          });
        }
      }

      const hasOwnedPhoto = listingHasOwnedPhoto(listing);
      if (hasOwnedPhoto && !listing.photoRightsAttestedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Confirm that you own or are authorized to use the uploaded photos before creating a Seller Hub draft.",
        });
      }
      // eBay permits Draft rows with no Item photo URL. In that case, create a photo-pending
      // native draft rather than reusing source images; the seller can add their own photos in eBay later.
      const publicOrigin = hasOwnedPhoto ? publicRequestOrigin(ctx.req) : undefined;
      try {
        const { token } = await usableToken(ctx.user.id);
        const sku = `SSS-${ctx.user.id}-${listing.id}`.slice(0, 50);
        const submitted = await submitNativeSellerHubDraft(token, listing, sku, publicOrigin);
        const hubUrl = sellerHubDraftUrl(sku);
        await db.createEbayDraft({
          userId: ctx.user.id,
          listingImportId: listing.id,
          sku,
          workflow: "seller_hub_feed",
          offerId: null,
          feedTaskId: submitted.taskId,
          feedStatus: submitted.status,
          feedSuccessCount: null,
          feedFailureCount: null,
          resultMessage: null,
          marketplaceId: EBAY_MARKETPLACE_ID,
          sellerHubUrl: hubUrl,
        });
        await db.setListingStatus(ctx.user.id, listing.id, "draft submitted");
        return {
          taskId: submitted.taskId,
          status: "draft submitted" as const,
          feedStatus: submitted.status,
          sellerHubUrl: hubUrl,
          message: "eBay received the native Seller Hub draft submission. Check its status before assuming the draft is ready.",
        };
      } catch (error) {
        logRedactedEbayFailure("submit native Seller Hub draft", error, { listingImportId: listing.id });
        const message = "eBay could not submit the native Seller Hub draft. Review the listing fields and try again.";
        await db.setListingStatus(ctx.user.id, listing.id, "failed", message);
        throw new TRPCError({ code: "BAD_GATEWAY", message });
      }
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
