import crypto from "node:crypto";
import { gunzipSync } from "node:zlib";
import type { EbayConnection, ListingImport } from "../drizzle/schema";
import type { ItemSpecific } from "./ebayListing";

export const EBAY_MARKETPLACE_ID = "EBAY_US" as const;
export const EBAY_CONTENT_LANGUAGE = "en-US" as const;
export const EBAY_CURRENCY = "USD" as const;
export const EBAY_NATIVE_DRAFT_FEED_TYPE = "FX_LISTING" as const;
export const EBAY_NATIVE_DRAFT_SCHEMA_VERSION = "1.0" as const;
export const EBAY_SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
  "https://api.ebay.com/oauth/api_scope/commerce.identity.readonly",
] as const;

/**
 * eBay may omit `scope` from an authorization-code token response even when it
 * grants the requested permissions. Persist the explicit requested set in that
 * case so a successful token exchange cannot fail after encryption.
 */
export function resolveGrantedScopes(scope?: string) {
  return scope?.trim() || EBAY_SCOPES.join(" ");
}

export type EbayEnvironment = "sandbox" | "production";

type EbayConfig = {
  clientId: string;
  clientSecret: string;
  redirectUriName: string;
  encryptionKey: string;
  jwtSecret: string;
  environment: EbayEnvironment;
};

export type EbayPolicy = { id: string; name: string };
export type EbayLocation = {
  merchantLocationKey: string;
  name: string;
  city?: string;
  stateOrProvince?: string;
  country?: string;
};
export type EbayWarehouseLocationInput = {
  city: string;
  stateOrProvince: string;
  country: string;
};

type EbayInventoryLocationResponse = {
  merchantLocationKey: string;
  name?: string;
  merchantLocationStatus?: string;
  locationTypes?: string[];
  location?: {
    address?: {
      city?: string;
      stateOrProvince?: string;
      country?: string;
    };
  };
};

export function isEbayConfigured() {
  return Boolean(
    process.env.EBAY_CLIENT_ID &&
    process.env.EBAY_CLIENT_SECRET &&
    process.env.EBAY_REDIRECT_URI_NAME &&
    process.env.EBAY_TOKEN_ENCRYPTION_KEY &&
    process.env.JWT_SECRET,
  );
}

function getConfig(): EbayConfig {
  const required = {
    clientId: process.env.EBAY_CLIENT_ID,
    clientSecret: process.env.EBAY_CLIENT_SECRET,
    redirectUriName: process.env.EBAY_REDIRECT_URI_NAME,
    encryptionKey: process.env.EBAY_TOKEN_ENCRYPTION_KEY,
    jwtSecret: process.env.JWT_SECRET,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  if (missing.length) throw new Error(`eBay integration is not configured (${missing.join(", ")})`);
  return {
    clientId: required.clientId!,
    clientSecret: required.clientSecret!,
    redirectUriName: required.redirectUriName!,
    encryptionKey: required.encryptionKey!,
    jwtSecret: required.jwtSecret!,
    environment: process.env.EBAY_ENVIRONMENT === "sandbox" ? "sandbox" : "production",
  };
}

export function ebayEndpoints(environment: EbayEnvironment) {
  const sandbox = environment === "sandbox";
  return {
    authorization: sandbox ? "https://auth.sandbox.ebay.com/oauth2/authorize" : "https://auth.ebay.com/oauth2/authorize",
    api: sandbox ? "https://api.sandbox.ebay.com" : "https://api.ebay.com",
    commerceIdentity: sandbox ? "https://apiz.sandbox.ebay.com" : "https://apiz.ebay.com",
  };
}

function b64url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

export function createOAuthState(userId: number, now = Date.now()) {
  const config = getConfig();
  const payload = b64url(JSON.stringify({ userId, exp: now + 10 * 60 * 1000, nonce: crypto.randomBytes(12).toString("hex") }));
  return `${payload}.${sign(payload, config.jwtSecret)}`;
}

export function verifyOAuthState(state: string, expectedUserId: number, now = Date.now()) {
  const config = getConfig();
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid eBay authorization state");
  const expected = sign(payload, config.jwtSecret);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new Error("Invalid eBay authorization state");
  }
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { userId: number; exp: number };
  if (data.userId !== expectedUserId || !Number.isFinite(data.exp) || data.exp < now) {
    throw new Error("Expired or mismatched eBay authorization state");
  }
  return data;
}

