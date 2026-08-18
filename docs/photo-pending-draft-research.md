# Photo-Pending Seller Hub Draft Research

## Decision

A photo-pending native Seller Hub draft is supported for the `FX_LISTING` workflow. The application can therefore omit the `Item photo URL` column for a `Draft` row, create the eBay draft from a desktop review, and let the seller add their own photos later from eBay’s mobile app or Seller Hub before listing activation.

## Official eBay evidence

1. The [Sell Feed API quick reference](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html) identifies `FX_LISTING` as the feed type for creating new listings and creating new drafts.
2. The [Seller Hub uploadable templates guide](https://pages.ebay.com/sh/reports/help/uploadable-file-feeds/) describes **Create new drafts** as uploading draft listings to the eBay Drafts folder with minimal information, to be finished and activated from the seller’s eBay account Drafts folder.
3. eBay’s [Seller Hub bulk-upload guidance](https://export.ebay.com/en/services-tools/seller-hub/uploading-your-listings-in-bulk-using-reports-tab/) explicitly states that a seller can select the Drafts template, leave the image URL column blank, and add images later when converting the draft to a listing.

## Implementation constraints

- Imported source photos remain reference-only and are never included in a Feed API payload.
- A draft with no seller-owned image URLs must send a blank `Item photo URL` field, not a source image URL.
- Seller-owned uploads, photo-rights attestation, optional safe background enhancement, and item-accuracy attestation remain available for sellers who want to include photos before draft submission.
- The UI must clearly identify the result as a photo-pending Seller Hub draft that needs the seller’s own photos before activation.
