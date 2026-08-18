# eBay US Production Setup

Sell Similar Studio is a private, draft-first web application. It imports a sold eBay US listing into an editable review and creates an **unpublished Inventory API offer**. The application does not call eBay's publish-offer endpoint.

## 1. Required production credentials

Create a Production keyset in the [eBay Developers Program](https://developer.ebay.com/my/keys) and configure these application secrets:

| Application variable | eBay value | Notes |
|---|---|---|
| `EBAY_CLIENT_ID` | Production App ID / Client ID | Use the Production value, not Sandbox. |
| `EBAY_CLIENT_SECRET` | Production Cert ID / Client Secret | Enter only through the application's secure secret form. Rotate any secret shared in ordinary chat. |
| `EBAY_REDIRECT_URI_NAME` | Production OAuth RuName | This is eBay's generated redirect-name value, not a normal URL. |
| `EBAY_TOKEN_ENCRYPTION_KEY` | A private 32+ character random value | Used only to encrypt stored eBay access and refresh tokens. |
| `EBAY_ENVIRONMENT` | `production` | Optional because Production is the application default. |

The Dev ID is not used by this OAuth and Sell API integration.

## 2. OAuth redirect configuration

In the Production keyset, open **User Tokens (eBay Sign-in)** and create or edit the OAuth redirect entry used by `EBAY_REDIRECT_URI_NAME`.

After the web app is published, set the redirect entry's **Auth Accepted URL** to:

```text
https://YOUR-PUBLISHED-DOMAIN/connection
```

Use the same published URL for any privacy-policy or declined-authorization destination eBay requires until dedicated legal pages are added. The application reads eBay's authorization `code` and signed `state` query parameters on `/connection`, exchanges the code on the server, and removes them from the browser address afterward.

## 3. OAuth scopes

The application requests only the scopes required for seller identity, Inventory API offers, business policies, and inventory locations:

```text
https://api.ebay.com/oauth/api_scope
https://api.ebay.com/oauth/api_scope/sell.inventory
https://api.ebay.com/oauth/api_scope/sell.account
```

The marketplace is fixed to `EBAY_US`, currency to `USD`, and content language to `en-US`.

## 4. Marketplace Account Deletion compliance

Do not claim the exemption stating that the application does not persist eBay data. Sell Similar Studio securely stores encrypted OAuth tokens, the immutable seller ID, imported listing reviews, and draft references.

After publication:

1. Sign in to Sell Similar Studio and open **eBay account**.
2. In **Production activation**, copy the displayed HTTPS endpoint and verification token.
3. In the eBay developer console, open **Alerts & Notifications** and select **Marketplace Account Deletion**.
4. Leave **Exempted from Marketplace Account Deletion** turned off.
5. Enter an operational email for endpoint-failure notifications.
6. Paste the displayed endpoint. Its path is:

```text
https://YOUR-PUBLISHED-DOMAIN/api/ebay/marketplace-account-deletion
```

7. Paste the displayed verification token and save.
8. Use eBay's test-notification control after the endpoint challenge succeeds.

The endpoint implements eBay's SHA-256 challenge response, validates signed notifications against eBay's official public key, acknowledges valid events, and deletes the matching seller connection and related stored records idempotently.

## 5. First private trial

1. Publish the web app and complete Sections 1–4.
2. Sign in to Sell Similar Studio.
3. Open **eBay account**, connect the eBay US seller account, and select fulfillment, payment, return, and inventory-location settings.
4. Paste a sold `ebay.com/itm/...` link on **New draft**.
5. Review the imported title, description, condition, category, price, quantity, item specifics, and selected photos.
6. Choose **Create eBay draft**.
7. Confirm the history row uses the exact status **draft created** and records the eBay offer ID.
8. Open the filtered Seller Hub drafts view and confirm the offer remains unpublished.

## Operational notes

- Imported third-party descriptions and photos may be protected by copyright or eBay policy. Use only content the seller owns or is authorized to reuse.
- eBay may require a valid category, category-specific condition ID, seller business policies, and an inventory location before accepting an offer.
- A history link opens a filtered Seller Hub drafts view; eBay does not guarantee a stable offer-specific Seller Hub deep link. The exact offer ID remains stored and displayed for identification.
- Disconnecting eBay removes the saved connection and encrypted tokens. Verified account-deletion notifications remove the matched connection and related application records.
