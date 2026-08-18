# Sell Similar Studio — Implementation Architecture

## Product contract

Sell Similar Studio is an authenticated web application for eBay US sellers. A seller pastes a public sold-listing URL, reviews imported content, selects the photos they are authorized to reuse, and saves the result as an **unpublished eBay Inventory API offer**. The initial workflow never calls eBay’s publish endpoint.

| Area | Decision |
|---|---|
| Marketplace | `EBAY_US` only |
| Currency and language | `USD` and `en-US` |
| Draft mechanism | `PUT /sell/inventory/v1/inventory_item/{sku}` followed by `POST /sell/inventory/v1/offer`; no publish call |
| Seller authorization | eBay OAuth authorization-code flow with server-side token exchange and refresh |
| Required scopes | `sell.inventory` and `sell.account` |
| Import strategy | Official Browse API first when credentials are configured, then a guarded parser for public eBay HTML metadata |
| Status wording | User-visible terminal labels are exactly `draft created` and `failed` |
| Publication | Deliberately excluded from this version |

## Domain model

The application stores normalized imports and eBay connection metadata. Access and refresh tokens are encrypted at rest using AES-256-GCM with a key derived from the server-side session secret; raw tokens are never returned to the browser.

| Entity | Key fields | Purpose |
|---|---|---|
| `ebay_connections` | user, marketplace, encrypted tokens, expiries, scopes, account name | One US eBay authorization per application user |
| `listing_imports` | user, source URL and item ID, content, images, category, price, condition, workflow status | Editable review record and history row |
| `ebay_drafts` | import, SKU, offer ID, marketplace, API response metadata | Records the unpublished offer returned by eBay |

Item specifics and image arrays are stored as JSON text because their keys and counts vary by category. All business timestamps are stored as UTC timestamps and rendered in the viewer’s local time.

## Backend boundaries

The URL validator accepts only HTTPS URLs on recognized eBay hostnames and requires a numeric legacy item ID. The parser never fetches arbitrary user-provided hosts, follows only tightly bounded redirects that remain on eBay domains, applies request timeouts and response-size limits, and sanitizes imported HTML before persistence or display.

The import service extracts structured JSON-LD and Open Graph data first, then uses conservative page selectors as a fallback. Description HTML is converted to a safe subset. Image URLs must use HTTPS and an eBay image host. Imported content remains editable and is not treated as trusted markup.

## Draft creation sequence

| Step | Operation | Failure behavior |
|---:|---|---|
| 1 | Validate the saved review record and ownership | Return a field-specific error; no eBay calls |
| 2 | Refresh the seller token if necessary | Mark the attempt `failed` and request reconnection if revoked |
| 3 | Create or replace the inventory item with title, description, aspects, condition, quantity, and selected image URLs | Preserve the local review and store the eBay error summary |
| 4 | Create an offer with SKU, `EBAY_US`, `FIXED_PRICE`, category, price, and optional policy/location settings | Record `offerId` when successful |
| 5 | Mark history status exactly `draft created` | Never call `publishOffer` |

## Frontend experience

The interface uses a refined light workspace with warm neutral surfaces, deep ink typography, a restrained cobalt accent, subtle elevation, and compact editorial spacing. The primary navigation separates **New draft**, **Draft history**, and **eBay connection**. The review workspace keeps the editable form dominant, with a contextual readiness panel and image-selection gallery. Loading, empty, and error states are explicit and keyboard accessible.

## Configuration

Real eBay calls require a production Client ID, Client Secret, and RuName configured as server secrets. Until those values are present, the application remains usable as a complete review workspace and returns a clear configuration error rather than fabricating eBay success.
