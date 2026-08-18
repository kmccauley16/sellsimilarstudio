type ErrorWithCode = {
  code?: unknown;
  cause?: unknown;
};

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const value = error as ErrorWithCode;
  if (typeof value.code === "string" || typeof value.code === "number") return String(value.code);
  if (value.cause && typeof value.cause === "object") {
    const cause = value.cause as ErrorWithCode;
    if (typeof cause.code === "string" || typeof cause.code === "number") return String(cause.code);
  }
  return undefined;
}

/**
 * Records operational context without logging exception messages, SQL, OAuth codes, or tokens.
 */
export function logRedactedEbayFailure(
  operation: string,
  error: unknown,
  context: Record<string, string | number | boolean | undefined> = {},
) {
  const code = errorCode(error);
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined),
  );
  // Use a structured, non-secret log message that remains visible in production diagnostics.
  console.log("[eBay] operation failed", { operation, ...safeContext, ...(code ? { code } : {}) });
}

/**
 * This is intentionally invariant: internal/provider error text can contain OAuth tokens or SQL parameters.
 */
export function safeEbayAuthorizationMessage() {
  return "eBay authorization could not be completed securely. Please start authorization again.";
}

export function safeEbayAuthorizationDeclinedMessage() {
  return "eBay authorization was not completed. No eBay connection was saved.";
}
