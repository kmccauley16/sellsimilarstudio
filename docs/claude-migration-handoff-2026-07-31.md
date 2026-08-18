# Sell Similar Studio — Claude Migration Handoff

**Prepared:** 2026-07-31  
**Purpose:** Move the current application and its technical context to a new Claude session without transferring credentials, account data, tokens, database records, screenshots, or user-uploaded files.

> **Security boundary:** Do not copy, request in chat, commit, or print eBay client secrets, OAuth authorization codes, access/refresh tokens, encryption keys, webhook verification tokens, database URLs, session secrets, user-uploaded files, or screenshots. Configure all secrets only in the new host’s secure environment-variable or secret-management system.

## Start Here — Master Prompt for Claude

Copy everything in this block into a new Claude chat after uploading the accompanying source archive.

```text
You are taking over the Sell Similar Studio codebase, an authenticated eBay US seller productivity application. Treat the accompanying repository and this handoff as the source of truth. First inspect the repo, run the test suite, TypeScript check, and production build. Do not change eBay credentials, OAuth configuration, production data, or submit/retry a remote eBay Feed task without the seller’s explicit confirmation immediately before that action.

Product goal: the seller pastes an eBay sold/similar listing link, reviews and edits the facts, optionally generates a short fresh description proposal, and requests a native eBay Seller Hub draft through the official Sell Feed API FX_LISTING workflow using Action: Draft. The application must never publish a listing.

Current stack: React 19 + Vite + Tailwind 4 client; Express 4 + tRPC 11 server; Drizzle ORM with MySQL/TiDB; Vitest; pnpm; ESM.

Commands:
  pnpm test
  pnpm exec tsc --noEmit
  pnpm build

Current production-domain behavior verified on 2026-07-31:
1. The AI “Generate/Revise with AI” action now succeeds and returns an editable proposal. The fix was to use the GPT-compatible max_completion_tokens parameter rather than max_tokens; retain regression coverage.
2. The extra item-accuracy confirmation gate was removed at the seller’s request. The review readiness display is now 5/5: title, description, price, category ID, and condition.
3. The previous sold-listing images remain visible on the review page as reference-only comparison images. They are not included in the seller upload set and are not sent to eBay in a Feed API row.
4. A previously submitted native Feed API task failed at eBay. The UI exposes only a read-only “Review failed task” control; it must not automatically retry or resubmit the task. The task’s precise eBay validation message did not surface in the UI after the read-only check.

Important open problem: Native Seller Hub draft creation has not yet been proven successful for the seller’s account. One prior FX_LISTING Feed task failed. Follow the official result-file flow for diagnosis: a completed task may be inspected with GET /sell/feed/v1/task/{task_id}/download_result_file. Parse only the relevant eBay validation message, redact all sensitive values, and do not retry the failed task automatically. A new draft submission requires fresh seller confirmation.

Photo requirements: The seller wants to see previous sold-listing photos for convenient comparison. Preserve that reference gallery. Do not put third-party source photo URLs into eBay draft payloads, automatically attach them to a new listing, or rely on the seller manually deleting them afterward. Only seller-owned or authorized uploads may enter the Feed API photo column. Photo-pending drafts may leave the image field blank; the seller can add their own actual-item photos in Seller Hub on their phone before publishing.

Do not revive the legacy unpublished Inventory API offer path. The active implementation is the native Seller Hub Sell Feed FX_LISTING path with Action: Draft. Do not call a publish endpoint.

Read these authoritative materials before modifying eBay behavior:
- docs/native-draft-pre-submission-safeguards.md
- docs/native-draft-policy-sources.md
- docs/photo-pending-draft-research.md
- native-draft-implementation-evidence.md
- docs/claude-migration-handoff-2026-07-31.md

Treat architecture.md and EBAY_SETUP.md as historical legacy documents; they describe the old Inventory API approach and must not override the native Feed API workflow.

Maintain the project’s safeguards: redact errors, retain authenticated/server-side token handling, use explicit seller confirmation for remote actions, prevent duplicate Feed submissions, and keep the UI truthful about asynchronous task status. Add focused deterministic tests for every behavioral change before running the complete suite.
```

## What the Application Does Today

Sell Similar Studio is a **draft-first eBay US workflow**. It imports a marketplace listing as a reference, offers an editable review workspace, and uses eBay’s Sell Feed API to create a native Seller Hub draft asynchronously. The application does not have an eBay publish action.

| Capability | Current state | Important boundary |
|---|---|---|
| Listing import | Implemented | Imported title, details, source description, and images are review/reference inputs, not automatically republished content. |
| Native draft path | Implemented | Uses eBay Sell Feed `FX_LISTING` with `Action: Draft`, not the legacy Inventory API offer path. |
| eBay publication | Not implemented | Do not add a publish endpoint to this workflow. |
| AI description | Verified in production | User-triggered; returns an editable proposal; never saves or publishes automatically. |
| Desktop-to-phone photos | Implemented | A photo-pending draft can have no desktop photos; add seller-owned actual-item photos later in Seller Hub. |
| Source-photo gallery | Implemented | Previous listing photos stay visible for comparison only and are excluded from Feed API photo submission. |
| Failed Feed task handling | Implemented, incomplete diagnosis | Read-only status review replaces retry; exact eBay row-level failure has not yet been surfaced. |

