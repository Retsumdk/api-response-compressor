/**
 * The `ResponseCompressor` — content negotiation + compression decision logic.
 *
 * Decides *whether* and *how* to compress an HTTP response body based on the
 * client's `Accept-Encoding`, the response `Content-Type`, and its size, then
 * produces the compressed body and the headers that must be set.
 */

import { compressSync, isCompressedEncoding } from "./compress";
import { negotiate, type Encoding } from "./negotiation";

export interface CompressorOptions {
  /**
   * Minimum uncompressed byte size before compression is worthwhile.
   * Responses smaller than this are passed through as `identity`.
   * Default: 1024.
   */
  threshold?: number;
  /** Encodings offered, in preference order. Default: `["br","gzip","deflate"]`. */
  encodings?: Encoding[];
  /** zlib level for gzip/deflate. */
  level?: number;
  /** brotli quality 0-11. */
  brotliQuality?: number;
  /**
   * Content-Types that are compressible. Defaults to the common text/JSON/XML
   * family. Each entry is a substring or a RegExp; a `+json`/`+xml` suffix is
   * also honoured automatically.
   */
  compressibleTypes?: Array<string | RegExp>;
  /**
   * When true, always set `Vary: Accept-Encoding` even if no compression is
   * applied (recommended for correct caching). Default: true.
   */
  vary?: boolean;
}

export interface CompressionDecision {
  /** Encoding that will be applied, or `identity` when skipped. */
  encoding: Encoding;
  /** True when the body will actually be compressed. */
  compressed: boolean;
  /** Reason the body was not compressed (only when `compressed` is false). */
  reason?: string;
}

export interface CompressResult {
  /** The (possibly compressed) body. */
  body: Buffer;
  /** Headers that must be set on the response. */
  headers: Record<string, string>;
  decision: CompressionDecision;
}

const DEFAULT_COMPRESSIBLE: Array<string | RegExp> = [
  "text/",
  "application/json",
  "application/xml",
  "application/javascript",
  "application/x-javascript",
  "application/graphql",
  "application/manifest+json",
  "application/vnd.api+json",
  "image/svg+xml",
  "application/x-www-form-urlencoded",
  "application/wasm",
];

/** Content-Types that are already compressed and must never be re-compressed. */
const ALREADY_COMPRESSED: Array<string | RegExp> = [
  "gzip",
  "zip",
  "compress",
  "br",
  "brotli",
  "image/",
  "video/",
  "audio/",
  "application/pdf",
  "application/zip",
  "application/x-7z-compressed",
  "application/x-rar-compressed",
  "application/vnd.ms-fontobject",
  "application/font-woff",
  "font/",
  "application/x-font",
];

function matches(list: Array<string | RegExp>, value: string): boolean {
  const lower = value.toLowerCase();
  for (const entry of list) {
    if (typeof entry === "string") {
      if (lower.includes(entry.toLowerCase())) return true;
    } else if (entry.test(lower)) {
      return true;
    }
  }
  return false;
}

export interface ResolvedOptions {
  threshold: number;
  encodings: Encoding[];
  level?: number;
  brotliQuality?: number;
  compressibleTypes: Array<string | RegExp>;
  vary: boolean;
}

export class ResponseCompressor {
  readonly options: ResolvedOptions;

  constructor(options: CompressorOptions = {}) {
    this.options = {
      threshold: options.threshold ?? 1024,
      encodings: options.encodings ?? ["br", "gzip", "deflate"],
      level: options.level,
      brotliQuality: options.brotliQuality,
      compressibleTypes: options.compressibleTypes ?? DEFAULT_COMPRESSIBLE,
      vary: options.vary ?? true,
    };
  }

  /** Pick the best encoding the client accepts, or `identity` if none. */
  negotiate(acceptEncoding: string | null | undefined): Encoding {
    return negotiate(acceptEncoding, { supported: this.options.encodings }) ?? "identity";
  }

  /** True when a `Content-Type` is worth compressing. */
  isCompressibleType(contentType: string | null | undefined): boolean {
    if (!contentType) return true; // unknown type — assume compressible
    const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
    if (matches(ALREADY_COMPRESSED, type)) return false;
    if (matches(this.options.compressibleTypes, type)) return true;
    // Honour structured-syntax suffixes like `application/ld+json`.
    return /\+json$|\+xml$/.test(type);
  }

  /** Decide whether/how to compress a body of `contentLength` bytes. */
  decide(
    encoding: Encoding,
    contentType: string | null | undefined,
    contentLength: number | undefined,
  ): CompressionDecision {
    if (!isCompressedEncoding(encoding)) {
      return { encoding, compressed: false, reason: "client does not accept a compression encoding" };
    }
    if (contentLength !== undefined && contentLength < this.options.threshold) {
      return { encoding: "identity", compressed: false, reason: `body below ${this.options.threshold}-byte threshold` };
    }
    if (!this.isCompressibleType(contentType)) {
      return { encoding: "identity", compressed: false, reason: "content-type is not compressible" };
    }
    return { encoding, compressed: true };
  }

  /**
   * Compress a response body. Returns the compressed body plus the headers to
   * set (`Content-Encoding`, `Vary`, `Content-Length`).
   */
  compress(
    body: Buffer | string,
    opts: {
      acceptEncoding?: string | null;
      contentType?: string | null;
      contentLength?: number;
    } = {},
  ): CompressResult {
    const encoding = this.negotiate(opts.acceptEncoding);
    const decision = this.decide(encoding, opts.contentType, opts.contentLength);

    const headers: Record<string, string> = {};
    if (this.options.vary) headers["Vary"] = "Accept-Encoding";

    if (!decision.compressed) {
      const out = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
      headers["Content-Length"] = String(out.length);
      return { body: out, headers, decision };
    }

    const compressed = compressSync(body, decision.encoding, {
      level: this.options.level,
      brotliQuality: this.options.brotliQuality,
    });
    headers["Content-Encoding"] = decision.encoding;
    headers["Content-Length"] = String(compressed.length);
    return { body: compressed, headers, decision };
  }
}

/** Convenience factory. */
export function createCompressor(options: CompressorOptions = {}): ResponseCompressor {
  return new ResponseCompressor(options);
}
