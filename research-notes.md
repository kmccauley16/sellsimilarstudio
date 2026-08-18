# eBay UK Integration Research Notes

## Verified findings

The eBay Inventory API separates creation from publication. Its official documentation says `POST /offer` only stages an offer for publishing; `POST /offer/{offerId}/publish` is a separate call that converts it into a live listing. The application will therefore create an inventory item plus an unpublished offer and will not call the publish endpoint. The documentation does not confirm that an unpublished Inventory API offer appears in Seller Hub’s native Drafts area or has a stable Seller Hub draft URL, so the application will provide its own polished draft workspace and retain the returned eBay `offerId`.

The Browse API supports retrieving a detailed item using a REST item ID or legacy listing ID. eBay describes the item resource as providing detailed information and supporting historical legacy identifiers. Browse calls use an application access token obtained with the client-credentials grant. The exact retention behavior for ended/sold listings still needs verification, so the implementation should retain a guarded HTML parsing fallback when the official item endpoint no longer returns a sold listing.

The confirmed marketplace is the United States. Draft creation must set `marketplaceId` to `EBAY_US`, currency to `USD`, and `Content-Language` to `en-US`, using a user-authorized OAuth token with the `https://api.ebay.com/oauth/api_scope/sell.inventory` scope for seller-specific Inventory API operations.

## Sources

1. https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/createOffer
2. https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/publishOffer
3. https://developer.ebay.com/develop/api/buy/browse_api/item/getitem
4. https://developer.ebay.com/develop/guides-v2/authorization

## Final US draft-first implementation decisions

The confirmed marketplace is `EBAY_US`, with `en-US` content language and `USD` pricing. The OAuth user scopes used by the app are the base eBay scope plus `sell.inventory` and `sell.account`. Authorization uses eBay’s authorization-code flow with the application’s configured RuName, and refresh tokens are stored only in encrypted server-side form.

The draft workflow uses Inventory API `createOrReplaceInventoryItem`, followed by `createOffer`. The application intentionally does not implement or call `publishOffer`; the returned `offerId` is therefore an unpublished offer. Before offer creation, the seller must choose US fulfillment, payment, and return policies from the Account API and a merchant inventory location from the Inventory API.

Relevant official documentation remains:

- https://developer.ebay.com/api-docs/sell/inventory/resources/methods
- https://developer.ebay.com/api-docs/sell/inventory/resources/offer/methods/createOffer
- https://developer.ebay.com/develop/guides-v2/authorization
- https://developer.ebay.com/api-docs/sell/account/resources/methods

The Inventory API returns an `offerId`, not a documented stable per-offer Seller Hub edit URL. The application therefore stores the official offer ID and uses a Seller Hub drafts search URL keyed by the generated SKU as the closest navigable review destination, while keeping the offer unpublished.

## Marketplace Account Deletion compliance

Official eBay guidance: https://developer.ebay.com/develop/guides-v2/marketplace-user-account-deletion

The Production keyset must either subscribe to Marketplace Account Deletion notifications or qualify for an exemption. This app persists encrypted OAuth tokens, seller identity, imported listing data, and draft references, so the non-persistence exemption is not accurate.

The public endpoint must support HTTPS GET and POST. For endpoint verification, eBay sends `GET <endpoint>?challenge_code=<value>`. The response must be HTTP 200 JSON with `challengeResponse` equal to lowercase SHA-256 hex of the exact concatenation `challengeCode + verificationToken + endpoint`. The verification token must be 32–80 characters using only letters, numbers, underscore, and hyphen. The endpoint URL cannot use localhost or an internal IP.

Deletion POST payloads include metadata plus `notification.notificationId`, dates, attempt count, and identifiers under `notification.data`: `username`, immutable `userId`, and `eiasToken`. The endpoint should acknowledge quickly with a 2xx response. eBay signs notifications through the `x-ebay-signature` header; official validation retrieves the referenced public key through the Notification API and verifies the signature over the original request payload. Public keys should be cached for roughly one hour. Invalid signatures should receive HTTP 412.

Additional official signature references:

- https://developer.ebay.com/develop/guides/digital-signatures-for-apis
- https://github.com/eBay/digital-signature-verification-ebay-api
- https://github.com/eBay/digital-signature-nodejs-sdk

Every eBay notification includes an `x-ebay-signature` header. The account-deletion guide directs listeners to Base64-decode this header to obtain the public-key identifier, retrieve the key through the Notification API, cache it temporarily, and validate the signature against the original payload before processing deletion. eBay’s official listener behavior returns HTTP 412 when signature validation fails.

The official `eBay/event-notification-nodejs-sdk` confirms the production listener contract. Its Base64-decoded `x-ebay-signature` JSON contains `alg`, `kid`, `signature`, and `digest`. The official marketplace-deletion test fixture uses ECDSA with SHA-1, an EC public key returned by `GET https://api.ebay.com/commerce/notification/v1/public_key/{kid}`, and verification over `JSON.stringify(message)`. The application access token is obtained from `POST https://api.ebay.com/identity/v1/oauth2/token` using the client-credentials grant and the base `https://api.ebay.com/oauth/api_scope` scope. On a valid signature, the official listener returns 204; on a signature mismatch, it returns 412. Sources: https://github.com/eBay/event-notification-nodejs-sdk and https://raw.githubusercontent.com/eBay/event-notification-nodejs-sdk/main/test/test.json
