# Native Seller Hub Draft Workflow — Policy Source Notes

**Research date:** 2026-07-30  
**Purpose:** Record the external eBay guidance used to verify the application’s native draft, reference-only source-content, and seller-photo safeguards before any real submission.

| Topic | Verified finding | Source |
|---|---|---|
| Native draft feed | eBay’s Sell Feed quick reference identifies `FX_LISTING` as the Seller Hub feed type for creating new listings and **creating new drafts**. It explains that content errors are returned in the asynchronous result file after upload. | [Sell Feed API Seller Hub quick reference](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html) |
| Bulk listing workflow | eBay describes the Sell Feed API as an asynchronous bulk-listing workflow: create an upload task, upload the listing file, and download the result file to confirm the processing result. | [eBay bulk listing tools](https://www.ebay.com/sellercenter/listings/ebay-bulk-listing-tools) |
| Listing content rights | eBay allows images, videos, and text only when their use is truthful, accurate, non-infringing, and policy-compliant. It says copied images or videos from other websites are not permitted merely because they are publicly available. | [Images, videos and text policy](https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240) |
| Catalog exception | eBay’s images/text policy permits use of eBay product-catalog images and product details. This is distinct from importing another seller’s arbitrary listing content. | [Images, videos and text policy](https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240) |
| Photo requirements for actual listings | eBay’s seller guidance says every listing must have at least one photo, photos must accurately represent what is offered, and placeholder images and stock photos for pre-owned items are not allowed. | [eBay photo tips](https://export.ebay.com/en/manage-listings/photo-tips/) |
| Photo presentation | eBay’s seller guidance disallows added borders, added text/artwork or marketing material, and watermarks. It recommends showing item condition and flaws clearly. | [eBay photo tips](https://export.ebay.com/en/manage-listings/photo-tips/) |
| Mobile photo completion | eBay’s seller guidance describes a listing-form option to upload from mobile and supports later photo management/replacement in Seller Hub or My eBay. | [eBay photo tips](https://export.ebay.com/en/manage-listings/photo-tips/) |

## Practical interpretation for Sell Similar Studio

The application may create a **photo-pending native Seller Hub draft** where eBay’s draft feed accepts it, because a draft is not a published listing. The seller must add at least one compliant image before publishing. The app therefore treats imported marketplace photos and source descriptions as reference-only, allows a seller to finish actual-item photos on a phone, and prevents copied source photos from reaching the native feed.

Before a seller creates a real draft, the app must retain the user-controlled title, condition, price, category, and policy data; it must not publish; and it must wait for eBay’s asynchronous result before stating that a native draft exists. If the seller uses the app’s own photo-upload path, the app must require photo-rights confirmation and an item-accuracy confirmation. For a photo-pending handoff, the item-accuracy confirmation remains required, while the seller completes image requirements in eBay before listing publication.

> This document records product and policy safeguards, not legal advice. Sellers remain responsible for the content they submit and for verifying final Seller Hub status.
