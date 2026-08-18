# Official eBay Policy Research — Native Draft Workflow

> Research date: 2026-07-30. This is a policy evidence record, not legal advice.

## 1. Native Seller Hub draft Feed API

[eBay’s Seller Hub Feed API overview](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html) expressly describes the `Draft` action (the **Create new drafts** template) as the way to test input files without sending them to eBay as active listings. The documented production flow is: create an `FX_LISTING` task, upload a Seller Hub CSV, poll the task to `COMPLETED` or `COMPLETED_WITH_ERROR`, and inspect `uploadSummary` and the result file. The documentation requires a user OAuth token and instructs developers to use a Seller Hub Reports template.

Source: https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html

## 2. Authorized API use and consent

The [eBay API License Agreement](https://developer.ebay.com/join/api-license-agreement) permits applications to interact with eBay Services only for authorized use, including facilitating a user’s use of eBay Services. It requires compliance with the current agreement and states that developers are responsible for their applications and users. The agreement permits limited intermediate copies of eBay Content as necessary for a permitted activity and permits use/display/modification of eBay Content only as expressly authorized by the user and consistent with the agreement.

[eBay’s OAuth guidance](https://developer.ebay.com/develop/guides-v2/authorization) states that an application acting on a user’s behalf must first obtain that user’s consent; the token carries authorization for the approved scopes.

Sources:
- https://developer.ebay.com/join/api-license-agreement
- https://developer.ebay.com/develop/guides-v2/authorization

## 3. Automated access and scraping

The current [eBay User Agreement](https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259) prohibits use of "any robot, spider, scraper, data mining tools, data gathering and extraction tools, or other automated means" to access eBay Services without eBay’s prior express permission. The agreement also prohibits posting content that infringes third-party rights and provides for account limits, suspension, or termination for violations.

Source: https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259

## 4. Source photos, descriptions, and intellectual property

[eBay’s images, videos and text policy](https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240) allows content only when it is truthful, accurate, non-infringing, and compliant with policy. It explicitly says images/videos copied from another website may not be used. eBay catalog images and product details may be used as eBay permits.

[eBay’s intellectual-property policy](https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349) says the way an item is listed must not infringe rights, including third-party photos, images, videos, or creative text copied from websites, catalogs, or advertisements without permission. Seller Center guidance adds that photos, videos, and descriptions should be original unless the seller has approval, and instructs sellers to use eBay catalog content where available.

Sources:
- https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240
- https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349
- https://www.ebay.com/sellercenter/resources/intellectual-property

## 5. Listing accuracy and seller responsibility

[eBay’s item-description policy](https://www.ebay.com/help/policies/listing-policies/item-description-policy?id=4372) requires accurate item descriptions, matching condition across title/description/item specifics, accurate required specifics, and correct categories. The [selling practices policy](https://www.ebay.com/help/policies/selling-policies/selling-practices-policy?id=4346) says that sellers must keep inventory status and item condition accurate, must have inventory or an existing third-party fulfillment agreement, and must use photos of the actual item for used, refurbished, or flawed items.

Sources:
- https://www.ebay.com/help/policies/listing-policies/item-description-policy?id=4372
- https://www.ebay.com/help/policies/selling-policies/selling-practices-policy?id=4346

## Policy implication to evaluate

The Feed API draft submission itself is an official documented pathway when done through valid OAuth and eBay’s template. However, a workflow that automatically fetches public eBay item pages, copies third-party seller images/descriptions, or creates drafts without a user’s specific review/authorization has material compliance risks under the cited User Agreement and listing/IP policies.

## 6. AI background enhancement — seller-owned photos only

Official eBay seller guidance confirms that eBay offers AI background enhancement for a seller’s uploaded listing photo: the seller uploads a product photo, removes its original background, selects an AI-generated background, reviews it, and continues the listing. This supports a narrow conclusion: white-background or other background enhancement can be appropriate **after** the seller owns or is authorized to use the source photo and only when the result remains truthful and accurate. It does **not** transfer copyright or permission to reuse another seller’s source photo.

The official photo guidance requires a listing to show exactly what is offered; it prohibits inaccurate photos, limits stock photos for most pre-owned goods, prohibits text/artwork and watermarks, and recommends actual-item detail photos. It also describes eBay’s editor for background removal and image adjustment.

Sources:
- https://export.ebay.com/en/resources/seller-news/releases-archive/2024-november-seller-update/tools-you-can-trust/
- https://export.ebay.com/en/manage-listings/photo-tips/
- https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240

Practical rule: AI background editing must not be used as a way to turn third-party seller photos into compliant photos. A future enhancement should be offered only after a seller attests that the uploaded photo is theirs or is authorized for use, and it should preserve the actual product, condition, colors, marks, flaws, and proportions.
