# eBay OAuth Authorization Diagnostics Sources

## Official findings

The eBay Production consent endpoint is `https://auth.ebay.com/oauth2/authorize`. A Production consent request requires the Production `client_id`, the Production RuName in `redirect_uri`, `response_type=code`, and the required scopes. eBay’s guidance also specifies that the same environment-specific RuName must be used again during authorization-code exchange. The `state` parameter is recommended for CSRF protection and is returned with the authorization code.[1]

For HTTP 500 responses, eBay states that intermittent failures can originate on eBay’s side, while failures affecting all calls are more likely caller-side. Its recommended confirmation step is checking the token and keyset with the eBay API Test Tool.[2]

## Diagnostic implications for Sell Similar Studio

- The observed `temporarily_unavailable` response occurs before eBay redirects to Sell Similar Studio, so it is not a database persistence error.
- The immediate checks are the exact Production authorization URL shape, the deployed Production keyset, and whether the configured RuName/consent settings match the eBay Developer Console.
- No OAuth authorization code, access token, refresh token, client secret, or seller identifier should be recorded in diagnostics.

## References

[1]: https://developer.ebay.com/develop/guides-v2/authorization "eBay Authorization Guide"
[2]: https://edp.ebay.com/support/kb-article?KBid=1239 "eBay HTTP 500 Error Guidance"

## Redacted configuration probe result — 2026-07-22

A server-side probe using the configured Production client identifier, RuName, four requested scopes, `prompt=login`, and `locale=en-US` received the expected eBay redirect chain: `auth.ebay.com` redirected to `auth2.ebay.com`, which redirected to `signin.ebay.com`. The probe did not receive `temporarily_unavailable`. Only hashed configuration fingerprints, parameter names, and response metadata were recorded; no credential values, authorization codes, tokens, or seller identifiers were retained.

## Developer Console access result — 2026-07-22

The available browser session reached the eBay Developer Program sign-in page when opening the Application Keys route and remained unauthenticated after the user reported signing in. Therefore, no live Developer Program configuration values were read or changed automatically. A read-only check must use the user’s authenticated Developer Program browser session or user-supplied non-secret configuration values.

## Developer Console configuration verification — 2026-07-22

The owner verified the Production Application Keys page for **Sell Similar Studio**. The configured privacy, accepted, and declined URLs use the live `https://sellsimilar-jdtxczss.manus.space/` origin. The OAuth setting for the configured RuName was initially disabled; the owner enabled it, producing the Developer Program’s green OAuth-enabled confirmation. The consent panel displayed is a preview and does not require the developer to accept it. After this change, the controlled authorization attempt reached the application callback and produced the app’s safe generic error, confirming that the prior provider-side authorization blockage was resolved.

## Redacted callback finding — 2026-07-22

Production diagnostics for the controlled return identified `encrypt_tokens` as the recorded stage, but both encrypted token lengths were present and no scope length was logged. The callback read `tokens.scope.length` after encryption. This demonstrates that the token response omitted `scope`, causing a local `undefined` access before database persistence. The evidence-backed repair uses the app’s explicitly requested scopes when the provider omits the optional response field.

## State-only return interpretation — 2026-07-22

The official eBay Authorization guide states that, after a seller grants consent via the Grant Application Access page’s **Agree and Continue / I Agree** action, eBay redirects to the configured Accept URL with both the supplied `state` and an authorization `code`. A return containing `state` but no `code` therefore did not complete the documented consent-to-code handoff. Sell Similar Studio correctly leaves the seller unconnected in this condition and must not persist any connection until a valid `code` is present. [1]


## Official parameter and callback confirmation — 2026-07-22

