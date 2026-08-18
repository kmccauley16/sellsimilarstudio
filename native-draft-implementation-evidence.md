# Native Seller Hub Draft Implementation Evidence

## Active submission path

The active review submission procedure is `ebay.createDraft` in `server/ebayRouter.ts` (lines 245–297). It imports and calls `submitNativeSellerHubDraft` from `server/ebayApi.ts`; it does **not** import or call the legacy `createUnpublishedOffer` helper. A successful request creates a database record with `workflow: "seller_hub_feed"`, an eBay Feed API task ID, and a local status of `draft submitted`.

## No-publish boundary

`submitNativeSellerHubDraft` in `server/ebayApi.ts` (lines 562–585) creates an `FX_LISTING` Feed API task and uploads one CSV generated with `Action=Draft`. It uses only these Feed API operations:

| Operation | Endpoint shape | Purpose |
|---|---|---|
| Create task | `POST /sell/feed/v1/task` | Requests an asynchronous `FX_LISTING` task. |
| Upload CSV | `POST /sell/feed/v1/task/{taskId}/upload_file` | Uploads the Seller Hub Reports draft row. |
| Inspect task | `GET /sell/feed/v1/task/{taskId}` | Reads the asynchronous result without changing a listing. |

There is no call to an eBay publication endpoint in the native-draft submission path.

## Truthful status model

The schema distinguishes legacy `inventory_offer` records from `seller_hub_feed` records and stores task ID, task status, success count, failure count, and a safe result message. `mapFeedTaskToLocalState` in `server/ebayRouter.ts` marks a listing `draft created` only when eBay returns `COMPLETED` or `COMPLETED_WITH_ERROR` **and** `successCount >= 1` with `failureCount === 0`. Pending tasks remain `draft submitted` or `draft processing`.

While a native task is pending, a second `createDraft` request refreshes its existing task instead of submitting a new one. Failed tasks may be retried only after eBay reports failure.

## Mapping and deterministic coverage

`buildNativeSellerHubDraftCsv` verifies a non-empty category, title, valid USD price, and positive quantity. It creates a Seller Hub Reports CSV row with `Action=Draft`, a custom SKU, category ID, condition ID, selected HTTPS image URLs (deduplicated and limited to 12), description, quantity, price, and dynamic `C:` item-specific columns.

The regression suite includes:

| Test file | Verified behavior |
|---|---|
| `server/ebayWorkflow.test.ts` | `Draft` CSV action, item-specific and image mapping, `FX_LISTING` task/upload behavior, task status parsing, and absence of a publish endpoint. |
| `server/ebayRouterSafety.test.ts` | Submission begins as asynchronous `draft submitted`; task completion is required before `draft created`; pending tasks are refreshed rather than resubmitted. |
| `server/connectionPage.test.tsx` | Legacy Inventory API seller-policy and warehouse setup controls are absent from the native-draft connection experience. |

The test suite completed with **55 passing tests**, and the production build completed successfully. No live Feed API submission has been made during implementation; the first one remains an explicitly confirmed seller action.
