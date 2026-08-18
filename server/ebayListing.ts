import * as cheerio from "cheerio";
import sanitizeHtml from "sanitize-html";

const EBAY_MARKETPLACE = "EBAY_US";
const EBAY_HOSTS = new Set(["ebay.com", "www.ebay.com", "m.ebay.com"]);
const EBAY_IMAGE_HOST = /(^|\.)ebayimg\.com$/i;
const MAX_HTML_BYTES = 3_000_000;
const FETCH_TIMEOUT_MS = 10_000;

export type ItemSpecific = { name: string; value: string };

export type ImportedListing = {
  sourceUrl: string;
  sourceItemId: string;
  title: string;
  description: string;
  itemSpecifics: ItemSpecific[];
  imageUrls: string[];
  conditionId?: string;
  conditionName?: string;
  price?: string;
  currency: "USD";
  categoryId?: string;
  categoryName?: string;
  importMethod: "browse_api" | "html";
  warnings: string[];
};

export class ListingImportError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "UNSUPPORTED_URL"
      | "FETCH_FAILED"
      | "FETCH_BLOCKED"
      | "LISTING_NOT_FOUND"
      | "PARSE_FAILED"
      | "CONTENT_TOO_LARGE",
  ) {
    super(message);
  }
}

export function parseEbayListingUrl(rawUrl: string) {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new ListingImportError("Enter a complete eBay listing URL.", "UNSUPPORTED_URL");
  }

  if (url.protocol !== "https:" || !EBAY_HOSTS.has(url.hostname.toLowerCase())) {
    throw new ListingImportError(
      "Only secure eBay US listing links from ebay.com are supported.",
      "UNSUPPORTED_URL",
    );
  }

  const pathMatch = url.pathname.match(/\/itm\/(?:[^/?#]+\/)?(\d{9,15})(?:[/?#]|$)/i);
  const queryMatch = url.searchParams.get("item")?.match(/^\d{9,15}$/)?.[0];
  const itemId = pathMatch?.[1] ?? queryMatch;
  if (!itemId) {
    throw new ListingImportError(
      "This does not look like an eBay item page. Paste a link containing the numeric item ID.",
      "UNSUPPORTED_URL",
    );
  }

  return {
    itemId,
    normalizedUrl: `https://www.ebay.com/itm/${itemId}`,
  };
}

function cleanText(value: unknown, maxLength = 5000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function sanitizeDescription(value: unknown) {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value, {
    allowedTags: ["p", "br", "ul", "ol", "li", "strong", "em", "b", "i", "h2", "h3", "blockquote"],
    allowedAttributes: {},
    disallowedTagsMode: "discard",
  }).trim().slice(0, 50_000);
}

function isAllowedImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && EBAY_IMAGE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

function uniqueImages(values: unknown[]) {
  return Array.from(new Set(values.filter(isAllowedImageUrl))).slice(0, 24);
}

async function getApplicationToken() {
  const clientId = process.env.EBAY_CLIENT_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const response = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;
  const token = (await response.json()) as { access_token?: string };
  return token.access_token ?? null;
}

async function importFromBrowseApi(sourceUrl: string, itemId: string): Promise<ImportedListing | null> {
  const token = await getApplicationToken();
  if (!token) return null;

  const endpoint = new URL("https://api.ebay.com/buy/browse/v1/item/get_item_by_legacy_id");
  endpoint.searchParams.set("legacy_item_id", itemId);

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": EBAY_MARKETPLACE,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const item = (await response.json()) as Record<string, any>;
  const itemSpecifics = Array.isArray(item.localizedAspects)
    ? item.localizedAspects
        .map((aspect: any) => ({ name: cleanText(aspect?.name, 80), value: cleanText(aspect?.value, 300) }))
        .filter((aspect: ItemSpecific) => aspect.name && aspect.value)
        .slice(0, 80)
    : [];
  const imageUrls = uniqueImages([
    item.image?.imageUrl,
    ...(Array.isArray(item.additionalImages) ? item.additionalImages.map((image: any) => image?.imageUrl) : []),
  ]);

  const title = cleanText(item.title, 80);
  if (!title) return null;

  const warnings: string[] = [
    "The source listing's photos and description are reference only and will not be submitted. Add your own photos and write or generate your own description.",
  ];
  if (!imageUrls.length) warnings.push("No source photos were available for reference.");

  return {
    sourceUrl,
    sourceItemId: itemId,
    title,
    // Do not copy third-party listing description text into a new seller draft.
    description: "",
    itemSpecifics,
    imageUrls,
    conditionId: cleanText(item.conditionId, 32) || undefined,
    conditionName: cleanText(item.condition, 120) || undefined,
    price: cleanText(item.price?.value, 32) || undefined,
    currency: "USD",
    categoryId: cleanText(item.categoryId, 32) || undefined,
    categoryName: cleanText(item.categoryPath, 255) || undefined,
    importMethod: "browse_api",
    warnings,
  };
}

async function fetchEbayHtml(startUrl: string) {
  let currentUrl = new URL(startUrl);
  for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
    if (currentUrl.protocol !== "https:" || !EBAY_HOSTS.has(currentUrl.hostname.toLowerCase())) {
      throw new ListingImportError("eBay redirected to an unsupported location.", "FETCH_FAILED");
    }

    const response = await fetch(currentUrl, {
      redirect: "manual",
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; SellSimilarStudio/1.0; +https://www.ebay.com)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new ListingImportError("eBay returned an invalid redirect.", "FETCH_FAILED");
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (response.status === 403) {
      throw new ListingImportError(
        "eBay blocked public retrieval for this listing. Complete Production API setup in eBay account, then try again.",
        "FETCH_BLOCKED",
      );
    }
    if (response.status === 404) {
      throw new ListingImportError("That eBay listing could not be found.", "LISTING_NOT_FOUND");
    }
    if (!response.ok) {
      throw new ListingImportError("eBay did not return the listing page. Try again shortly.", "FETCH_FAILED");
    }

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > MAX_HTML_BYTES) {
      throw new ListingImportError("The listing page is too large to import safely.", "CONTENT_TOO_LARGE");
    }

    const reader = response.body?.getReader();
    if (!reader) throw new ListingImportError("The listing page was empty.", "FETCH_FAILED");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) {
        reader.cancel();
        throw new ListingImportError("The listing page is too large to import safely.", "CONTENT_TOO_LARGE");
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }
  throw new ListingImportError("The eBay listing redirected too many times.", "FETCH_FAILED");
}

function findProductJson(value: unknown): Record<string, any> | null {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProductJson(entry);
      if (found) return found;
    }
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, any>;
    const type = record["@type"];
    if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) return record;
    if (Array.isArray(record["@graph"])) return findProductJson(record["@graph"]);
  }
  return null;
}

