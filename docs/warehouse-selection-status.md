# Warehouse Selection Status

## Decision

The current **native Seller Hub draft** workflow is deliberately **location-independent**. It creates an eBay Sell Feed `FX_LISTING` task containing a `Draft` row and does not use the legacy Inventory API offer payload. Consequently, the active draft-submission path does not read, save, or transmit `merchantLocationKey`, business-policy identifiers, or a warehouse address.

This resolves the earlier warehouse-selection follow-ups as **legacy Inventory API concerns**, not prerequisites for the current computer-to-phone native-draft flow. A seller can safely create a photo-pending native Seller Hub draft from the desktop, then complete their own photos in eBay on a phone, without any automatic publish action.

| Workflow | Warehouse-selection behavior | Publication behavior |
|---|---|---|
| Legacy unpublished Inventory API offer | Requires a saved `merchantLocationKey` and policy identifiers in its offer payload | Does not publish; this path is no longer the active submission workflow |
| Active native Seller Hub Feed draft | Does not use warehouse or policy fields in the feed submission | Creates/uploads a feed task only; no publish endpoint is invoked |

## Explicit-Save Boundary

The retained seller-setup controls remain safe for any future legacy Inventory API use. Creating or reusing the Chicago warehouse requires explicit user confirmation, returns the location key to the client, and does **not** persist it. The selected key remains local form state until the seller explicitly saves the complete setup. That save validates all selected policy and location identifiers against the seller’s current eBay account before the connection record is updated.

> The warehouse flow does not create a listing, does not modify an existing eBay location, and does not publish an offer.

## Active Native-Draft Safeguards

The native draft route accepts a reviewed listing only after the seller confirms item accuracy. If the seller uploads photos in the app, the route also requires a rights attestation. It then submits a Feed API task and records the result as **draft submitted** until eBay confirms a successful task result. The route has no publish call and does not claim that a Seller Hub draft exists before that confirmation.

The remaining real-world validation is intentionally separate: a seller must explicitly authorize one controlled, reviewed Feed API submission before the application can claim that eBay created a live Seller Hub draft. That action remains outside this documentation update and must not publish a listing.

## Evidence Map

| Evidence | What it establishes |
|---|---|
| `server/ebayRouter.ts` | Warehouse persistence occurs only through `saveSellerSetup`; the active `createDraft` route submits the native Feed task without reading connection location settings. |
| `server/ebayApi.ts` | The legacy offer builder carries `merchantLocationKey`; the active Feed API CSV/task builder does not. |
| `server/ebaySellerSetup.test.ts` | Selecting Chicago changes only a copied local form-state object. |
| `server/ebayRouterSafety.test.ts` | Creating/reusing a warehouse does not persist selection; explicit setup save does. |
| `server/ebayWorkflow.test.ts` | The native draft task path and warehouse creation paths do not invoke a publish endpoint. |

## Operational Result

For the active workflow, do **not** ask the seller to configure a Chicago warehouse before creating a native Seller Hub draft. Keep the location settings available only as a separately saved, explicitly confirmed option for legacy Inventory API work. The next production validation, if the seller chooses to authorize it, is one controlled Feed API task submission followed by task-status verification—not warehouse setup.
