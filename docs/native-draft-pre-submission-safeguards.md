# Native Seller Hub Draft Pre-Submission Safeguards

**Status:** Verified for the application’s current draft-first workflow on 2026-07-30.  
**Scope:** This record applies before any real eBay submission. It documents the implemented workflow boundaries and the seller actions that remain necessary in Seller Hub or the eBay mobile app.

## Decision

Sell Similar Studio creates a **native Seller Hub draft**, not a published listing. The native workflow uses the eBay Sell Feed API’s `FX_LISTING` feed type and a row whose action is `Draft`. eBay documents that this feed type can create new drafts, and that feed processing is asynchronous; a task identifier alone is not evidence that a draft was created. [1] [2]

A seller may create a **photo-pending draft** from the desktop review workspace when the Seller Hub draft template permits a blank `Item photo URL` field. The seller can then add photos of the actual item through eBay on a phone before activating the listing. The application must never substitute imported source photos when that field is blank. [3]

> A photo-pending draft is a workflow convenience, not a photo-policy exception. Before publication, an actual eBay listing needs at least one compliant image that accurately represents the item offered. [4]

| Safeguard | Application behavior | Seller responsibility before publication |
|---|---|---|
| **No automatic publication** | The generated CSV uses `Action: Draft`; the server does not call an eBay publication endpoint. | Review the resulting Seller Hub draft and choose whether to activate it. |
| **Asynchronous confirmation** | The server records the feed task and waits for eBay processing/result status before claiming a draft exists. | Resolve row-level eBay errors shown in the draft or feed result. |
| **Reference-only source media** | Imported listing photos and descriptions remain reference material and are excluded from the native feed payload. | Do not manually copy source photos or text unless you have permission or eBay catalog rights apply. |
| **Photo-pending mobile handoff** | With no seller upload, the CSV leaves `Item photo URL` blank rather than inserting a source URL. | Add at least one compliant photo of the actual item in eBay before publishing. |
| **Seller-upload path** | When seller uploads are included, the feed accepts only `manus-storage` seller-upload URLs over a public HTTPS origin. | Confirm ownership or authorization for every uploaded image. |
| **Accuracy confirmation** | The server requires confirmation that the listing accurately represents the seller’s actual item before draft submission. | Verify title, condition, price, quantity, specifics, policies, and category against the real item. |
| **Photo-rights confirmation** | The server requires photo-rights attestation only when seller-uploaded photos are sent with the draft; photo changes reset attestation state. | Confirm that each uploaded image is owned or authorized and does not infringe third-party rights. |

## Content and Image Rules

eBay permits images, videos, and text only when their use is truthful, accurate, non-infringing, and otherwise policy-compliant. Public availability does not itself authorize copying images from another website. eBay distinguishes permitted eBay product-catalog content from arbitrary source-listing content. [5]

For actual listings, eBay’s seller guidance requires at least one image and requires images to show the item actually offered. It prohibits placeholder images, stock photos for pre-owned items, added text or marketing artwork, and watermarks. It also recommends showing material condition and flaws clearly. [4]

| Do | Do not |
|---|---|
| Use the source listing for research, pricing context, category clues, and condition review. | Send imported marketplace photo URLs to eBay through the feed. |
| Photograph the actual item, including material flaws and relevant angles. | Use a placeholder image to activate a listing. |
| Use seller-owned/authorized photos or permitted eBay catalog content where appropriate. | Copy publicly visible third-party images or text merely because it is online. |
| Use photo-pending drafts to finish photographs from the eBay mobile app. | Treat draft creation or a queued feed task as proof the listing is ready or published. |

## Required Seller Review Before a Real Draft

The seller should verify the following fields against the physical item before choosing **Create Seller Hub Draft**:

1. The editable title, condition, description, item specifics, price, quantity, category, shipping/payment/return policy references, and inventory location are accurate for the seller’s actual item.
2. The draft contains no copied source photos or source description content that the seller is not authorized to use.
3. If photos are included from the app, the seller has affirmed image rights and item accuracy. If the draft is photo-pending, the seller understands that compliant actual-item photos must be added in eBay before activation.
4. The seller understands that creation uses an asynchronous eBay feed task; the application should show a result only after eBay has processed the task, and any eBay row-level issue must be corrected before relying on the draft.

## Implementation Boundary

The workflow is intentionally **draft-first**. It is designed to reduce desktop-to-mobile friction while keeping source marketplace content reference-only and preserving the seller’s editorial and legal responsibility. It does not infer image rights, create a live listing, or bypass eBay’s final photo and content requirements.

This document records product safeguards and operational boundaries; it is not legal advice. Sellers remain responsible for the content submitted under their eBay account.

## References

[1]: https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html "eBay Sell Feed API Seller Hub quick reference"
[2]: https://www.ebay.com/sellercenter/listings/ebay-bulk-listing-tools "eBay bulk listing tools"
[3]: https://export.ebay.com/en/services-tools/seller-hub/uploading-your-listings-in-bulk-using-reports-tab/ "eBay Seller Hub bulk-upload guidance"
[4]: https://export.ebay.com/en/manage-listings/photo-tips/ "eBay photo tips"
[5]: https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240 "eBay images, videos and text policy"
