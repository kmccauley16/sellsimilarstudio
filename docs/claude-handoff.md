# Sell Similar Studio — Redacted Technical Handoff

**Prepared:** 2026-07-30  
**Purpose:** Enable a future engineering agent to safely continue Sell Similar Studio without transferring credentials, OAuth tokens, user data, full addresses, screenshots, or other sensitive material.

> **Security rule:** Do not paste or commit eBay Client IDs, Client Secrets, RuNames, token-encryption keys, OAuth codes, access tokens, refresh tokens, webhook verification tokens, complete street addresses, raw request logs, or user-provided screenshots. Set secrets only through the project’s secure secret-management interface.

## Product Status

Sell Similar Studio is an authenticated, draft-first eBay US listing workflow. A seller reviews a similar/sold-item reference, edits the proposed listing facts, and creates a **native Seller Hub draft** using eBay’s Sell Feed `FX_LISTING` workflow. The product does not publish an eBay listing. A Feed API task is asynchronous, so the application tracks its state and does not claim a native draft exists until eBay reports the task result. [1]

The current product explicitly supports a faster **desktop-to-phone** path. A seller may create a photo-pending Seller Hub draft from the desktop with no image URL, then add photos of the actual item in eBay on a phone before activation. Imported marketplace photos and source descriptions are reference-only and are never sent to eBay. eBay’s Seller Hub guidance states that a seller can use the Drafts template, leave the image URL blank, and add images later when converting the draft to a listing. [2]

| Area | Current status | Important boundary |
|---|---|---|
| Marketplace | eBay US, USD, `en-US` | Do not change marketplace constants without a separate compatibility review. |
| Authentication | Manus OAuth for app users; eBay authorization-code OAuth for seller connections | Tokens are encrypted server-side and never returned to the browser. |
| Draft creation | Sell Feed `FX_LISTING` using `Action: Draft` | Never call an eBay publication endpoint from this workflow. |
| Photo workflow | Seller-owned uploads are optional for draft creation | Imported source image URLs are never Feed API eligible. |
| Photo-pending handoff | Supported | Seller must add compliant actual-item photos in eBay before publication. |
| AI description | User-triggered, one bounded proposal | Never overwrite the editable description without explicit user action. |
| Account deletion | Public challenge endpoint plus signed-notification validation and idempotent cleanup | Do not mark the app exempt from Marketplace Account Deletion. |

## Runtime Architecture

The application is a React 19 + Vite + Tailwind client, served with an Express 4 + tRPC 11 backend. Drizzle ORM connects to MySQL/TiDB, and Vitest supplies automated regression coverage. The project is ESM and uses `pnpm`.

| Layer | Primary paths | Responsibility |
|---|---|---|
| Client routes | `client/src/App.tsx`, `client/src/pages/` | Import, review, history, connection, privacy, and status UX. |
| Client data layer | `client/src/lib/trpc.ts` | Typed tRPC query and mutation bindings. |
| API composition | `server/routers.ts` | Combines `auth`, `listing`, `ebay`, and system routers. |
| Listing workflow | `server/listingRouter.ts`, `server/ebayListing.ts`, `server/descriptionService.ts` | Safe import, editable review, owned-photo upload, attestations, and user-triggered description proposal. |
| eBay workflow | `server/ebayRouter.ts`, `server/ebayApi.ts`, `server/ebayDeletion.ts` | OAuth, policy/location setup, Feed API draft task, result polling, and deletion compliance. |
| Persistence | `drizzle/schema.ts`, `server/db.ts` | Users, eBay connections, listing imports, native draft task history. |
| Shared contracts | `shared/` | OAuth return parsing, constants, keyword limits, and safe shared types. |
| Regression suite | `server/**/*.test.ts`, `server/**/*.test.tsx` | Router, API mapping, privacy, OAuth, photo, and UI behavior tests. |

### Core Data Model

