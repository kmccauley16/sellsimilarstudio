import { and, desc, eq, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  ebayConnections,
  ebayDrafts,
  listingImports,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import type { ImportedListing, ItemSpecific } from "./ebayListing";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  const result = await db.select().from(users).where(eq(users.email, normalized)).limit(1);
  return result[0];
}

export async function createUser(user: { openId: string; email: string; passwordHash: string; name?: string | null }) {
  const db = await requireDb();
  const email = user.email.trim().toLowerCase();
  const role = email === ENV.ownerEmail.trim().toLowerCase() && ENV.ownerEmail ? "admin" : "user";
  await db.insert(users).values({
    openId: user.openId,
    email,
    passwordHash: user.passwordHash,
    name: user.name ?? null,
    loginMethod: "password",
    role,
    lastSignedIn: new Date(),
  });
  return getUserByEmail(email);
}

export async function touchLastSignedIn(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
}

export async function createListingImport(
  userId: number,
  listing: ImportedListing,
  keywords: string[] = [],
) {
  const db = await requireDb();
  const result = await db.insert(listingImports).values({
    userId,
    sourceUrl: listing.sourceUrl,
    sourceItemId: listing.sourceItemId,
    title: listing.title,
    description: listing.description,
    itemSpecifics: JSON.stringify(listing.itemSpecifics),
    keywords: JSON.stringify(keywords),
    imageUrls: JSON.stringify(listing.imageUrls),
    ownedImageUrls: JSON.stringify([]),
    // Source images are retained only for reference and never selected for draft submission.
    selectedImageUrls: JSON.stringify([]),
    conditionId: listing.conditionId,
    conditionName: listing.conditionName,
    price: listing.price,
    currency: "USD",
    categoryId: listing.categoryId,
    categoryName: listing.categoryName,
    quantity: 1,
    status: "review",
  });
  const id = Number(result[0].insertId);
  return getListingImport(userId, id);
}

export async function getListingImport(userId: number, id: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(listingImports)
    .where(and(eq(listingImports.id, id), eq(listingImports.userId, userId)))
    .limit(1);
  return rows[0];
}

export type ListingReviewUpdate = {
  title: string;
  description: string;
  itemSpecifics: ItemSpecific[];
  keywords: string[];
  conditionId?: string;
  conditionName?: string;
  price?: string;
  categoryId?: string;
  categoryName?: string;
  quantity: number;
};

export type ListingReviewMaterialSnapshot = {
  title: string;
  description: string;
  itemSpecifics: string;
  conditionId: string | null;
  conditionName: string | null;
  price: string | null;
  categoryId: string | null;
  categoryName: string | null;
  quantity: number;
};

function normalizePriceForComparison(value?: string | null) {
  const normalized = value?.trim();
  if (!normalized) return null;
  const [whole, fraction = ""] = normalized.split(".");
  return `${whole.replace(/^0+(?=\d)/, "")}.${fraction.padEnd(2, "0")}`;
}

function hasSameItemSpecifics(stored: string, incoming: ItemSpecific[]) {
  try {
    return JSON.stringify(JSON.parse(stored)) === JSON.stringify(incoming);
  } catch {
    // A malformed legacy value cannot prove equivalence, so require a fresh attestation.
    return false;
  }
}

export function hasMaterialListingChanges(
  stored: ListingReviewMaterialSnapshot,
  input: ListingReviewUpdate,
) {
  return (
    stored.title !== input.title ||
    stored.description !== input.description ||
    !hasSameItemSpecifics(stored.itemSpecifics, input.itemSpecifics) ||
    stored.conditionId !== (input.conditionId ?? null) ||
    stored.conditionName !== (input.conditionName ?? null) ||
    normalizePriceForComparison(stored.price) !== normalizePriceForComparison(input.price) ||
    stored.categoryId !== (input.categoryId ?? null) ||
    stored.categoryName !== (input.categoryName ?? null) ||
    stored.quantity !== input.quantity
  );
}