export function buildAuthorizationUrl(userId: number) {
  const config = getConfig();
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUriName,
    response_type: "code",
    scope: resolveGrantedScopes(),
    state: createOAuthState(userId),
    // Avoid a silent cached-session return; the seller should see eBay's sign-in or consent flow.
    prompt: "login",
    locale: "en-US",
  });
  return `${ebayEndpoints(config.environment).authorization}?${params.toString()}`;
}

function encryptionKey(secret: string) {
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptToken(token: string) {
  const config = getConfig();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(config.encryptionKey), iv);
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptToken(encrypted: string) {
  const config = getConfig();
  const [ivValue, tagValue, ciphertextValue] = encrypted.split(".");
  if (!ivValue || !tagValue || !ciphertextValue) throw new Error("Stored eBay token is invalid");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(config.encryptionKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]).toString("utf8");
}

async function ebayRequest<T>(url: string, init: RequestInit, timeoutMs = 15_000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try { body = JSON.parse(text); } catch { body = text; }
    }
    if (!response.ok) {
      const errors = typeof body === "object" && body && "errors" in body ? (body as { errors?: Array<{ message?: string; longMessage?: string }> }).errors : undefined;
      const message = errors?.[0]?.longMessage || errors?.[0]?.message || `eBay request failed (${response.status})`;
      throw new Error(message);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function exchangeToken(parameters: URLSearchParams) {
  const config = getConfig();
  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64");
  return ebayRequest<{
    access_token: string;
    expires_in: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
    scope?: string;
  }>(`${ebayEndpoints(config.environment).api}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: parameters.toString(),
  });
}

export async function exchangeAuthorizationCode(code: string) {
  const config = getConfig();
  return exchangeToken(new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUriName,
  }));
}

export async function refreshAccessToken(refreshToken: string) {
  return exchangeToken(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: resolveGrantedScopes(),
  }));
}

export async function getUsableAccessToken(connection: EbayConnection, onRefresh: (encrypted: string, expiresAt: Date) => Promise<void>) {
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return decryptToken(connection.accessTokenEncrypted);
  const refreshed = await refreshAccessToken(decryptToken(connection.refreshTokenEncrypted));
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  const encrypted = encryptToken(refreshed.access_token);
  await onRefresh(encrypted, expiresAt);
  return refreshed.access_token;
}

function apiHeaders(accessToken: string, contentType = false) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Accept-Language": EBAY_CONTENT_LANGUAGE,
    "Content-Language": EBAY_CONTENT_LANGUAGE,
    "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
    ...(contentType ? { "Content-Type": "application/json" } : {}),
  };
}

export async function fetchSellerIdentity(accessToken: string) {
  const config = getConfig();
  const identity = await ebayRequest<{ userId?: string; username?: string }>(
    `${ebayEndpoints(config.environment).commerceIdentity}/commerce/identity/v1/user`,
    { headers: apiHeaders(accessToken) },
  );
  if (!identity.userId) {
    throw new Error("eBay did not return the immutable seller account identifier");
  }
  return { userId: identity.userId, username: identity.username };
}

function normalizeLocationPart(value?: string) {
  return value?.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US") ?? "";
}

function mapInventoryLocation(item: EbayInventoryLocationResponse): EbayLocation {
  const address = item.location?.address;
  return {
    merchantLocationKey: item.merchantLocationKey,
    name: item.name?.trim() || [address?.city, address?.stateOrProvince].filter(Boolean).join(", ") || item.merchantLocationKey,
    city: address?.city?.trim() || undefined,
    stateOrProvince: address?.stateOrProvince?.trim() || undefined,
    country: address?.country?.trim().toUpperCase() || undefined,
  };
}

function hasSameWarehouseAddress(location: EbayLocation, input: EbayWarehouseLocationInput) {
  return (
    normalizeLocationPart(location.city) === normalizeLocationPart(input.city) &&
    normalizeLocationPart(location.stateOrProvince) === normalizeLocationPart(input.stateOrProvince) &&
    normalizeLocationPart(location.country) === normalizeLocationPart(input.country)
  );
}

export function buildWarehouseLocationKey(input: EbayWarehouseLocationInput) {
  const normalized = [input.country, input.stateOrProvince, input.city]
    .map(value => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .filter(Boolean)
    .join("-");
  return `SSS-${normalized}`.slice(0, 50);
}

async function fetchInventoryLocations(accessToken: string) {
  const config = getConfig();
  const result = await ebayRequest<{ locations?: EbayInventoryLocationResponse[] }>(
    `${ebayEndpoints(config.environment).api}/sell/inventory/v1/location?limit=100`,
    { headers: apiHeaders(accessToken) },
  );
  return (result.locations ?? []).map(mapInventoryLocation);
}

export async function createOrReuseWarehouseLocation(accessToken: string, input: EbayWarehouseLocationInput) {
  const normalizedInput = {
    city: input.city.trim(),
    stateOrProvince: input.stateOrProvince.trim(),
    country: input.country.trim().toUpperCase(),
  };
  const locations = await fetchInventoryLocations(accessToken);
  const existingLocation = locations.find(location => hasSameWarehouseAddress(location, normalizedInput));
  if (existingLocation) return { location: existingLocation, created: false as const };

  const merchantLocationKey = buildWarehouseLocationKey(normalizedInput);
  if (locations.some(location => location.merchantLocationKey === merchantLocationKey)) {
    throw new Error("A different eBay inventory location already uses this location key. Please use the existing location or choose a distinct city and state.");
  }

  const config = getConfig();
  const name = `${normalizedInput.city}, ${normalizedInput.stateOrProvince}`;
  await ebayRequest<void>(
    `${ebayEndpoints(config.environment).api}/sell/inventory/v1/location/${encodeURIComponent(merchantLocationKey)}`,
    {
      method: "POST",
      headers: apiHeaders(accessToken, true),
      body: JSON.stringify({
        name,
        locationTypes: ["WAREHOUSE"],
        merchantLocationStatus: "ENABLED",
        location: {
          address: normalizedInput,
        },
      }),
    },
  );

  return {
    location: {
      merchantLocationKey,
      name,
      ...normalizedInput,
    },
    created: true as const,
  };
}

export async function fetchSellerSetup(accessToken: string) {
  const config = getConfig();
  const base = ebayEndpoints(config.environment).api;
  const [fulfillment, payment, returns, locations] = await Promise.all([
    ebayRequest<{ fulfillmentPolicies?: Array<{ fulfillmentPolicyId: string; name: string }> }>(`${base}/sell/account/v1/fulfillment_policy?marketplace_id=${EBAY_MARKETPLACE_ID}`, { headers: apiHeaders(accessToken) }),
    ebayRequest<{ paymentPolicies?: Array<{ paymentPolicyId: string; name: string }> }>(`${base}/sell/account/v1/payment_policy?marketplace_id=${EBAY_MARKETPLACE_ID}`, { headers: apiHeaders(accessToken) }),
    ebayRequest<{ returnPolicies?: Array<{ returnPolicyId: string; name: string }> }>(`${base}/sell/account/v1/return_policy?marketplace_id=${EBAY_MARKETPLACE_ID}`, { headers: apiHeaders(accessToken) }),
    fetchInventoryLocations(accessToken),
  ]);
  return {
    fulfillmentPolicies: (fulfillment.fulfillmentPolicies ?? []).map(item => ({ id: item.fulfillmentPolicyId, name: item.name })),
    paymentPolicies: (payment.paymentPolicies ?? []).map(item => ({ id: item.paymentPolicyId, name: item.name })),
    returnPolicies: (returns.returnPolicies ?? []).map(item => ({ id: item.returnPolicyId, name: item.name })),
    locations,
  };
}

export function mapInventoryCondition(conditionId?: string | null, conditionName?: string | null) {
  const id = Number(conditionId);
  if (id === 1000) return "NEW";
  if (id === 1500) return "NEW_OTHER";
  if (id === 1750) return "NEW_WITH_DEFECTS";
  if (id === 2000) return "CERTIFIED_REFURBISHED";
  if (id === 2010 || id === 2020) return "EXCELLENT_REFURBISHED";
  if (id === 2030) return "VERY_GOOD_REFURBISHED";
  if (id === 2500) return "SELLER_REFURBISHED";
  if ([2750, 3000, 4000, 5000, 6000, 7000].includes(id)) return "USED_GOOD";
  const normalized = conditionName?.toLowerCase() ?? "";
  if (normalized.includes("new")) return "NEW";
  if (normalized.includes("refurbished")) return "SELLER_REFURBISHED";
  if (normalized.includes("used") || normalized.includes("pre-owned")) return "USED_GOOD";
  throw new Error("Choose a supported item condition before creating the draft");
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

export function buildDraftPayloads(listing: ListingImport, connection: EbayConnection, sku: string, publicOrigin: string) {
  if (!listing.categoryId) throw new Error("A category is required before creating the draft");
  if (!listing.price || Number(listing.price) <= 0) throw new Error("A valid USD price is required before creating the draft");
  if (!connection.fulfillmentPolicyId || !connection.paymentPolicyId || !connection.returnPolicyId || !connection.merchantLocationKey) {
    throw new Error("Choose your eBay policies and inventory location before creating the draft");
  }
  const images = sellerOwnedPhotoUrlsForNativeDraft(listing.ownedImageUrls, publicOrigin);
  const specifics = parseJson<ItemSpecific[]>(listing.itemSpecifics, []);
  const aspects = Object.fromEntries(specifics.filter(item => item.name && item.value).map(item => [item.name, [item.value]]));
  return {
    inventoryItem: {
      availability: { shipToLocationAvailability: { quantity: listing.quantity } },
      condition: mapInventoryCondition(listing.conditionId, listing.conditionName),
      product: { title: listing.title, description: listing.description, imageUrls: images, aspects },
    },
    offer: {
      sku,
      marketplaceId: EBAY_MARKETPLACE_ID,
      format: "FIXED_PRICE",
      availableQuantity: listing.quantity,
      categoryId: listing.categoryId,
      listingDescription: listing.description,
      listingPolicies: {
        fulfillmentPolicyId: connection.fulfillmentPolicyId,
        paymentPolicyId: connection.paymentPolicyId,
        returnPolicyId: connection.returnPolicyId,
      },
      merchantLocationKey: connection.merchantLocationKey,
      pricingSummary: { price: { currency: EBAY_CURRENCY, value: Number(listing.price).toFixed(2) } },
    },
  };
}

export function isExpectedEmptyOfferLookupError(error: unknown) {
  const message = error instanceof Error ? error.message.trim() : "";
  return /^this offer is not available\.?$/i.test(message);
}

export async function createUnpublishedOffer(accessToken: string, sku: string, payloads: ReturnType<typeof buildDraftPayloads>) {
  const config = getConfig();
  const base = `${ebayEndpoints(config.environment).api}/sell/inventory/v1`;
  await ebayRequest<void>(`${base}/inventory_item/${encodeURIComponent(sku)}`, {
    method: "PUT",
    headers: apiHeaders(accessToken, true),
    body: JSON.stringify(payloads.inventoryItem),
  });
  let existing: { offers?: Array<{ offerId: string; status?: string }> };
  try {
    existing = await ebayRequest<{ offers?: Array<{ offerId: string; status?: string }> }>(
      `${base}/offer?sku=${encodeURIComponent(sku)}&marketplace_id=${EBAY_MARKETPLACE_ID}&format=FIXED_PRICE`,
      { headers: apiHeaders(accessToken) },
    );
  } catch (error) {
    // eBay can return this exact error instead of an empty offer list for a new SKU.
    // Only this documented, expected lookup state may continue to the create-offer call.
    if (!isExpectedEmptyOfferLookupError(error)) throw error;
    existing = { offers: [] };
  }
  const unpublished = existing.offers?.find(offer => offer.status !== "PUBLISHED");
  if (unpublished?.offerId) return unpublished.offerId;
  const created = await ebayRequest<{ offerId: string }>(`${base}/offer`, {
    method: "POST",
    headers: apiHeaders(accessToken, true),
    body: JSON.stringify(payloads.offer),
  });
  if (!created.offerId) throw new Error("eBay did not return an offer ID");
  return created.offerId;
}

export function sellerHubDraftUrl(sku: string) {
  return `https://www.ebay.com/sh/lst/drafts?keyword=${encodeURIComponent(sku)}`;
}

export type NativeSellerHubDraftTask = {
  taskId: string;
  status: string;
  successCount?: number;
  failureCount?: number;
};

const NATIVE_DRAFT_BASE_HEADERS = [
  "Action",
  "Custom label (SKU)",
  "Category ID",
  "Title",
  "Condition ID",
  "Item photo URL",
  "Description",
  "Format",
  "Quantity",
  "Start price",
] as const;

function nativeDraftCsvValue(value: unknown) {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ");
  return /[",\r\n]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

function nativeDraftHeader(value: string) {
  return value.replace(/[\r\n,\"]/g, " ").trim().slice(0, 80);
}

function parseNativeDraftJson<T>(value: string, fallback: T): T {
  return parseJson(value, fallback);
}

function sellerOwnedPhotoUrlsForNativeDraft(value: string, publicOrigin?: string) {
  const relativeUrls = Array.from(new Set(
    parseNativeDraftJson<string[]>(value, [])
      .filter(url => typeof url === "string" && url.startsWith("/manus-storage/"))
      .map(url => url.trim()),
  )).slice(0, 12);

  // eBay's `Draft` template explicitly permits an empty Item photo URL field.
  // Do not substitute imported source-image URLs when the seller plans to add photos in eBay later.
  if (!relativeUrls.length) return [];

  if (!publicOrigin) {
    throw new Error("A valid public app URL is required to include seller-uploaded photos in an eBay draft");
  }

  let origin: URL;
  try {
    origin = new URL(publicOrigin);
  } catch {
    throw new Error("A valid public app URL is required to include seller-uploaded photos in an eBay draft");
  }
  if (origin.protocol !== "https:") {
    throw new Error("A secure public app URL is required to include seller-uploaded photos in an eBay draft");
  }

  return relativeUrls.map(url => new URL(url, origin).toString());
}

/**
 * Builds the documented Seller Hub Reports row for `Action=Draft`.
 * This only creates an eBay-native draft after the Feed API task completes; it never calls a publication endpoint.
 */
export function buildNativeSellerHubDraftCsv(listing: ListingImport, sku: string, publicOrigin?: string) {
  if (!listing.categoryId) throw new Error("A category is required before creating a Seller Hub draft");
  if (!listing.title.trim()) throw new Error("A title is required before creating a Seller Hub draft");
  if (!listing.price || !Number.isFinite(Number(listing.price)) || Number(listing.price) <= 0) {
    throw new Error("A valid USD price is required before creating a Seller Hub draft");
  }
  if (!Number.isInteger(listing.quantity) || listing.quantity < 1) {
    throw new Error("A quantity of at least one is required before creating a Seller Hub draft");
  }

  const imageUrls = sellerOwnedPhotoUrlsForNativeDraft(listing.ownedImageUrls, publicOrigin);
  const specifics = parseNativeDraftJson<ItemSpecific[]>(listing.itemSpecifics, [])
    .map(item => ({ name: nativeDraftHeader(item.name), value: String(item.value ?? "").trim() }))
    .filter(item => item.name && item.value);
  const specificHeaders = Array.from(new Set(specifics.map(item => `C:${item.name}`)));
  const valuesBySpecificHeader = new Map(specifics.map(item => [`C:${item.name}`, item.value]));
  const headers = [...NATIVE_DRAFT_BASE_HEADERS, ...specificHeaders];
  const row: Record<string, string | number> = {
    Action: "Draft",
    "Custom label (SKU)": sku,
    "Category ID": listing.categoryId,
    Title: listing.title.trim().slice(0, 80),
    "Condition ID": listing.conditionId?.trim() || "",
    "Item photo URL": imageUrls.join("|"),
    Description: listing.description.trim(),
    Format: "FixedPrice",
    Quantity: listing.quantity,
    "Start price": Number(listing.price).toFixed(2),
  };
  for (const header of specificHeaders) row[header] = valuesBySpecificHeader.get(header) ?? "";

  return `${headers.map(nativeDraftCsvValue).join(",")}\n${headers.map(header => nativeDraftCsvValue(row[header])).join(",")}\n`;
}

function nativeDraftFeedHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Accept-Language": EBAY_CONTENT_LANGUAGE,
    "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE_ID,
  };
}

async function ebayFeedResponse(url: string, init: RequestInit, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const text = await response.text();
      let message = `eBay Feed API request failed (${response.status})`;
      try {
        const parsed = JSON.parse(text) as { errors?: Array<{ longMessage?: string; message?: string }> };
        message = parsed.errors?.[0]?.longMessage || parsed.errors?.[0]?.message || message;
      } catch {
        // Keep the status-only fallback when the provider returns an unexpected response body.
      }
      throw new Error(message);
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

function taskIdFromLocation(location: string | null) {
  const taskId = location?.split("/").filter(Boolean).at(-1);
  if (!taskId) throw new Error("eBay did not return a Feed API task ID");
  return taskId;
}

/**
 * Starts and uploads a native Seller Hub `Draft` feed. It intentionally returns only an asynchronous task ID;
 * callers must inspect the task before claiming the Seller Hub draft was created.
 */
export async function submitNativeSellerHubDraft(
  accessToken: string,
  listing: ListingImport,
  sku: string,
  publicOrigin?: string,
) {
  // Build and validate before creating a remote task so an invalid listing cannot leave an empty Feed API task behind.
  const csv = buildNativeSellerHubDraftCsv(listing, sku, publicOrigin);
  const base = `${ebayEndpoints(getConfig().environment).api}/sell/feed/v1`;
  const taskResponse = await ebayFeedResponse(`${base}/task`, {
    method: "POST",
    headers: { ...nativeDraftFeedHeaders(accessToken), "Content-Type": "application/json" },
    body: JSON.stringify({
      feedType: EBAY_NATIVE_DRAFT_FEED_TYPE,
      schemaVersion: EBAY_NATIVE_DRAFT_SCHEMA_VERSION,
    }),
  });
  const taskId = taskIdFromLocation(taskResponse.headers.get("location"));
  const file = new FormData();
  file.append("file", new Blob([csv], { type: "text/csv;charset=utf-8" }), `${sku}.csv`);
  await ebayFeedResponse(`${base}/task/${encodeURIComponent(taskId)}/upload_file`, {
    method: "POST",
    headers: nativeDraftFeedHeaders(accessToken),
    body: file,
  });
  return { taskId, status: "QUEUED" } satisfies NativeSellerHubDraftTask;
}

/** Retrieves the server-side status of an existing Seller Hub feed task; it has no listing side effect. */
export async function getNativeSellerHubDraftTask(accessToken: string, taskId: string): Promise<NativeSellerHubDraftTask> {
  const base = `${ebayEndpoints(getConfig().environment).api}/sell/feed/v1`;
  const task = await ebayRequest<{
    taskId?: string;
    status?: string;
    uploadSummary?: { successCount?: number; failureCount?: number };
  }>(`${base}/task/${encodeURIComponent(taskId)}`, { headers: nativeDraftFeedHeaders(accessToken) });
  return {
    taskId: task.taskId || taskId,
    status: task.status || "UNKNOWN",
    successCount: task.uploadSummary?.successCount,
    failureCount: task.uploadSummary?.failureCount,
  };
}

function decodeFeedResultText(bytes: Uint8Array, fileName: string | null) {
  const isGzip = fileName?.toLowerCase().endsWith(".gz") || (bytes[0] === 0x1f && bytes[1] === 0x8b);
  return (isGzip ? gunzipSync(bytes) : Buffer.from(bytes)).toString("utf8");
}

function decodeXmlText(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractFeedFailureDetail(resultFile: string) {
  const valueFor = (tag: "LongMessage" | "ShortMessage" | "ErrorCode") =>
    resultFile.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))?.[1];
  const message = decodeXmlText(valueFor("LongMessage") || valueFor("ShortMessage") || "");
  const code = decodeXmlText(valueFor("ErrorCode") || "");
  if (!message) return undefined;
  const safeMessage = message.slice(0, 360);
  return code ? `eBay error ${code}: ${safeMessage}` : safeMessage;
}

/**
 * Retrieves and parses the completed result file for an existing Seller Hub task.
 * This is a read-only diagnostic call; it never creates, uploads, retries, or publishes a listing.
 */
export async function getNativeSellerHubDraftFailureDetail(accessToken: string, taskId: string) {
  const base = `${ebayEndpoints(getConfig().environment).api}/sell/feed/v1`;
  const response = await ebayFeedResponse(`${base}/task/${encodeURIComponent(taskId)}/download_result_file`, {
    headers: nativeDraftFeedHeaders(accessToken),
  });
  const disposition = response.headers.get("content-disposition");
  const fileName = disposition?.match(/filename="?([^";]+)"?/i)?.[1] ?? null;
  const text = decodeFeedResultText(new Uint8Array(await response.arrayBuffer()), fileName);
  return extractFeedFailureDetail(text);
}
