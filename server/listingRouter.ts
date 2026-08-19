import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { importEbayListing, ListingImportError, sanitizeDescription } from "./ebayListing";
import { protectedProcedure, router } from "./_core/trpc";
import { generateAutomaticKeywords } from "./keywordService";
import { proposeDescriptionFromTitle } from "./descriptionService";
import { MAX_KEYWORD_LENGTH, MAX_REVIEW_KEYWORDS, normalizeKeywordPhrases } from "@shared/keywords";
import { generateImage } from "./_core/imageGeneration";
import { storageGetSignedUrl, storagePut } from "./storage";

const MAX_OWNED_PHOTOS = 12;
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_BASE64_LENGTH = Math.ceil((MAX_IMAGE_UPLOAD_BYTES * 4) / 3) + 4;
const OWNED_PHOTO_PREFIX = "/storage/";
const ALLOWED_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png"] as const;

type SupportedImageMimeType = (typeof ALLOWED_UPLOAD_MIME_TYPES)[number];

const itemSpecificSchema = z.object({
  name: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(300),
});

const reviewSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).max(80),
  description: z.string().max(50_000),
  itemSpecifics: z.array(itemSpecificSchema).max(80),
  keywords: z.array(z.string().trim().min(1).max(MAX_KEYWORD_LENGTH)).max(MAX_REVIEW_KEYWORDS),
  conditionId: z.string().trim().max(32).optional(),
  conditionName: z.string().trim().max(120).optional(),
  price: z.string().regex(/^\d{1,10}(?:\.\d{1,2})?$/).optional(),
  categoryId: z.string().trim().max(32).optional(),
  categoryName: z.string().trim().max(255).optional(),
  quantity: z.number().int().min(1).max(999),
});

function parseJsonArray<T>(value: string | null, fallback: T[] = []): T[] {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function isOwnedStoragePhotoUrl(value: unknown): value is string {
  return typeof value === "string" && value.startsWith(OWNED_PHOTO_PREFIX) && value.length <= 1024;
}

function ownedPhotoUrls(value: string | null) {
  return Array.from(new Set(parseJsonArray<string>(value).filter(isOwnedStoragePhotoUrl))).slice(0, MAX_OWNED_PHOTOS);
}

function serializeListing(listing: NonNullable<Awaited<ReturnType<typeof db.getListingImport>>>) {
  return {
    ...listing,
    itemSpecifics: parseJsonArray<{ name: string; value: string }>(listing.itemSpecifics),
    keywords: normalizeKeywordPhrases(parseJsonArray<string>(listing.keywords), MAX_REVIEW_KEYWORDS),
    imageUrls: parseJsonArray<string>(listing.imageUrls),
    // Kept for backwards-compatible history data only; these images are not draft-eligible.
    selectedImageUrls: [],
    ownedImageUrls: ownedPhotoUrls(listing.ownedImageUrls),
    price: listing.price ? String(listing.price) : undefined,
  };
}

function storageKeyForOwnedPhoto(url: string) {
  if (!isOwnedStoragePhotoUrl(url)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That photo is not a seller-uploaded image." });
  }
  const key = url.slice(OWNED_PHOTO_PREFIX.length);
  if (!key || key.includes("..") || key.includes("\\")) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "That photo URL is invalid." });
  }
  return key;
}

function extensionForMimeType(mimeType: SupportedImageMimeType) {
  return mimeType === "image/png" ? "png" : "jpg";
}

function mimeTypeForOwnedPhoto(url: string): SupportedImageMimeType {
  return /\.png$/i.test(url) ? "image/png" : "image/jpeg";
}

function decodeImageUpload(base64: string, mimeType: SupportedImageMimeType) {
  const normalized = base64.replace(/\s/g, "");
  if (
    !normalized ||
    normalized.length > MAX_IMAGE_UPLOAD_BASE64_LENGTH ||
    normalized.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  ) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a valid JPEG or PNG image smaller than 10 MB." });
  }

  const buffer = Buffer.from(normalized, "base64");
  const isJpeg = buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const mimeMatchesBytes = (mimeType === "image/jpeg" && isJpeg) || (mimeType === "image/png" && isPng);
  if (!buffer.length || buffer.length > MAX_IMAGE_UPLOAD_BYTES || !mimeMatchesBytes) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Upload a valid JPEG or PNG image smaller than 10 MB." });
  }
  return buffer;
}

async function requireListing(userId: number, id: number) {
  const listing = await db.getListingImport(userId, id);
  if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
  return listing;
}