## Repository and Runtime

The source archive includes the application code, tests, schema, documentation, lockfile, and project configuration. It intentionally excludes dependencies, build output, logs, `.env` files, secret-bearing configuration, database data, generated runtime metadata, screenshots, and user files.

| Area | Main files | Notes |
|---|---|---|
| Client routes and review UI | `client/src/App.tsx`, `client/src/pages/Review.tsx` | Main import/review/draft experience. |
| Listing review and AI | `server/listingRouter.ts`, `server/descriptionService.ts`, `server/_core/llm.ts` | Description proposals are user-triggered and use GPT-compatible completion-token handling. |
| Feed API and draft state | `server/ebayRouter.ts`, `server/ebayApi.ts` | Native Seller Hub task creation, polling, status handling, and result-file support. |
| Persistence | `drizzle/schema.ts`, `server/db.ts` | Users, encrypted eBay connections, listing reviews, seller photo metadata, and task history. |
| OAuth and deletion compliance | `server/ebayDeletion.ts`, `server/_core/oauth.ts`, `server/ebayRouter.ts` | Keep server-side secrets and signed-deletion safeguards. |
| Tests | `server/**/*.test.ts`, `server/**/*.test.tsx` | Run all tests before trusting a change. |
| Package scripts | `package.json` | Uses `pnpm`, ESM, Vite, Express, tRPC, Drizzle, and Vitest. |

## Verified Recent Changes

### AI description action

The live error “The description proposal could not be read” was reproduced. The model proxy returned no visible content when the request used `max_tokens`, but returned valid structured content when called with `max_completion_tokens`. The implementation and tests were adjusted accordingly. Production verification returned an editable proposal, `<p>Good condition.</p>`, without saving or submitting the listing.

### Item-accuracy confirmation

The seller asked for the item-accuracy gate to be removed. The UI and server-side native draft eligibility now use **five** readiness requirements: title, description, price, category ID, and condition. The old `Confirm final details` action should not reappear. The photo-rights confirmation remains relevant only when a seller uploads photos.

### Source photos

The seller specifically asked to retain prior sold-listing images in the page for side-by-side comparison. That is supported as a non-submittable reference gallery. The seller also asked for those images to be copied into a draft with manual deletion later; that is **not implemented** and should remain a documented unresolved policy/compliance request rather than a feature change. The safe streamlined alternative is a photo-pending draft or seller-uploaded/authorized photos.

## Draft Submission Issue — Current Status

One real native Feed API attempt resulted in a completed eBay failure. The app reported that eBay could not create the Seller Hub draft. It did **not** publish a listing, and the app must not automatically retry the failed task.

The current review screen exposes **Review failed task**, which performs a status review only. It does not make a new Feed task. The latest observed eBay response remained generic rather than returning a row-level diagnostic to the UI. The next engineer should inspect the existing stored task ID only through the official completed-task result-file endpoint, then surface a concise, redacted error message if eBay provides one.

| Do | Do not |
|---|---|
| Fetch the existing completed task’s result file read-only. | Retry the failed Feed task automatically. |
| Display a concise eBay validation message, if present. | Claim a draft exists before eBay confirms it. |
| Require new seller confirmation before any new submission. | Submit or publish a listing while debugging. |
| Add tests for result-file parsing and failed-state UX. | Expose raw task uploads, tokens, or full eBay payloads. |

## Security and Configuration

Do not place production values into the repository or Claude chat. The host must configure values equivalent to the following through its secure secret store:

| Purpose | Expected variable name |
|---|---|
| eBay app identity | `EBAY_CLIENT_ID` |
| eBay app secret | `EBAY_CLIENT_SECRET` |
| eBay OAuth redirect name | `EBAY_REDIRECT_URI_NAME` |
| OAuth token encryption | `EBAY_TOKEN_ENCRYPTION_KEY` |
| Database connection | `DATABASE_URL` |
| Session signing | `JWT_SECRET` |
| Manus/framework OAuth | Framework-specific variables shown in `server/_core/env.ts` |

Before changing eBay OAuth or production credentials, inspect the developer-console configuration and the deployed authorization request together. Keep any OAuth code, access token, refresh token, client secret, RuName value, webhook token, and database value out of logs and handoff documents.

## Testing and Development Procedure

Run the following from the repository root before making a checkpoint or migration build:

```bash
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

During iteration, start with the focused affected test file, then use the full suite. eBay API interactions should be mocked for tests. A live eBay action is allowed only after the seller has reviewed the listing and explicitly confirmed the action in the current interaction.

## Authoritative eBay References

| Subject | Reference |
|---|---|
| Seller Hub Feed `FX_LISTING` and error results | https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-quick-reference.html |
| Downloading a completed Feed task result | https://developer.ebay.com/api-docs/sell/feed/resources/task/methods/getResultFile |
| Seller Hub draft bulk-upload guidance | https://export.ebay.com/en/services-tools/seller-hub/uploading-your-listings-in-bulk-using-reports-tab/ |
| eBay photo guidance | https://export.ebay.com/en/manage-listings/photo-tips/ |

## Historical Documents to Treat Carefully

`architecture.md` and `EBAY_SETUP.md` describe an older Inventory API unpublished-offer approach. They are retained for history but should not be used as implementation direction. The active submission path is the native Seller Hub Feed workflow documented above.

