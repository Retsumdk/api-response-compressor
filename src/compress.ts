/**
 * Compression primitives built on Node's `zlib`.
 *
 * Zero external dependencies. Wraps gzip / deflate / brotli with configurable
 * levels and quality, and exposes the `Content-Encoding` token for each.
 */

import {
  brotliCompress,
  constants as zlibConstants,
  brotliCompressSync,
  deflateSync,
  gzipSync,
  type BrotliOptions,
  type ZlibOptions,
} from "node:zlib";
import type { Encoding } from "./negotiation.js";

export interface CompressionOptions {
  /** zlib level 0-9 for gzip/deflate. Default: zlib default (6). */
  level?: number;
  /** brotli quality 0-11. Default: 4 (fast, good ratio). */
  brotliQuality?: number;
}

export const CONTENT_ENCODING: Record<Exclude<Encoding, "identity">, string> = {
  br: "br",
  gzip: "gzip",
  deflate: "deflate",
};

/** True when the encoding produces a compressed wire representation. */
export function isCompressedEncoding(encoding: Encoding): boolean {
  return encoding !== "identity";
}

/**
 * Compress a Buffer/string synchronously. Returns the compressed Buffer, or the
 * input unchanged when `encoding` is `identity`.
 */
export function compressSync(
  data: Buffer | string,
  encoding: Encoding,
  options: CompressionOptions = {},
): Buffer {
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  switch (encoding) {
    case "identity":
      return input;
    case "gzip":
      return gzipSync(input, zlibOptions(options));
    case "deflate":
      return deflateSync(input, zlibOptions(options));
    case "br":
      return brotliCompressSync(input, brotliOptions(options));
  }
}

/** Async variant of {@link compressSync}. */
export function compress(
  data: Buffer | string,
  encoding: Encoding,
  options: CompressionOptions = {},
): Promise<Buffer> {
  const input = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
  if (encoding === "identity") return Promise.resolve(input);
  return new Promise((resolve, reject) => {
    const done = (err: Error | null, buf?: Buffer) =>
      err ? reject(err) : resolve(buf as Buffer);
    if (encoding === "br") {
      brotliCompress(input, brotliOptions(options), done);
    } else {
      const fn = encoding === "gzip" ? gzipSync : deflateSync;
      try {
        resolve(fn(input, zlibOptions(options)));
      } catch (err) {
        reject(err);
      }
    }
  });
}

function zlibOptions(options: CompressionOptions): ZlibOptions {
  return options.level !== undefined ? { level: options.level } : {};
}

function brotliOptions(options: CompressionOptions): BrotliOptions {
  return options.brotliQuality !== undefined
    ? { params: { [zlibConstants.BROTLI_PARAM_QUALITY]: options.brotliQuality } }
    : {};
}