export function buildListingReviewUpdateValues(
  input: ListingReviewUpdate,
  materialFieldsChanged: boolean,
) {
  return {
    title: input.title,
    description: input.description,
    itemSpecifics: JSON.stringify(input.itemSpecifics),
    keywords: JSON.stringify(input.keywords),
    // Legacy source-image selections are deliberately cleared: draft images must be seller uploads.
    selectedImageUrls: JSON.stringify([]),
    // Only a real listing-content change revokes the seller's prior accuracy confirmation.
    ...(materialFieldsChanged ? { itemAccuracyAttestedAt: null } : {}),
    conditionId: input.conditionId ?? null,
    conditionName: input.conditionName ?? null,
    price: input.price ?? null,
    categoryId: input.categoryId ?? null,
    categoryName: input.categoryName ?? null,
    quantity: input.quantity,
    errorMessage: null,
  };
}

export async function updateListingReview(userId: number, id: number, input: ListingReviewUpdate) {
  const db = await requireDb();
  const existing = await getListingImport(userId, id);
  if (!existing) return undefined;

  await db
    .update(listingImports)
    .set(buildListingReviewUpdateValues(input, hasMaterialListingChanges(existing, input)))
    .where(and(eq(listingImports.id, id), eq(listingImports.userId, userId)));
  return getListingImport(userId, id);
}

export async function updateOwnedImageUrls(userId: number, id: number, urls: string[]) {
  const db = await requireDb();
  await db
    .update(listingImports)
    .set({
      ownedImageUrls: JSON.stringify(urls),
      // A changed photo set requires the seller to re-confirm both relevant statements.
      photoRightsAttestedAt: null,
      itemAccuracyAttestedAt: null,
    })
    .where(and(eq(listingImports.id, id), eq(listingImports.userId, userId)));
  return getListingImport(userId, id);
}

export async function setPhotoRightsAttested(userId: number, id: number) {
  const db = await requireDb();
  await db
    .update(listingImports)
    .set({ photoRightsAttestedAt: new Date() })
    .where(and(eq(listingImports.id, id), eq(listingImports.userId, userId)));
  return getListingImport(userId, id);
}

export async function setItemAccuracyAttested(userId: number, id: number) {
  const db = await requireDb();
  await db
    .update(listingImports)
    .set({ itemAccuracyAttestedAt: new Date() })
    .where(and(eq(listingImports.id, id), eq(listingImports.userId, userId)));
  return getListingImport(userId, id);
}

export type ListingStatus = "review" | "draft submitted" | "draft processing" | "draft created" | "published" | "failed";

export async function setListingStatus(
  userId: number,
  id: number,
  status: ListingStatus,
  errorMessage?: string,
) {
  const db = await requireDb();
  await db
    .update(listingImports)
    .set({ status, errorMessage: errorMessage ?? null })
    .where(and(eq(listingImports.id, id), eq(listingImports.userId, userId)));
}

export async function listListingHistory(userId: number) {
  const db = await requireDb();
  return db
    .select({ listing: listingImports, draft: ebayDrafts })
    .from(listingImports)
    .leftJoin(ebayDrafts, eq(ebayDrafts.listingImportId, listingImports.id))
    .where(eq(listingImports.userId, userId))
    .orderBy(desc(listingImports.createdAt))
    .limit(100);
}

export async function getEbayConnection(userId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(ebayConnections)
    .where(eq(ebayConnections.userId, userId))
    .limit(1);
  return rows[0];
}

export async function upsertEbayConnection(input: typeof ebayConnections.$inferInsert) {
  const db = await requireDb();
  await db.insert(ebayConnections).values(input).onDuplicateKeyUpdate({
    set: {
      marketplaceId: input.marketplaceId,
      environment: input.environment,
      ebayUserId: input.ebayUserId,
      fulfillmentPolicyId: input.fulfillmentPolicyId,
      paymentPolicyId: input.paymentPolicyId,
      returnPolicyId: input.returnPolicyId,
      merchantLocationKey: input.merchantLocationKey,
      accessTokenEncrypted: input.accessTokenEncrypted,
      refreshTokenEncrypted: input.refreshTokenEncrypted,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      refreshTokenExpiresAt: input.refreshTokenExpiresAt,
      scopes: input.scopes,
    },
  });
  return getEbayConnection(input.userId);
}

