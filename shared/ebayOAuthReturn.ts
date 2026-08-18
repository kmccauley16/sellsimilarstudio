export type EbayOAuthReturn =
  | { kind: "accepted"; code: string; state: string }
  | { kind: "declined" }
  | { kind: "none" };

/**
 * Classifies only the safe control-flow fields from an OAuth return.
 * Provider error descriptions are deliberately never returned to callers.
 */
export function parseEbayOAuthReturn(search: string): EbayOAuthReturn {
  const params = new URLSearchParams(search);
  const code = params.get("code");
  const state = params.get("state");

  // An explicit provider error always represents a declined/failed consent result.
  // Handle it first so query-string injection cannot route a declined return into
  // the authorization-completion path, even if code/state values are also present.
  if (params.has("error")) return { kind: "declined" };
  if (code && state) return { kind: "accepted", code, state };
  return { kind: "none" };
}
