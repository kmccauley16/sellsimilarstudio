# eBay Developer Console Validation Record

**Date:** 2026-07-30  
**Mode:** Read-only inspection; no eBay Developer Console settings were changed.

## Observed Keyset State

The signed-in eBay Developers Program account contains one **Production** application keyset whose displayed application name matches this project’s intended eBay integration. The console indicates that a Production client identifier, developer identifier, and certificate identifier are present. No Sandbox keyset is configured.

> **Redaction rule:** This record intentionally does not contain client IDs, developer IDs, certificate IDs, user tokens, redirect identifiers, addresses, screenshots, or any other credential material.

## Next Read-Only Checks

The remaining validation steps are to inspect the Production **User Tokens** configuration and compare its OAuth redirect identifier and enabled scopes with the deployed application’s authorization request. Those checks will be recorded only as match or mismatch results and redacted fingerprints.

## Safety Boundary

This inspection does not rotate credentials, change OAuth scopes, alter redirect settings, create tokens, submit listings, or publish items.

## Production User Tokens Observation

The Production **User Tokens (eBay Sign-In)** page is available for the project application. The console exposes the OAuth (new security) flow and states that a branded eBay sign-in redirect URL can be configured for applications that serve other eBay members. The initial page view did not expose the configured redirect details; no token was created, revoked, or viewed.

## Redirect Detail Limitation

The current Production User Tokens view did not expose any redirect-management control or configured redirect value through its rendered controls. The page confirms the OAuth user-token capability but does not provide a non-destructive, visible redirect fingerprint in this session. A comparison can still be performed from the deployed authorization request and, if needed, by the seller confirming the configured redirect name in the console.

## Verified Production Redirect Configuration

A read-only inspection of the Production OAuth settings shows an existing branded eBay sign-in configuration for this application. Its display title matches the project name. Its privacy-policy URL, authorization-accepted URL, and authorization-declined URL all use the deployed application origin; both authorization outcomes route to the application’s `/connection` screen. The console therefore matches the implemented decline-safe return flow. No redirect URL, branding value, scope, token, or key setting was edited.

## Redacted Match Result

The deployed Production client-identifier fingerprint matches the client identifier displayed by the active Production keyset. The deployed application is configured for Production, has a redirect identifier configured, and has token-encryption material configured. The raw identifier and redirect name are deliberately excluded from this record.

## Verified Production OAuth Scopes

The Production application’s eBay Developer Console shows that the authorization-code grant has been granted the scopes required by the deployed workflow: the base public-data scope, `sell.inventory`, `sell.account`, and `commerce.identity.readonly`. The console’s scope dialog also confirms the application has additional scopes available; the deployed authorization request intentionally asks only for the minimum scopes required by the implemented workflow.

**Console source inspected:** `https://developer.ebay.com/my/auth/?env=production&index=0` (authenticated, read-only).

## Redirect-Name Comparison

A non-reversible fingerprint comparison found a configured name-like value in the console’s RuName section whose fingerprint matches the deployed `EBAY_REDIRECT_URI_NAME` fingerprint. This confirms the deployed authorization request targets the configured Production redirect entry without recording the raw redirect name.
