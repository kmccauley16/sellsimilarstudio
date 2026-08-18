# eBay Buyer-to-Seller Messaging Research Notes

## Initial official sources

- eBay Developer Program, [Buyer/Seller Communication Call Index](https://developer.ebay.com/devzone/xml/docs/reference/ebay/CommunicationIndex.html): Search result identifies `AddMemberMessageAAQToPartner` as the Trading API call that enables a buyer and seller in an order relationship to send messages to each other’s My Messages inboxes.
- eBay Developer Program, [Exchange messages](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/member-communications-exchanging.html): Search result states that an order relationship exists when one member is the seller and the other is the buyer/winning bidder.
- eBay Developer Program, [Sell Communications Guide](https://developer.ebay.com/develop/guides-v2/communications/sell-communications-guide): Search result references `AddMemberMessageAAQToPartner` for buyer/seller communications.
- eBay Developer Program, [KB 1955](https://developer.ebay.com/support/kb-article?KBid=1955): Search result states that `AddMemberMessageAAQToPartner` can send messages to a buyer’s My Messages Inbox for orders created within 90 days; this is seller-oriented and must not be assumed to confirm buyer-side automation.

## Open verification questions

1. Whether the legacy Trading API call is accessible for a buyer account and supports buyer-to-seller messages tied to an eBay purchase.
2. Whether the required application permissions, OAuth scopes, and eBay policies permit automated post-purchase shipping-instruction messages.
3. Whether a safer alternative exists, such as a user-initiated prefilled message or purchase-order note.

## Verified findings

- eBay’s [AddMemberMessageAAQToPartner reference](https://developer.ebay.com/devzone/xml/docs/reference/ebay/AddMemberMessageAAQToPartner.html) says the Trading API call lets a buyer and seller in an order relationship message one another through My eBay, for up to 90 days after the order-line-item creation. It accepts an item ID, recipient ID, subject, and message body (maximum 2,000 characters), and has a per-seller short-duration rate limit.
- eBay’s [Trading API message-exchange guide](https://developer.ebay.com/api-docs/user-guides/static/trading-user-guide/member-communications-exchanging.html) defines an order relationship as one member being the seller and the other a buyer/winning bidder; the relationship is established on the buyer’s commitment to purchase, whether or not payment has been made.
- eBay’s [GetMyeBayBuying reference](https://developer.ebay.com/devzone/xml/docs/reference/ebay/getmyebaybuying.html) states that it retrieves My eBay buying information only for the authenticated user and can return a won list. This makes buyer purchase detection technically possible through a legacy Trading API integration, subject to the user’s authorization.
- eBay’s [Order API v1 documentation](https://developer.ebay.com/api-docs/buy/order_v1/resources/purchase_order/methods/getPurchaseOrder) describes it as a limited-release Buy API for complete checkout flows within an approved buying application; it is not a general ordinary-purchase-history monitor.
- eBay’s [member-to-member contact policy](https://www.ebay.com/help/policies/member-behaviour-policies/membertomember-contact-policy?id=4262) prohibits spam, off-eBay offers, personal contact details, links, threats, profanity, and hate speech. It says eBay may monitor messages and may issue warnings, restrict activity, or suspend accounts for policy violations.
- eBay’s [Message API overview](https://developer.ebay.com/api-docs/commerce/message/overview.html) indicates that the modern REST Message API supports sending and managing user conversations, but its returned public documentation does not establish the exact buyer purchase-triggered workflow or authorization requirement for this use case.

## Compliance conclusion in progress

The legacy Trading API appears to make a buyer-to-seller transaction message technically possible. However, automated bulk or recurring messages create spam/policy risk. The safest product design is a buyer-authorized, order-specific, user-reviewed send action with a fixed, transaction-relevant request, rate limiting, duplicate prevention, a log, and no external links or contact information. A fully automatic trigger should not be implemented without written confirmation from eBay Developer Technical Support for this exact buyer-side use case.

## OAuth callback 404 finding

- eBay’s official [Identity API GetUser reference](https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser) lists the Production endpoint as `GET https://apiz.ebay.com/commerce/identity/v1/user`. The current application calls the same path through `https://api.ebay.com`, which explains the observed 404 after the authorization-code exchange succeeds. The integration should keep the `api.ebay.com` base for the token and Sell APIs, and use the separate `apiz.ebay.com` host for Commerce Identity.

## OAuth callback repair — Commerce Identity scope

- eBay’s Commerce Identity `GET /user/` endpoint requires an authorization-code user token that includes `https://api.ebay.com/oauth/api_scope/commerce.identity.readonly`. This scope was added to `EBAY_SCOPES` because the seller-connection flow calls the endpoint to retrieve the authenticated seller’s immutable user ID.
- Official source: https://developer.ebay.com/api-docs/commerce/identity/resources/user/methods/getUser