export function parseListingHtml(html: string, sourceUrl: string, itemId: string): ImportedListing {
  const $ = cheerio.load(html);
  let product: Record<string, any> | null = null;
  $('script[type="application/ld+json"]').each((_, element) => {
    if (product) return;
    try {
      product = findProductJson(JSON.parse($(element).text()));
    } catch {
      // Ignore malformed third-party JSON-LD blocks.
    }
  });

  const productData = product as Record<string, any> | null;
  const title = cleanText(
    productData?.name ?? $('meta[property="og:title"]').attr("content") ?? $("h1").first().text(),
    80,
  );
  if (!title) {
    throw new ListingImportError("The listing loaded, but its title could not be extracted.", "PARSE_FAILED");
  }

  const productImages = Array.isArray(productData?.image) ? productData.image : [productData?.image];
  const domImages: unknown[] = [];
  $('img').each((_, image) => {
    domImages.push($(image).attr("data-zoom-src"), $(image).attr("data-src"), $(image).attr("src"));
  });
  const imageUrls = uniqueImages([
    ...productImages,
    $('meta[property="og:image"]').attr("content"),
    ...domImages,
  ]);

  const itemSpecifics: ItemSpecific[] = [];
  $(".ux-labels-values").each((_, row) => {
    const name = cleanText($(row).find(".ux-labels-values__labels-content").first().text(), 80).replace(/:$/, "");
    const value = cleanText($(row).find(".ux-labels-values__values-content").first().text(), 300);
    if (name && value && !/condition|price|quantity/i.test(name)) itemSpecifics.push({ name, value });
  });

  const offer = Array.isArray(productData?.offers) ? productData.offers[0] : productData?.offers;
  const conditionName = cleanText(
    productData?.itemCondition?.name ?? $('[data-testid="x-item-condition-text"]').text(),
    120,
  );
  const rawDescription = productData?.description ?? $('meta[name="description"]').attr("content") ?? "";
  const warnings: string[] = [
    "Imported from the public listing page because the official item endpoint was unavailable.",
    "The source listing's photos and description are reference only and will not be submitted. Add your own photos and write or generate your own description.",
  ];
  if (!rawDescription) warnings.push("No source description was available for reference.");
  if (!imageUrls.length) warnings.push("No source photos were available for reference.");

  return {
    sourceUrl,
    sourceItemId: itemId,
    title,
    // Do not copy third-party listing description text into a new seller draft.
    description: "",
    itemSpecifics: itemSpecifics.slice(0, 80),
    imageUrls,
    conditionName: conditionName || undefined,
    price: cleanText(offer?.price ?? $('[itemprop="price"]').attr("content"), 32) || undefined,
    currency: "USD",
    categoryId: undefined,
    categoryName: undefined,
    importMethod: "html",
    warnings,
  };
}

export async function importEbayListing(rawUrl: string): Promise<ImportedListing> {
  const { itemId, normalizedUrl } = parseEbayListingUrl(rawUrl);
  try {
    const apiResult = await importFromBrowseApi(normalizedUrl, itemId);
    if (apiResult) return apiResult;
  } catch {
    // The bounded public-page fallback is reference-only; it does not copy photos or descriptions into a draft.
  }

  try {
    const html = await fetchEbayHtml(normalizedUrl);
    return parseListingHtml(html, normalizedUrl, itemId);
  } catch (error) {
    if (error instanceof ListingImportError) throw error;
    throw new ListingImportError("The listing could not be imported from eBay.", "FETCH_FAILED");
  }
}
