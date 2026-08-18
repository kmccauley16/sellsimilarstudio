# eBay Offer Visibility Research

**Observed app record:** Listing import `150001` is marked `draft created` with API offer ID `220093089011` and SKU `SSS-1-150001`. This confirms that the application persisted an Inventory API offer record, not that a native Seller Hub draft should appear.

## Verified behavior

eBay’s Inventory API overview explains that an offer is created first and becomes a live marketplace listing only when published. It treats offers as Inventory API objects associated with an inventory item, marketplace, location, category, price, and seller business policies.

> “An offer is first created, and then it is published with the Inventory API.”

The current application uses `POST /sell/inventory/v1/offer`, which returns an offer ID for an unpublished offer. It does not call `publishOffer`.

An eBay Developer Support response specifically addresses this UI expectation: eBay does not provide an API to create native Seller Hub draft listings. Inventory API `createOffer` or `updateOffer` only saves an unpublished offer record; it is not visible in Seller Hub’s Drafts or Active Listings until it is published. Publishing would make it live and buyer-visible, which is not acceptable for the draft-first workflow.

## Product implication

The app must stop calling an Inventory API offer a “Seller Hub draft.” It should label the outcome as an **unpublished eBay offer** and explain that it is managed through the Inventory API/application rather than appearing in Seller Hub Drafts. The backend should confirm the returned offer using `GET /sell/inventory/v1/offer/{offerId}` and require an `UNPUBLISHED` status before writing the local success record.

## Sources

1. [eBay Inventory API Overview](https://developer.ebay.com/api-docs/sell/inventory/static/overview.html)
2. [eBay Inventory API: getOffer](https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/getOffer)
3. [eBay Developer Support response: “Draft’s not showing up in”](https://community.ebay.com/forum/selling-api-57967/topic/drafts-not-showing-up-in-468440/)
4. [eBay Inventory API: publishOffer](https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/publishOffer)

## Newly verified supported native-draft route: Seller Hub Reports / Sell Feed API

There is a distinct, supported eBay workflow that matches the owner’s native-draft requirement better than the Inventory API offer route:

1. Seller Hub Reports exposes a **Create new Drafts** template.
2. Its template uses `Action = Draft`; eBay’s own guide states that this action posts partially completed listings to the seller’s **Drafts folder on eBay**.
3. The same Seller Hub feed can be submitted programmatically through the Sell Feed API using `feedType = FX_LISTING` and `schemaVersion = "1.0"`.
4. The flow is asynchronous: create an upload task, upload the CSV, poll task status, and download the result file if eBay reports row-level errors.
5. eBay explicitly recommends the `Draft` action to test production Feed API input without sending listings live.

This is not the Inventory API `createOffer` method. It creates a native Seller Hub draft workflow, which the seller can later finish in Seller Hub’s Bulk Edit and Relist tool. eBay’s guide says image URLs can be web-hosted, so the app’s existing selected source-image URLs can be represented in the feed where they meet eBay requirements.

### Implementation prerequisites and cautions

- The current OAuth flow must authorize the Feed API’s required `sell.inventory` scope; the existing app already requests this scope, but the connected seller token should be verified against the Feed API before any production use.
- The exact CSV schema must be based on the seller’s official **Create new Drafts** template, because category-specific item specifics and policy fields are enforced by eBay’s feed processor.
- The application must store the asynchronous task ID and row-level result, then show `Draft submitted`, `Draft created`, or the exact safe validation error only after eBay’s task is complete.
- No `publishOffer` call is needed or permitted in this workflow.
- This route should be implemented behind an explicit user action and initially tested with one saved listing and one seller-approved action.

## Additional sources

5. [eBay Seller Hub Reports Help](https://www.ebay.com/help/selling/selling-tools/seller-hub-reports?id=4096)
6. [eBay Inventory Onboarding Guide — Creating Draft Listings](https://pages.ebay.com/sh/reports/help/create-listings-bulk)
7. [eBay Sell Feed API — Seller Hub Feed Flow](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html)
8. [eBay Sell Feed API — Quick Reference](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html)
9. [eBay Sell Feed API — createTask](https://developer.ebay.com/api-docs/sell/feed/resources/task/methods/createTask)

## Exact Feed API and CSV mapping details

Official Feed API documentation confirms native Seller Hub draft uploads use `createTask` with `feedType: "FX_LISTING"` and `schemaVersion: "1.0"`, followed by multipart `uploadFile` where the form key is `file`. The task reference is returned in the `Location` response header. `getTask` supplies the asynchronous processing state and, on completion, `uploadSummary.successCount` and `uploadSummary.failureCount`. Therefore, a truthful local status is `submitted` or `processing` until eBay confirms a completed result.

Official Seller Hub Reports guidance confirms that `Action=Draft` posts a partially completed listing into the native eBay Drafts folder. The implementation can map `Custom label (SKU)`, `Category ID`, `Title`, `Condition ID`, `Item photo URL`, `Description`, `Format`, `Quantity`, and `Start price`. Seller Hub Reports accepts up to 12 HTTPS image URLs in `Item photo URL`, separated with `|`, and maps item specifics through CSV headers shaped `C:<Specific Name>`.

Sources: https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html ; https://developer.ebay.com/api-docs/sell/feed/resources/task/methods/createTask ; https://developer.ebay.com/api-docs/sell/feed/resources/task/methods/uploadFile ; https://developer.ebay.com/api-docs/sell/feed/resources/task/methods/getTask ; https://pages.ebay.com/sh/reports/help/uploadable-file-feeds/ ; https://export.ebay.com/en/services-tools/seller-hub/uploading-your-listings-in-bulk-using-reports-tab/