export const listingRouter = router({
  importFromUrl: protectedProcedure
    .input(z.object({ url: z.string().trim().min(1).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      try {
        const imported = await importEbayListing(input.url);
        const keywords = await generateAutomaticKeywords(imported);
        const saved = await db.createListingImport(ctx.user.id, imported, keywords);
        if (!saved) throw new Error("The imported listing could not be saved.");
        return {
          listing: serializeListing(saved),
          importMethod: imported.importMethod,
          warnings: imported.warnings,
        };
      } catch (error) {
        if (error instanceof ListingImportError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: error.message, cause: error });
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "The listing could not be imported. Please try again.",
          cause: error,
        });
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const listing = await requireListing(ctx.user.id, input.id);
      const draft = await db.getEbayDraftForListing(ctx.user.id, input.id);
      return {
        ...serializeListing(listing),
        draftWorkflow: draft?.workflow ?? null,
        offerId: draft?.offerId ?? null,
        listingId: draft?.listingId ?? null,
        sellerHubUrl: draft?.sellerHubUrl ?? null,
        feedTaskId: draft?.feedTaskId ?? null,
        feedStatus: draft?.feedStatus ?? null,
        feedSuccessCount: draft?.feedSuccessCount ?? null,
        feedFailureCount: draft?.feedFailureCount ?? null,
        draftResultMessage: draft?.resultMessage ?? null,
      };
    }),

  update: protectedProcedure.input(reviewSchema).mutation(async ({ ctx, input }) => {
    await requireListing(ctx.user.id, input.id);
    const updated = await db.updateListingReview(ctx.user.id, input.id, {
      ...input,
      keywords: normalizeKeywordPhrases(input.keywords, MAX_REVIEW_KEYWORDS),
      description: sanitizeDescription(input.description),
    });
    if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
    return serializeListing(updated);
  }),

  uploadOwnedPhoto: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
      base64: z.string().min(4).max(MAX_IMAGE_UPLOAD_BASE64_LENGTH),
    }))
    .mutation(async ({ ctx, input }) => {
      const listing = await requireListing(ctx.user.id, input.id);
      const currentUrls = ownedPhotoUrls(listing.ownedImageUrls);
      if (currentUrls.length >= MAX_OWNED_PHOTOS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `You can add up to ${MAX_OWNED_PHOTOS} seller-owned photos.` });
      }

      try {
        const bytes = decodeImageUpload(input.base64, input.mimeType);
        const { url } = await storagePut(
          `owned-listing-photos/${ctx.user.id}/${listing.id}/${Date.now()}.${extensionForMimeType(input.mimeType)}`,
          bytes,
          input.mimeType,
        );
        const updated = await db.updateOwnedImageUrls(ctx.user.id, listing.id, [...currentUrls, url]);
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
        return serializeListing(updated);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({ code: "BAD_GATEWAY", message: "The photo could not be uploaded. Try a smaller JPEG or PNG image." });
      }
    }),

  removeOwnedPhoto: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), url: z.string().min(1).max(1024) }))
    .mutation(async ({ ctx, input }) => {
      const listing = await requireListing(ctx.user.id, input.id);
      const currentUrls = ownedPhotoUrls(listing.ownedImageUrls);
      if (!currentUrls.includes(input.url)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That photo is not part of this listing." });
      }
      const updated = await db.updateOwnedImageUrls(
        ctx.user.id,
        listing.id,
        currentUrls.filter(url => url !== input.url),
      );
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
      return serializeListing(updated);
    }),

  attestPhotoRights: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await requireListing(ctx.user.id, input.id);
      if (!ownedPhotoUrls(listing.ownedImageUrls).length) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Add at least one seller-owned or authorized photo first." });
      }
      const updated = await db.setPhotoRightsAttested(ctx.user.id, listing.id);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
      return serializeListing(updated);
    }),

  attestItemAccuracy: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await requireListing(ctx.user.id, input.id);
      const updated = await db.setItemAccuracyAttested(ctx.user.id, listing.id);
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
      return serializeListing(updated);
    }),

  enhancePhotoBackground: protectedProcedure
    .input(z.object({ id: z.number().int().positive(), url: z.string().min(1).max(1024) }))
    .mutation(async ({ ctx, input }) => {
      const listing = await requireListing(ctx.user.id, input.id);
      const currentUrls = ownedPhotoUrls(listing.ownedImageUrls);
      if (!listing.photoRightsAttestedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Confirm that you own or are authorized to use these photos before enhancing one.",
        });
      }
      if (!currentUrls.includes(input.url)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That photo is not part of this listing." });
      }

      try {
        const signedUrl = await storageGetSignedUrl(storageKeyForOwnedPhoto(input.url));
        const result = await generateImage({
          prompt: "Replace the background with a clean white background. Preserve the item exactly, including its shape, color, markings, condition, and all visible details. Do not add, remove, or alter any part of the item.",
          originalImages: [{ url: signedUrl, mimeType: mimeTypeForOwnedPhoto(input.url) }],
        });
        if (!result.url || !isOwnedStoragePhotoUrl(result.url)) {
          throw new Error("The enhanced image was not saved.");
        }
        const updated = await db.updateOwnedImageUrls(
          ctx.user.id,
          listing.id,
          currentUrls.map(url => (url === input.url ? result.url! : url)),
        );
        if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Listing review not found." });
        return serializeListing(updated);
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: "The white-background version could not be created. Your original photo remains unchanged.",
        });
      }
    }),

  proposeDescription: protectedProcedure
    .input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(1).max(80),
      description: z.string().max(50_000),
    }))
    .mutation(async ({ ctx, input }) => {
      await requireListing(ctx.user.id, input.id);
      try {
        return await proposeDescriptionFromTitle({ title: input.title, description: input.description });
      } catch (error) {
        const message = error instanceof Error && /^(Enter |The description proposal (could not be read|was empty))/.test(error.message)
          ? error.message
          : "The description proposal could not be generated. Try again.";
        throw new TRPCError({ code: "BAD_REQUEST", message, cause: error });
      }
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    const rows = await db.listListingHistory(ctx.user.id);
    return rows.map(({ listing, draft }) => ({
      ...serializeListing(listing),
      offerId: draft?.offerId ?? null,
      listingId: draft?.listingId ?? null,
      sku: draft?.sku ?? null,
      workflow: draft?.workflow ?? null,
      feedTaskId: draft?.feedTaskId ?? null,
      feedStatus: draft?.feedStatus ?? null,
      feedSuccessCount: draft?.feedSuccessCount ?? null,
      feedFailureCount: draft?.feedFailureCount ?? null,
      resultMessage: draft?.resultMessage ?? null,
      sellerHubUrl: draft?.sellerHubUrl ?? null,
    }));
  }),
});