| Entity | Key purpose | Relevant safeguards |
|---|---|---|
| `users` | Authenticated application identity | User-scoped records and authorization boundaries. |
| `ebay_connections` | One seller connection with encrypted tokens and immutable eBay user identity | Disconnect and verified deletion clean up connection data. |
| `listing_imports` | Editable listing review, reference source fields, seller-owned photo URL set, and attestation timestamps | Source images are preserved as reference-only; edits reset necessary attestations. |
| `ebay_drafts` | Native draft workflow, SKU, Feed API task ID, status, result summary | Distinguishes `seller_hub_feed` from legacy `inventory_offer` history. |

## Current Seller Workflow

1. The seller connects an eBay US account through the connection screen. The application requests only the configured seller scopes and retrieves an immutable seller identifier after authorization.
2. The seller pastes a supported eBay item URL. The application performs a bounded import and preserves photos/descriptions for reference rather than direct republication.
3. The seller edits title, condition, price, quantity, category, specifics, and description. The seller may generate a short fresh description proposal from current editable facts, then explicitly choose whether to apply it.
4. The seller either uploads authorized photos in the app or skips desktop photo upload. Uploaded photos require a photo-rights attestation. All draft attempts require an item-accuracy attestation.
5. The seller chooses **Create Seller Hub Draft**. The app generates an `Action: Draft` CSV row, starts the eBay Feed API task, uploads the CSV, and records the task as queued/processing.
6. The seller checks the eBay result state. For a photo-pending draft, the seller opens it in eBay on a phone, adds their own actual-item photos, and decides whether to activate it.

> eBay’s photo guidance requires actual listing photos to accurately represent the item; it does not permit a photo-pending draft to become a published listing without compliant images. [3]

## Native Draft Safety Contract

| Requirement | Current enforcement |
|---|---|
| Never use imported source photos in the native feed | Only seller-uploaded `/manus-storage/` paths can be converted to public image URLs; source URLs are excluded. |
| Permit fast photo-pending drafts | An empty seller-owned photo set produces a blank `Item photo URL` field instead of source-image substitution. |
| Secure hosted seller-upload URLs | Seller-uploaded photos require a valid public HTTPS origin before they are included in a feed CSV. |
| Require accurate item representation | Server blocks draft submission until the item-accuracy attestation exists. |
| Require photo rights only when relevant | Server blocks a draft with uploaded seller photos until photo-rights attestation exists; a photo-pending draft has no desktop photo-rights requirement. |
| Preserve no-publish boundary | CSV action is `Draft`; implementation does not invoke a listing publish call. |
| Do not overstate success | Task ID is recorded first; Feed API status/result determines whether the app labels the draft created. |

## Secure Configuration Handoff

Use variable **names only** in discussions and source control. Supply values through secure project secrets. The current integration expects values such as `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET`, `EBAY_REDIRECT_URI_NAME`, and `EBAY_TOKEN_ENCRYPTION_KEY`, plus the framework-provided database and session settings.

| Configuration area | Non-secret requirement | Validation approach |
|---|---|---|
| Production keyset | Active eBay Production keyset with enabled User Tokens/OAuth configuration | Verify directly in the eBay Developer Console; do not rely on memory or screenshots. |
| OAuth redirect | RuName matching the app configuration; accept/decline routes returning to the app’s connection path | Compare the deployed authorization request and console record without exposing query codes or secrets. |
| OAuth permissions | Seller inventory, account, base, and Commerce Identity read scopes used by the implementation | Confirm consent and the persisted connection using a controlled test account. |
| Privacy/deletion compliance | Public privacy link and public Marketplace Account Deletion endpoint configured in eBay | Exercise eBay’s test-notification path and verify only redacted operational records. |
| Storage | Server-side S3-backed storage through the template helpers | Do not place user uploads in the database or repository. |

## Current Open Work

The following items remain intentionally open because they require a seller decision, direct eBay Developer Console validation, or a narrow evidence-based code change. Do not mark them complete based only on unit tests.