[eBay’s authorization guide](https://developer.ebay.com/develop/guides-v2/authorization) lists `prompt=login` as an optional supported parameter for a Production authorization-code consent request. It also states that `response_type=code` directs eBay to generate and return an authorization code, and that after the seller clicks the Grant Application Access page’s agreement button, eBay redirects to the configured Accept URL with both `state` and `code`. The guide identifies the Production consent endpoint as `https://auth.ebay.com/oauth2/authorize` and requires `redirect_uri` to be the Production RuName.

[eBay’s Quick OAuth Guide](https://developer.ebay.com/support/kb-article?KBid=5075) likewise identifies the OAuth-enabled RuName as the `redirect_uri`, describes `prompt=login` as a supported way to force sign-in, and shows a successful callback carrying `state` and `code`. These sources confirm that the deployed request shape is generally valid; the observed return containing `state` without `code` must be classified without speculative parameter changes.

## Existing authorization check — 2026-07-22

[eBay’s official token-revocation guidance](https://developer.ebay.com/support/kb-article?KBid=566) directs the account owner to **Account settings → Sign in and security → Third-party app access**, where the owner can select an application and apply revocation. eBay also states that an authorization-code User token cannot be generated without user consent at least once.[3] Because the app’s production callback currently carries `state` without the `code` that documented consent should return, the next controlled check is whether the seller account has an existing **Sell Similar Studio** authorization that should be revoked before one new attempt.

[3]: https://developer.ebay.com/support/kb-article?KBid=566 "How can I revoke a token?"
[4]: https://developer.ebay.com/support/kb-article?KBid=5220 "Is there any way to automate the authorization code grant token?"

## Resolution — stale account authorization removed — 2026-07-22

The seller’s eBay **Third-party app access** page listed **Sell Similar Studio** with a grant date of 2026-07-22. The seller revoked that existing authorization, then performed exactly one fresh authorization attempt. The application returned to `/connection` with the visible success notice **“eBay US account connected”** and the status **Connected**. This confirms that the authorization code was issued, exchanged, encrypted, and persisted successfully.

The state-only return was therefore attributable to eBay’s existing account-level authorization state; it was not caused by an unsupported `prompt=login` parameter, a callback-parser code-loss path, or the previously repaired database insert and missing-scope failures. No authorization codes, tokens, secrets, or raw redirect query values were retained in this record.

## Inventory-location discrepancy research — 2026-07-22

[eBay’s Inventory API location-management documentation](https://developer.ebay.com/api-docs/sell/static/inventory/managing-inventory-locations.html) states that `getInventoryLocations` retrieves all inventory locations defined for a seller account. Each location is identified by an immutable seller-provided `merchantLocationKey`; a separate `name` is a human-friendly display name, and warehouse locations do not require a name.[5] The app relays this API response and uses a city/state fallback only when eBay does not return a name. It does not contain the displayed `DE-Berlin` or `US-Washington` values as hardcoded options.

Consequently, the visible locations must be investigated as eBay-side account records (or response data) before a seller chooses one, not replaced by a speculative client-side label change.

## Redacted live location-result confirmation — 2026-07-22

A one-time, read-only request to eBay’s Production `getInventoryLocations` endpoint, made with the already stored seller authorization, returned exactly two locations. Both are **enabled warehouse** records. Their eBay-supplied names and merchant-location keys are `DE-Berlin` and `US-Washington`; the app displays those exact eBay-supplied names. No token, full address, seller identifier, or raw API payload was recorded. This confirms that the discrepancy is **eBay account configuration data**, not a hardcoded option or mapping error in Sell Similar Studio.

eBay’s migration documentation also explains that a legacy listing’s country and location value can be used to create a Location-object identifier during Inventory API migration.[6] That is compatible with the existing country-city style keys, though the provenance of the two existing records cannot be established without inspecting the seller’s eBay account history.

[6]: https://developer.ebay.com/api-docs/sell/static/inventory/migrating-listings.html "Migrating Listings to Inventory API Objects"

## Chicago warehouse setup design — 2026-07-22

The seller identified **Chicago, Illinois, United States** as the single origin for all drafts. The app will add a generic, protected warehouse-location form that requires a seller-entered city, state/province, and country, defaults to the seller-confirmed Chicago values in the current session, and shows a confirmation dialog before any external write. The server will create a location only after the confirmation mutation, first checks eBay’s existing locations for the same normalized city/state/country, and reuses a match instead of creating a duplicate.

The eBay write will create an **enabled WAREHOUSE** location using only the confirmed city, state/province, country, and a generated readable name/key. It will not edit, disable, or delete the existing Berlin or Washington records; it will not save seller policies automatically; and it will not invoke eBay’s publish endpoint. After eBay returns the new/reused record, the app will preselect it for the seller to review and save alongside the three existing eBay business policies.[5]

[5]: https://developer.ebay.com/api-docs/sell/static/inventory/managing-inventory-locations.html "Managing inventory locations"

## Unpublished draft creation diagnosis — 2026-07-30

The review screen reached the protected `createDraft` mutation with all six local readiness checks satisfied, but the user received eBay’s **“This Offer is not available”** response before a draft was persisted. The current workflow first writes the inventory item, then calls Inventory API `GET /offer` to look for an already-created unpublished offer for the deterministic SKU, and only afterwards calls `POST /offer`.

[eBay’s `createOffer` documentation](https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/createOffer) states that `POST /offer` creates an unpublished offer and returns its `offerId`; it does not publish a listing. Community reports for the Inventory API identify the same “This Offer is not available” / error `25713` wording when looking up an unavailable offer. Together with the app’s call order, the evidence supports treating that exact unavailable-offer result from the **idempotency lookup only** as “no existing draft yet,” then proceeding to `POST /offer`. It must not be ignored for offer creation, updating, publishing, or any other eBay operation.

The repair must retain all existing checks, continue to avoid `publishOffer`, and preserve all other eBay lookup errors. It should also retain structured redacted error metadata so a failed create-offer call can be distinguished from an expected empty lookup on later diagnostics.

[7]: https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/createOffer "eBay Inventory API createOffer"
[8]: https://community.ebay.com/t5/RESTful-Sell-APIs-Account/Inventory-item-getOffers-always-return-404-Not-Found/m-p/35114032 "eBay Community: getOffers unavailable offer response"