export async function updateEbayConnectionSettings(
  userId: number,
  settings: {
    fulfillmentPolicyId: string;
    paymentPolicyId: string;
    returnPolicyId: string;
    merchantLocationKey: string;
  },
) {
  const db = await requireDb();
  await db
    .update(ebayConnections)
    .set(settings)
    .where(eq(ebayConnections.userId, userId));
  return getEbayConnection(userId);
}

export async function updateEbayAccessToken(
  userId: number,
  accessTokenEncrypted: string,
  accessTokenExpiresAt: Date,
) {
  const db = await requireDb();
  await db
    .update(ebayConnections)
    .set({ accessTokenEncrypted, accessTokenExpiresAt })
    .where(eq(ebayConnections.userId, userId));
}

export async function deleteEbayConnection(userId: number) {
  const db = await requireDb();
  await db.delete(ebayConnections).where(eq(ebayConnections.userId, userId));
}

export async function deleteEbayAccountDataBySellerIdentity(
  ebayUserId: string,
  username?: string,
) {
  const db = await requireDb();
  return db.transaction(async tx => {
    const identityFilter = username
      ? or(eq(ebayConnections.ebayUserId, ebayUserId), eq(ebayConnections.ebayUserId, username))
      : eq(ebayConnections.ebayUserId, ebayUserId);
    const matches = await tx
      .select({ userId: ebayConnections.userId })
      .from(ebayConnections)
      .where(identityFilter);

    const userIds = Array.from(new Set(matches.map(connection => connection.userId)));
    for (const userId of userIds) {
      // Draft rows are removed by the listing_imports ON DELETE CASCADE constraint.
      await tx.delete(listingImports).where(eq(listingImports.userId, userId));
      await tx.delete(ebayConnections).where(eq(ebayConnections.userId, userId));
    }
    return userIds.length;
  });
}

export async function getEbayDraftForListing(userId: number, listingImportId: number) {
  const db = await requireDb();
  const rows = await db
    .select()
    .from(ebayDrafts)
    .where(and(eq(ebayDrafts.userId, userId), eq(ebayDrafts.listingImportId, listingImportId)))
    .limit(1);
  return rows[0];
}

export async function createEbayDraft(input: typeof ebayDrafts.$inferInsert) {
  const db = await requireDb();
  await db.insert(ebayDrafts).values(input).onDuplicateKeyUpdate({
    set: {
      sku: input.sku,
      workflow: input.workflow,
      offerId: input.offerId,
      listingId: input.listingId,
      feedTaskId: input.feedTaskId,
      feedStatus: input.feedStatus,
      feedSuccessCount: input.feedSuccessCount,
      feedFailureCount: input.feedFailureCount,
      resultMessage: input.resultMessage,
      marketplaceId: input.marketplaceId,
      sellerHubUrl: input.sellerHubUrl,
    },
  });
}

export async function markOfferPublished(
  userId: number,
  listingImportId: number,
  input: { listingId: string; url: string },
) {
  const db = await requireDb();
  await db
    .update(ebayDrafts)
    .set({ listingId: input.listingId, sellerHubUrl: input.url })
    .where(and(
      eq(ebayDrafts.userId, userId),
      eq(ebayDrafts.listingImportId, listingImportId),
      eq(ebayDrafts.workflow, "inventory_offer"),
    ));
  return getEbayDraftForListing(userId, listingImportId);
}

export async function updateNativeDraftFeedResult(
  userId: number,
  listingImportId: number,
  input: {
    feedStatus: string;
    feedSuccessCount?: number | null;
    feedFailureCount?: number | null;
    resultMessage?: string | null;
  },
) {
  const db = await requireDb();
  await db
    .update(ebayDrafts)
    .set(input)
    .where(and(
      eq(ebayDrafts.userId, userId),
      eq(ebayDrafts.listingImportId, listingImportId),
      eq(ebayDrafts.workflow, "seller_hub_feed"),
    ));
  return getEbayDraftForListing(userId, listingImportId);
}
