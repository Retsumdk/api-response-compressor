/**
 * HTTP content-negotiation for `Accept-Encoding`.
 *
 * Parses the header, honours `q` (quality) weights and wildcards, and picks the
 * best encoding from the server's supported set. Implements RFC 9110 §12.5.3
 * semantics: `identity` is always acceptable unless explicitly excluded, and a
 * client that sends no header is treated as `identity` (no compression).
 */

export type Encoding = "br" | "gzip" | "deflate" | "identity";

export interface NegotiationOptions {
  /** Encodings this server supports, in best-first. Default: br, gzip, deflate, identity. */
  supported?: Encoding[];
}

const DEFAULT_SUPPORTED: Encoding[] = ["br", "gzip", "deflate", "identity"];

/** Parse `Accept-Encoding` into a map of encoding -> q-value (0..1). */
export function parseAcceptEncoding(
  header: string | null | undefined,
): Map<string, number> {
  const result = new Map<string, number>();
  if (!header) return result;

  for (const part of header.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // "gzip;q=0.8" or "br" or "*;q=0"
    const [token, ...params] = trimmed.split(";");
    const name = token?.trim().toLowerCase() ?? "";
    if (!name) continue;

    let q = 1;
    for (const param of params) {
      const [key, value] = param.split("=");
      if (key?.trim().toLowerCase() === "q") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) q = Math.min(1, Math.max(0, parsed));
      }
    }
    result.set(name, q);
  }
  return result;
}

/**
 * Choose the best encoding for a request.
 *
 * Returns `null` when the client does not accept any supported encoding (or
 * explicitly excludes everything), in which case the caller should respond
 * `406 Not Acceptable` or fall back to `identity` per policy.
 */
export function negotiate(
  acceptEncoding: string | null | undefined,
  options: NegotiationOptions = {},
): Encoding | null {
  const supported = options.supported ?? DEFAULT_SUPPORTED;
  const header = parseAcceptEncoding(acceptEncoding);

  // No header (or empty) => identity, no compression.
  if (header.size === 0) return "identity";

  // Expand wildcard "*" to all supported encodings not otherwise listed.
  for (const enc of supported) {
    if (!header.has(enc)) {
      const wildcard = header.get("*");
      if (wildcard !== undefined) header.set(enc, wildcard);
    }
  }

  // Pick the best explicitly-listed supported encoding. `identity` is treated
  // as the fallback, not a competitor: a client that lists `br;q=0.5` prefers
  // brotli even though identity is implicitly acceptable at q=1.
  let best: Encoding | null = null;
  let bestQ = -1;
  for (const enc of supported) {
    if (enc === "identity") continue;
    const q = header.get(enc) ?? 0;
    if (q <= 0) continue;
    if (q > bestQ) {
      bestQ = q;
      best = enc;
    }
  }
  if (best) return best;

  // No supported encoding is acceptable — fall back to identity unless the
  // client explicitly excluded it (identity;q=0).
  const identityQ = header.get("identity") ?? 1;
  return identityQ > 0 ? "identity" : null;
}