| Open item | Why it remains open | Safe next action |
|---|---|---|
| Production OAuth console validation | Requires inspection of the active Production keyset, RuName, and consent configuration. | Compare the deployed request fingerprint with console settings while redacting secrets and query values. |
| Non-secret OAuth configuration artifact | Requires direct textual console capture. | Record active/non-secret status, redirect prefix, and OAuth-enabled state only. |
| Seller inventory location selection | Requires the seller to confirm which inventory location is correct. | Ask the seller to select/confirm location; never create or select one silently. |
| Chicago warehouse draft selection | Requires an eBay response against the seller account. | Test selection and native-draft creation only after seller confirmation; do not publish. |
| Evidence-supported offer-creation repair | A prior eBay “This Offer is not available” diagnosis requires a narrowly scoped follow-up. | Review the redacted failure evidence; change only the identified API mapping and test it. |
| First real native Feed API draft | Requires the seller’s explicit confirmation and a fully reviewed listing. | Obtain confirmation immediately before the remote action; create a draft only, then inspect Feed API results. |

## Requested Automated Messaging Concept — Do Not Implement Automatically Yet

The earlier request appears to concern notifying a seller after a buyer-side purchase. This must remain a **future, gated capability**, not a background automation feature. eBay documentation indicates that legacy member-message APIs can support buyer/seller communication in an order relationship, but the precise buyer-side automation entitlement, scopes, and policy fit remain unresolved. [4] [5]

The suggested product specification is deliberately conservative:

| Product rule | Requirement |
|---|---|
| Trigger | No automatic purchase monitor or background sender. Detecting a purchase and sending a message must be explicitly user initiated. |
| Recipient scope | Only an order-specific seller in a verified transaction relationship. |
| Content | Fixed, transaction-relevant copy; no external links, personal contact details, off-eBay offers, or marketing language. |
| Review | Display the recipient, item/order context, and exact text before every send. |
| Controls | One send per order by default; duplicate prevention, rate limiting, cancellation, and immutable audit logging. |
| Authorization | Add no scopes or legacy endpoints until eBay Developer Technical Support confirms the intended buyer-side use case. |
| Failure behavior | Do not retry automatically; surface a redacted failure and let the user decide whether to retry. |

eBay’s member-to-member contact policy prohibits spam, off-eBay offers, personal contact details, and certain unsafe content. A future implementation should therefore be reviewed against the exact seller/buyer API entitlement and policy constraints before development begins. [6]

## Verification Commands

Run from the repository root:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Use focused Vitest files while iterating, then run the full suite before a checkpoint. For changes to eBay behavior, add deterministic tests that mock remote API calls and keep all real remote actions behind explicit seller confirmation.

## Documentation Notes

The historical `architecture.md` and `EBAY_SETUP.md` describe an earlier Inventory API unpublished-offer design. The current authoritative workflow is the native Seller Hub Feed API `FX_LISTING` draft path documented in:

- `docs/native-draft-pre-submission-safeguards.md`
- `docs/native-draft-policy-sources.md`
- `docs/photo-pending-draft-research.md`
- `native-draft-implementation-evidence.md`

Future work should update or retire contradictory historical wording rather than using it as the source of truth.

## References

[1]: https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html "eBay Sell Feed API Seller Hub quick reference"
[2]: https://export.ebay.com/en/services-tools/seller-hub/uploading-your-listings-in-bulk-using-reports-tab/ "eBay Seller Hub bulk-upload guidance"
[3]: https://export.ebay.com/en/manage-listings/photo-tips/ "eBay photo tips"
[4]: https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddMemberMessageAAQToPartner.html "eBay AddMemberMessageAAQToPartner reference"
[5]: https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/member-communications-exchanging.html "eBay Trading API member communications guide"
[6]: https://www.ebay.com/help/policies/member-behaviour-policies/membertomember-contact-policy?id=4262 "eBay member-to-member contact policy"
