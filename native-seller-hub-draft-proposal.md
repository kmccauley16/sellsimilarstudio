# Native Seller Hub Draft Workflow Proposal

**Prepared for:** Sell Similar Studio

## Conclusion

Yes—there is a supported route that can meet the intended workflow much more closely than the current Inventory API implementation. The correct route is eBay’s **Seller Hub Reports / Sell Feed API** workflow, using an `FX_LISTING` upload with the template action set to `Draft`. eBay’s own guidance states that this action posts a partially completed listing to the seller’s **Drafts folder on eBay**, rather than creating an unpublished Inventory API offer. [1] [2]

> The current workflow is technically valid, but it creates an **unpublished Inventory API offer**. It does not create the native Seller Hub Draft that appears in the Seller Hub Drafts screen. The app’s prior “Draft created” label was therefore misleading.

## What the Supported Native-Draft Route Does

| Requirement | Supported approach | Result |
|---|---|---|
| Paste a sold eBay link | Keep the existing import and review workflow | The app extracts and lets the seller edit listing data before any eBay action. |
| Create a true Seller Hub draft | Create a Seller Hub feed task with `feedType = FX_LISTING`, then upload a CSV row whose `Action` is `Draft` | eBay processes the row into its native Drafts workflow. [1] [2] |
| Never publish automatically | Do not call `publishOffer`; use only the `Draft` action | The listing remains an editable draft in Seller Hub. [2] |
| Give accurate success feedback | Treat the initial request as **Submitted to eBay**; mark **Native draft created** only after the Feed task reports completion and a successful row | The app does not claim success merely because a request was accepted. [3] [4] |
| Handle listing images | Pass selected HTTPS image URLs where they meet eBay’s feed rules, capped at 12 for Seller Hub Reports | Seller Hub’s native draft can include source images, subject to eBay validation. [1] |

## Current App Versus Proposed Workflow

| Area | Current implementation | Proposed native-draft implementation |
|---|---|---|
| eBay API route | Inventory API `createOffer` | Sell Feed API `FX_LISTING` upload |
| eBay object created | Unpublished Inventory API offer | Native Seller Hub draft |
| Seller Hub Drafts visibility | Not expected | Expected after eBay processes the draft upload |
| Status handling | Synchronous “draft created” after an offer ID is returned | `submitted` → `processing` → `native draft created` or `failed` |
| Stored identifier | `offerId` | Feed `taskId`, safe row result, and optional draft reference if eBay provides one |
| Selected images | Up to 24 selected by the current Inventory API flow | Limit to 12, which is eBay’s Seller Hub Reports limit. [1] |
| Publish behavior | No publish call today | No publish call; explicitly preserve this safety boundary |

## Mapping From the Existing Review Workspace

The existing review page already captures most fields that eBay’s native draft template accepts: category ID, title, condition ID, selected image URLs, description, fixed-price format, quantity, and start price. The generated row would also use a deterministic, seller-visible custom label/SKU. [1]

The implementation must use eBay’s official **Create new Drafts** template rather than inventing column names. Category-specific item specifics and seller policy fields can vary. Before enabling live use, the app should validate its CSV against a template downloaded from the connected seller’s Seller Hub Reports area for a representative category. This is the essential compatibility checkpoint; it prevents us from guessing at eBay’s feed schema.

## Safe Implementation Plan

| Phase | Scope | Safety control |
|---|---|---|
| 1. Template validation | Obtain one official **Create new Drafts** template for the connected seller and test its schema with a single non-published row | No live listing or publish action; the test action is `Draft` only. |
| 2. Data mapper | Map the existing reviewed fields into the approved template, validate limits, and require image selection at or below 12 | Reject incomplete or incompatible data before any eBay request. |
| 3. Feed submission | Create one `FX_LISTING` task and upload the CSV only after the seller clicks the explicit action | No background retries, no scheduled jobs, and no publish endpoint. |
| 4. Confirmation | Allow an explicit “Check eBay result” request to read the Feed task status and result file | The UI says **submitted/processing** until eBay confirms the row succeeded. |
| 5. History and recovery | Store task ID, status, timestamp, and safe row-level error summary; retain prior Inventory API records as legacy history | No silent duplicate submission; no false “draft created” state. |

This plan respects the request to be credit-efficient: it uses no AI generation, no background loop, and no automated polling. It performs eBay calls only when the seller explicitly submits or explicitly checks the status.

## Recommendation

I recommend replacing the user-facing **Create eBay draft** action with a **Create native Seller Hub draft** Feed API workflow, after one controlled template-validation step. This is the only source-backed API approach identified that aligns with the requested final state: the listing appears in the native Seller Hub Drafts area and is not published.

I do **not** recommend browser automation as the primary solution. It would be more brittle, harder to validate across category-specific forms, and less suitable than eBay’s documented Seller Hub feed workflow.

## Approval Needed Before Any Build Work

If approved, the first action will be limited to validating the connected seller’s official **Create new Drafts** CSV template for one representative category. No listing will be published, and I will ask for confirmation before any action that uploads a draft row to eBay.

## References

[1] [eBay Inventory Onboarding Guide — Creating Draft Listings](https://pages.ebay.com/sh/reports/help/create-listings-bulk)

[2] [eBay Sell Feed API — Seller Hub Feed Flow](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html)

[3] [eBay Sell Feed API — Quick Reference](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html)

[4] [eBay Sell Feed API — `createTask`](https://developer.ebay.com/api-docs/sell/feed/resources/task/methods/createTask)

[5] [eBay Seller Hub Reports Help](https://www.ebay.com/help/selling/selling-tools/seller-hub-reports?id=4096)
