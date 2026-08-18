# eBay Policy Compliance Assessment: Native Seller Hub Draft Workflow

**Prepared by:** Manus AI  
**Date:** 2026-07-30  
**Purpose:** Assess the proposed *paste an eBay link → review → create a native Seller Hub draft* workflow before any real eBay draft submission. This is a practical policy assessment, **not legal advice**.

## Executive conclusion

> **Do not submit the first real draft from the current implementation yet.** The native Seller Hub **Feed API `Draft` action** is an official, non-publishing way to create a Seller Hub draft, but the current source-import implementation contains two separate compliance risks: it falls back to automated HTML retrieval of public eBay pages, and it carries over third-party listing images and descriptions by default.

The goal remains feasible. A compliant-first version should use authorized APIs only, disable direct page scraping, and require the seller to supply or affirm rights to the content and the physical item before the Feed API submission. Once those safeguards are in place, the actual Feed API draft submission is the appropriate eBay-supported mechanism for creating a true Seller Hub draft.[1] [2]

| Workflow element | Current status | Assessment | Required condition before a live draft |
|---|---|---|---|
| Feed API `FX_LISTING` task with `Draft` action | Implemented | **Conditionally permitted** | Valid user OAuth, official Seller Hub template, truthful row data, and explicit seller initiation. |
| Unpublished Inventory API offer | Replaced | **Not suitable for this goal** | It is not a native Seller Hub draft, so it should remain retired for this feature. |
| Browse API retrieval of an item reference | Implemented | **Conditionally permitted** | API credentials and license terms must permit the call; retrieved content is not automatically cleared for republication. |
| Direct HTML retrieval fallback | Implemented | **Not acceptable without eBay’s express permission** | Remove it. The User Agreement prohibits automated scraping/data extraction unless eBay expressly permits it. |
| Reuse of a third-party listing’s photos/description | Implemented by default | **Not acceptable by default** | Strip it unless it is approved eBay catalog content or the seller confirms they own/are licensed to use it. |
| Used/refurbished/flawed-item photos | Not enforced | **Requires a safeguard** | Require photos of the seller’s actual item before submitting a draft. |
| Human review before draft submission | Implemented | **Necessary but insufficient** | Preserve it and add explicit seller attestations for ownership, rights, condition, location, and fulfillment. |

## What eBay explicitly permits

The [Seller Hub Feed API documentation](https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html) documents the `Draft` action in the **Create new drafts** template. It is specifically designed to create a Seller Hub draft rather than an active listing. The documented lifecycle is to create an `FX_LISTING` task, upload the CSV, then poll for processing status and result information. This supports the native-draft part of the feature when the user has authorized the application and the submitted data is compliant.[1]

The [API License Agreement](https://developer.ebay.com/join/api-license-agreement) permits use of eBay APIs to facilitate users’ use of eBay services, subject to the developer terms and the then-current eBay policies. OAuth is the documented mechanism by which a user authorizes an application to act using the selected scope.[2] [3]

## What blocks a go-ahead for the current implementation

The present importer uses a public HTML fallback when the Browse API does not return a listing. eBay’s current [User Agreement](https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259) prohibits robots, spiders, scrapers, data-mining tools, data-gathering/extraction tools, and other automated means to access eBay Services without prior express permission. The public-page fallback falls within that restriction. It should be removed rather than relied on for ended or unavailable listings.[4]

The importer also carries source photos and descriptions into a new draft. eBay’s [images, videos and text policy](https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240) tells sellers to use their own images and descriptions, while allowing eBay catalog images and product details. It says copying publicly available material from other websites can be copyright infringement. The associated intellectual-property guidance prohibits copying third-party photos, images, videos, or creative text without permission. Merely placing the copied material into a draft does not establish the seller’s right to reuse it.[5] [6]

Finally, eBay requires descriptions, conditions, categories, and item specifics to be accurate. The selling practices policy requires the item to be in the seller’s inventory or covered by an existing third-party fulfillment agreement and requires actual-item photos for used, refurbished, or flawed goods. A copied source listing cannot prove these facts for the seller’s item.[7] [8]

## Required compliant-first changes

The following changes are necessary before a real native Seller Hub draft should be created from an arbitrary pasted link.

| Safeguard | Required behavior | Why it matters |
|---|---|---|
| Remove public HTML fallback | If the official Browse API cannot return the reference, stop and explain that the listing cannot be imported through the compliant path. | Avoids prohibited automated page scraping.[4] |
| Treat imports as references, not reusable listing content | Use official API data only to assist review; do not automatically transfer a third-party description or image URL into the outgoing draft. | Avoids unverified reuse of protected content.[5] [6] |
| Require original/authorized content | Before submission, require seller-supplied photos and description, or an affirmative selection that the content is eBay catalog content or the seller owns/has permission to use it. | Enforces the content-rights boundary.[5] [6] |
| Enforce actual-item photos for non-new items | Block native-draft submission for used, refurbished, or flawed items unless the seller has supplied photos of the actual item. | Meets eBay’s stated photo expectation for those conditions.[7] |
| Add an explicit attestation | Require the seller to confirm that they have the item or a fulfillment agreement; that the content can be used; and that condition, specifics, location, price, and terms are accurate. | Keeps seller responsibility visible at the actual decision point.[4] [7] [8] |
| Preserve explicit submit + task verification | Keep the current user-triggered submission and show `submitted`, `processing`, `completed`, or `failed` based on eBay task status. Never publish. | Matches the documented Feed API lifecycle and prevents false-success language.[1] |

## Bottom line

**The native Feed API draft mechanism is allowed in principle, but the current “paste any listing link and reuse its content” workflow is not safe to approve as-is.** I recommend correcting the importer and content safeguards first. After that correction, the first test can submit one manually reviewed, rights-cleared listing as a native Seller Hub draft without publishing it.

For a binding interpretation of your particular seller account, content rights, and eBay developer authorization, seek confirmation from [eBay Seller Help](https://www.ebay.com/sellerhelp) or eBay Developer Support before relying on this assessment.

## References

[1]: https://developer.ebay.com/api-docs/sell/static/feed/fx-feeds-overview.html "eBay Sell Feed API — Seller Hub listing feeds overview"
[2]: https://developer.ebay.com/join/api-license-agreement "eBay Developers Program API License Agreement"
[3]: https://developer.ebay.com/develop/guides-v2/authorization "eBay Developer OAuth authorization guide"
[4]: https://www.ebay.com/help/policies/member-behaviour-policies/user-agreement?id=4259 "eBay User Agreement"
[5]: https://www.ebay.com/help/policies/listing-policies/images-text-policy?id=4240 "eBay Images, videos and text policy"
[6]: https://www.ebay.com/help/policies/listing-policies/selling-policies/intellectual-property-vero-program?id=4349 "eBay intellectual-property policy"
[7]: https://www.ebay.com/help/policies/selling-policies/selling-practices-policy?id=4346 "eBay Selling practices policy"
[8]: https://www.ebay.com/help/policies/listing-policies/item-description-policy?id=4372 "eBay Item description policy"
